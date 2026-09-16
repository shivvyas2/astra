import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

/// Answers the questions that are lookups, on the device, for nothing.
///
/// A large share of what people ask Sanchara is not interpretation at all —
/// "where's my Saturn", "what's in my 7th", "which dasha am I in" — and every
/// one of those was a paid Claude call answering from a chart the phone could
/// have read itself. This routes them to Apple's on-device model instead, hands
/// it the chart through a tool, and only escalates when the question actually
/// asks for meaning.
///
/// Three things make it work, all of them learned the hard way and all of them
/// load-bearing:
///
/// 1. **Framing.** The on-device model refuses astrology outright. Everything
///    it is shown here is framed as a reference table of positions — see
///    `ChartFacts` — and the instructions never name the subject.
/// 2. **A tool, not a stuffed prompt.** Putting the whole chart in the prompt
///    invites the model to invent rows. A tool makes the lookup a retrieval:
///    if the table has no answer, the tool says so and the model reports that.
/// 3. **Escalation stays cheap and visible.** Anything interpretive returns
///    `nil` and goes to Claude. The user is always told which answered, and can
///    always ask for the full reading anyway.
@MainActor
final class OnDeviceReasoner {
    /// What the router decided about a question.
    enum Route: Equatable {
        /// Answered here. Costs nothing and works offline.
        case answered(String)
        /// Needs the real reading. The caller sends it to `/api/chat`.
        case escalate
    }

    private let chart: NatalChart
    private var facts: ChartFacts { ChartFacts(chart: chart) }

    init(chart: NatalChart) {
        self.chart = chart
    }

    static var isAvailable: Bool { SuggestionEngine.isOnDeviceAvailable }

    /// Tries to answer from the chart. Returns `.escalate` whenever the answer
    /// would be anything more than a restatement of what is in the table.
    func route(_ question: String) async -> Route {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *), Self.isAvailable {
            // A question that names no part of the table cannot be a lookup, so
            // the cheap check runs before the model does.
            guard Self.mentionsTheTable(question) else { return .escalate }
            guard await isLookup(question) else { return .escalate }
            if let answer = await answer(question) { return .answered(answer) }
        }
        #endif
        return .escalate
    }

    /// Does the question name a body, a house, or the dasha at all? Purely a
    /// filter to avoid spending a model call on "should I take the job".
    nonisolated static func mentionsTheTable(_ question: String) -> Bool {
        let lower = question.lowercased()
        if ChartFacts.bodyNames.contains(where: { lower.contains($0.lowercased()) }) { return true }
        if ChartFacts.sectionNumber(in: lower) != nil { return true }
        let periodWords = ["dasha", "mahadasha", "antardasha", "period", "lagna", "ascendant",
                           "rising", "nakshatra", "moon sign", "sun sign", "rashi"]
        return periodWords.contains { lower.contains($0) }
    }

    #if canImport(FoundationModels)

    /// Asks the model whether this is a retrieval or a request for meaning.
    ///
    /// A `@Generable Bool` means constrained decoding: the answer is always one
    /// of two values, never prose that has to be parsed.
    // Not `private`: @Generable expands into a peer declaration that has to be
    // able to see the type it was attached to.
    @available(iOS 26.0, *)
    @Generable
    struct Classification {
        @Guide(
            description: """
                True when the question only asks for a value that is already written in a reference \
                table — a position, a number, a name, a date, a range. False when it asks what \
                something means, what to do, what will happen, or for any opinion or advice.
                """
        )
        var isRetrieval: Bool
    }

    @available(iOS 26.0, *)
    private func isLookup(_ question: String) async -> Bool {
        let session = LanguageModelSession(
            model: SystemLanguageModel(guardrails: .permissiveContentTransformations),
            instructions: "You sort incoming questions into two buckets. You never answer them."
        )
        do {
            let response = try await session.respond(
                to: "Question: \(question)",
                generating: Classification.self,
                options: GenerationOptions(sampling: .greedy)
            )
            return response.content.isRetrieval
        } catch {
            // A refusal or an unavailable model is not an error worth surfacing:
            // the question simply goes to Claude, which is where it went before.
            return false
        }
    }

    @available(iOS 26.0, *)
    private func answer(_ question: String) async -> String? {
        let tool = TableLookupTool(facts: facts)
        let session = LanguageModelSession(
            model: SystemLanguageModel(guardrails: .permissiveContentTransformations),
            tools: [tool],
            instructions: """
                You answer questions about one person's reference table by calling \
                lookupTableEntry and restating exactly what it returns.

                Rules you always follow:
                - Call the tool before answering. Never answer from memory.
                - Report only values the tool returned. If it returns nothing, say the table \
                  does not record that, and stop.
                - Never explain what an entry means, what it predicts, or what the person \
                  should do. You restate records; you do not interpret them.
                - Two or three sentences. Plain language, no lists, no headings.
                """
        )
        do {
            let response = try await session.respond(
                to: question,
                options: GenerationOptions(temperature: 0.3, maximumResponseTokens: 220)
            )
            let text = response.content.trimmingCharacters(in: .whitespacesAndNewlines)
            // An answer that never consulted the table is a guess. Drop it.
            guard !text.isEmpty, tool.wasCalled else { return nil }
            return text
        } catch {
            #if DEBUG
            print("on-device lookup unavailable: \(error)")
            #endif
            return nil
        }
    }
    #endif
}

#if canImport(FoundationModels)

/// The chart, exposed to the on-device model as a table it can query.
///
/// Tool calling rather than a stuffed prompt is what keeps the answers honest:
/// the model has to ask for a row, and a row it did not get is a row it cannot
/// report. `wasCalled` is checked afterwards so an answer composed without a
/// single lookup is thrown away rather than shown.
@available(iOS 26.0, *)
final class TableLookupTool: Tool, @unchecked Sendable {
    let name = "lookupTableEntry"
    let description = """
        Looks up rows in the person's fixed reference table. Call it with a body name to get one \
        row, a section number to list everything filed under it, currentPeriod to get the period \
        rows, or wholeTable when the question spans the whole thing.
        """

    @Generable
    struct Arguments {
        @Guide(
            description: "One entry name to look up.",
            .anyOf(ChartFacts.bodyNames)
        )
        var body: String?

        @Guide(description: "A section number from 1 to 12.", .range(1...12))
        var section: Int?

        @Guide(description: "True to return the current period rows.")
        var currentPeriod: Bool?

        @Guide(description: "True to return the whole table, when no narrower lookup fits.")
        var wholeTable: Bool?
    }

    private let facts: ChartFacts
    /// Read on the main actor after the session finishes, written on whatever
    /// executor the framework calls the tool from — hence the lock.
    private let lock = NSLock()
    private var called = false

    var wasCalled: Bool {
        lock.lock(); defer { lock.unlock() }
        return called
    }

    init(facts: ChartFacts) {
        self.facts = facts
    }

    func call(arguments: Arguments) async throws -> String {
        lock.lock(); called = true; lock.unlock()

        var rows: [String] = []
        if let body = arguments.body, let row = facts.body(named: body) { rows.append(row) }
        if let section = arguments.section, let row = facts.section(section) { rows.append(row) }
        if arguments.currentPeriod == true, let row = facts.currentPeriod() { rows.append(row) }
        if arguments.wholeTable == true { rows.append(facts.everything()) }

        // Every lookup gets the header, because "which section is that" is the
        // follow-up to almost every row and it costs three lines to pre-empt.
        if rows.isEmpty {
            return "The table has no row matching that request. \(facts.header())"
        }
        return ([facts.header()] + rows).joined(separator: "\n")
    }
}
#endif
