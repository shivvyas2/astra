import Foundation

// The pure half of on-device memory: what the on-device model is shown, how
// its notes become a `POST /api/memory/ingest` body, and the local answer to
// "what do you know about me?". Nothing here touches the model or the
// network, so all of it is unit-tested. The model call is `OnDeviceMemory`.

/// The topics a conversation or a prediction can be about. Mirrors `TOPICS`
/// in `lib/memory/types.ts` and the check constraint in 0009_memory.sql.
enum MemoryTopic: String, CaseIterable, Hashable {
    case career, relationships, money, health, home, family, children, travel, education, general

    var label: String {
        switch self {
        case .career: "Career"
        case .relationships: "Relationships"
        case .money: "Money"
        case .health: "Health"
        case .home: "Home"
        case .family: "Family"
        case .children: "Children"
        case .travel: "Travel"
        case .education: "Study"
        case .general: "General"
        }
    }
}

/// The facts the on-device model may refer to, under short references
/// (`F1`, `F2`…) instead of their UUIDs. A small model copies "F3" reliably;
/// it does not copy a UUID reliably, and it cannot invent one of ours either.
struct MemoryContext {
    /// The on-device model has a 4,096-token window; this many facts fit
    /// comfortably beside the reading.
    static let maxFacts = 15

    let facts: [UserFact]

    init(facts: [UserFact]) {
        self.facts = Array(facts.sorted { $0.updatedAt > $1.updatedAt }.prefix(Self.maxFacts))
    }

    func ref(at index: Int) -> String { "F\(index + 1)" }

    /// The fact id behind a reference, or nil for one that was never shown.
    func id(forRef raw: String) -> String? {
        let ref = raw.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard ref.hasPrefix("F"), let n = Int(ref.dropFirst()), n >= 1, n <= facts.count else { return nil }
        return facts[n - 1].id
    }

    /// "F1 (work) Works as a nurse in Pune", one per line.
    var listing: String {
        guard !facts.isEmpty else { return "(none yet)" }
        return facts.enumerated()
            .map { "\(ref(at: $0.offset)) (\($0.element.category.rawValue)) \(String($0.element.fact.prefix(120)))" }
            .joined(separator: "\n")
    }
}

/// What the on-device model proposed, as plain values. `OnDeviceMemory`
/// copies its `@Generable` output into this so the mapping below can be
/// tested without the model.
struct ProposedNotes: Equatable {
    struct Fact: Equatable {
        var text: String
        var category: String
        var confidence: String
        /// A reference like "F2", or empty.
        var replaces: String
    }

    struct Event: Equatable {
        var claim: String
        var topic: String
        var firstMonth: String
        var lastMonth: String
        var likelihood: String
    }

    var facts: [Fact] = []
    var noLongerTrue: [String] = []
    var summary = ""
    var topics: [String] = []
    var events: [Event] = []
}

/// The body of `POST /api/memory/ingest`. The server validates all of it
/// again; this only avoids sending what it would certainly refuse.
struct MemoryIngest: Encodable, Equatable {
    struct Add: Encodable, Equatable { let fact: String; let category: String; let confidence: String }
    struct Update: Encodable, Equatable { let id: String; let fact: String }
    struct Facts: Encodable, Equatable { var add: [Add]; var update: [Update]; var remove: [String] }
    struct Prediction: Encodable, Equatable {
        let claim: String
        let topic: String
        let windowStart: String
        let windowEnd: String
        let confidence: String

        private enum CodingKeys: String, CodingKey {
            case claim, topic, confidence
            case windowStart = "window_start"
            case windowEnd = "window_end"
        }
    }

    let conversationId: String
    var facts: Facts
    var summary: String?
    var topics: [String]
    var predictions: [Prediction]

    var isEmpty: Bool {
        facts.add.isEmpty && facts.update.isEmpty && facts.remove.isEmpty && summary == nil && predictions.isEmpty
    }
}

enum MemoryPayloadBuilder {
    static let maxAdds = 8
    static let maxPredictions = 4
    static let maxTopics = 4
    static let summaryLimit = 600

    /// Turns the model's notes into an ingest body: references become ids
    /// (unknown ones dropped), text is trimmed to the server's limits, values
    /// outside the fixed lists are dropped or defaulted, and months are
    /// normalised to `yyyy-mm`.
    static func build(conversationId: String, notes: ProposedNotes, context: MemoryContext) -> MemoryIngest {
        var add: [MemoryIngest.Add] = []
        var update: [MemoryIngest.Update] = []
        for fact in notes.facts {
            let text = clean(fact.text)
            guard (3...280).contains(text.count) else { continue }
            if let id = context.id(forRef: fact.replaces) {
                if !update.contains(where: { $0.id == id }) { update.append(.init(id: id, fact: text)) }
                continue
            }
            guard add.count < maxAdds, !add.contains(where: { $0.fact.lowercased() == text.lowercased() }) else { continue }
            let category = FactCategory(rawValue: fact.category.lowercased())?.rawValue ?? FactCategory.other.rawValue
            let confidence = fact.confidence.lowercased() == "inferred" ? "inferred" : "stated"
            add.append(.init(fact: text, category: category, confidence: confidence))
        }

        var remove: [String] = []
        for ref in notes.noLongerTrue {
            guard let id = context.id(forRef: ref), !remove.contains(id), !update.contains(where: { $0.id == id }) else { continue }
            remove.append(id)
        }

        var topics: [String] = []
        for raw in notes.topics {
            guard let topic = MemoryTopic(rawValue: raw.lowercased()), !topics.contains(topic.rawValue) else { continue }
            topics.append(topic.rawValue)
            if topics.count == maxTopics { break }
        }

        var predictions: [MemoryIngest.Prediction] = []
        for event in notes.events {
            guard predictions.count < maxPredictions else { break }
            let claim = clean(event.claim)
            guard (8...280).contains(claim.count),
                  let start = normaliseMonth(event.firstMonth),
                  let end = normaliseMonth(event.lastMonth),
                  start <= end
            else { continue }
            let topic = MemoryTopic(rawValue: event.topic.lowercased())?.rawValue ?? MemoryTopic.general.rawValue
            let likelihood = ["likely", "possible", "unlikely"].contains(event.likelihood.lowercased())
                ? event.likelihood.lowercased() : "possible"
            predictions.append(.init(claim: claim, topic: topic, windowStart: start, windowEnd: end, confidence: likelihood))
        }

        return MemoryIngest(
            conversationId: conversationId,
            facts: .init(add: add, update: update, remove: remove),
            summary: summary(notes.summary),
            topics: topics,
            predictions: predictions
        )
    }

    /// `2027-03`, `2027-3`, `2027/03` and `2027-03-15` all become `2027-03`.
    /// Anything else — "next spring", "13/2027" — is nil.
    static func normaliseMonth(_ raw: String) -> String? {
        let parts = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            .split(whereSeparator: { $0 == "-" || $0 == "/" || $0 == "." })
        guard parts.count >= 2, parts[0].count == 4, let year = Int(parts[0]), let month = Int(parts[1]),
              (1900...2200).contains(year), (1...12).contains(month)
        else { return nil }
        return String(format: "%04d-%02d", year, month)
    }

    /// One paragraph, cut at a word boundary if the model ran long.
    static func summary(_ raw: String) -> String? {
        let text = clean(raw)
        guard text.count >= 3 else { return nil }
        guard text.count > summaryLimit else { return text }
        let cut = text.prefix(summaryLimit - 1)
        let atWord = cut.lastIndex(of: " ").map { cut[..<$0] } ?? cut
        return String(atWord) + "…"
    }

    /// What the on-device model is shown. Kept well inside its 4,096-token
    /// window, and — like every prompt to it — it never names the subject,
    /// which the on-device model will not discuss (see `SuggestionEngine`).
    static func modelInput(
        message: String,
        reply: String,
        previousSummary: String?,
        context: MemoryContext,
        today: String
    ) -> String {
        """
        Today is \(today).

        FACTS ALREADY NOTED:
        \(context.listing)

        CONVERSATION SO FAR:
        \(previousSummary.map { String($0.prefix(600)) } ?? "(just started)")

        THE PERSON'S NEWEST MESSAGE:
        \(String(message.trimmingCharacters(in: .whitespacesAndNewlines).prefix(600)))

        THE ADVISOR'S REPLY:
        \(String(reply.trimmingCharacters(in: .whitespacesAndNewlines).prefix(2000)))
        """
    }

    private static func clean(_ text: String) -> String {
        text.split(whereSeparator: \.isWhitespace).joined(separator: " ")
            .trimmingCharacters(in: CharacterSet(charactersIn: "\"'“”‘’ "))
            .replacingOccurrences(of: #"\.$"#, with: "", options: .regularExpression)
    }
}

/// "What do you know about me?" answered from what the phone already holds,
/// with no server call and no model call.
enum MemoryQuestion {
    private static let patterns = [
        #"^(so )?(what|how much) (do|does) (you|astrya) (know|remember)( about me| of me| about my life| about myself)?( so far)?$"#,
        #"^what have i (told|shared with) you( so far| about me| about myself| about my life)?$"#,
        #"^what do you have on me$"#,
    ]

    /// True for a question that only asks what is remembered. "What do you
    /// know about my career next year?" is a reading, not this.
    static func isAskingWhatIsKnown(_ text: String) -> Bool {
        let normalised = text.lowercased()
            .replacingOccurrences(of: "’", with: "'")
            .replacingOccurrences(of: #"[^a-z' ]"#, with: " ", options: .regularExpression)
            .split(separator: " ").joined(separator: " ")
        return patterns.contains { normalised.range(of: $0, options: .regularExpression) != nil }
    }

    static func answer(facts: [UserFact], conversations: Int, predictions: Int) -> String {
        var lines: [String]
        if facts.isEmpty {
            lines = [
                "I don't know anything about your life yet. Tell me about your work, relationships or plans in a reading and I'll remember it.",
            ]
        } else {
            lines = ["Here is what you've told me:"]
            for group in FactGrouping.groups(facts) {
                lines.append("")
                lines.append("**\(group.category.label)**")
                lines.append(contentsOf: group.facts.map { "- \($0.fact)" })
            }
        }
        var extras: [String] = []
        if conversations > 0 { extras.append(conversations == 1 ? "a note on one past conversation" : "notes on \(conversations) past conversations") }
        if predictions > 0 { extras.append(predictions == 1 ? "one prediction to check back on" : "\(predictions) predictions to check back on") }
        if !extras.isEmpty {
            lines.append("")
            lines.append("I also keep \(extras.joined(separator: " and ")).")
        }
        lines.append("")
        lines.append("You can see or delete any of it in Profile, under What Astrya knows.")
        return lines.joined(separator: "\n")
    }
}
