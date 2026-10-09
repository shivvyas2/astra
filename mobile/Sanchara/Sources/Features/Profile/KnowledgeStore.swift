import Foundation

/// The kind of thing a fact is about. Mirrors the check constraint in
/// `supabase/migrations/0008_user_facts.sql` and `lib/facts/types.ts`, in the
/// same display order.
enum FactCategory: String, CaseIterable, Decodable, Hashable {
    case work, relationships, family, health, money, home, goals, worries, other

    var label: String {
        switch self {
        case .work: "Work"
        case .relationships: "Relationships"
        case .family: "Family"
        case .health: "Health"
        case .money: "Money"
        case .home: "Home"
        case .goals: "Plans and goals"
        case .worries: "On your mind"
        case .other: "Other"
        }
    }
}

/// Something the user told Astrya about their own life in a reading, which
/// every later reading is given. Mirrors a row of `GET /api/facts`.
struct UserFact: Identifiable, Hashable {
    let id: String
    let fact: String
    let category: FactCategory
    let updatedAt: String
}

extension UserFact: Decodable {
    private enum CodingKeys: String, CodingKey {
        case id, fact, category
        case updatedAt = "updated_at"
    }

    /// A category this build does not know reads as "other", so a server that
    /// learns a new one does not empty the list on older apps.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        fact = try c.decode(String.self, forKey: .fact)
        let raw = try c.decodeIfPresent(String.self, forKey: .category) ?? "other"
        category = FactCategory(rawValue: raw) ?? .other
        updatedAt = try c.decodeIfPresent(String.self, forKey: .updatedAt) ?? ""
    }
}

/// Facts under one heading.
struct FactGroup: Identifiable, Hashable {
    let category: FactCategory
    let facts: [UserFact]
    var id: String { category.rawValue }
}

enum FactGrouping {
    /// Categories in display order, empty ones left out, newest first within
    /// each. Pure, so the ordering is tested rather than trusted.
    static func groups(_ facts: [UserFact]) -> [FactGroup] {
        FactCategory.allCases.compactMap { category in
            let inGroup = facts
                .filter { $0.category == category }
                .sorted { $0.updatedAt > $1.updatedAt }
            return inGroup.isEmpty ? nil : FactGroup(category: category, facts: inGroup)
        }
    }
}

/// One past conversation as Astrya remembers it. Mirrors a row of
/// `summaries` in `GET /api/memory`; the id is the conversation's.
struct ConversationSummary: Identifiable, Hashable, Decodable {
    let conversationId: String
    let summary: String
    let topics: [MemoryTopic]
    let lastMessageAt: String

    var id: String { conversationId }

    private enum CodingKeys: String, CodingKey {
        case summary, topics
        case conversationId = "conversation_id"
        case lastMessageAt = "last_message_at"
    }

    init(conversationId: String, summary: String, topics: [MemoryTopic], lastMessageAt: String) {
        self.conversationId = conversationId
        self.summary = summary
        self.topics = topics
        self.lastMessageAt = lastMessageAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        conversationId = try c.decode(String.self, forKey: .conversationId)
        summary = try c.decode(String.self, forKey: .summary)
        topics = (try c.decodeIfPresent([String].self, forKey: .topics) ?? []).compactMap(MemoryTopic.init(rawValue:))
        lastMessageAt = try c.decodeIfPresent(String.self, forKey: .lastMessageAt) ?? ""
    }
}

/// Whether a prediction came true, as the user said. Mirrors 0009_memory.sql.
enum PredictionStatus: String, Hashable, CaseIterable {
    case open, happened, didnt, unsure

    var label: String {
        switch self {
        case .open: "Open"
        case .happened: "Happened"
        case .didnt: "Didn't happen"
        case .unsure: "Not sure"
        }
    }
}

/// A dated prediction a reading committed to. Mirrors a row of `predictions`
/// in `GET /api/memory`. Dates are `yyyy-MM-dd`.
struct PredictionItem: Identifiable, Hashable, Decodable {
    let id: String
    let topic: MemoryTopic
    let claim: String
    let windowStart: String
    let windowEnd: String
    let confidence: String
    var status: PredictionStatus
    var checkedAt: String?
    let createdAt: String

    private enum CodingKeys: String, CodingKey {
        case id, topic, claim, confidence, status
        case windowStart = "window_start"
        case windowEnd = "window_end"
        case checkedAt = "checked_at"
        case createdAt = "created_at"
    }

    init(id: String, topic: MemoryTopic, claim: String, windowStart: String, windowEnd: String,
         confidence: String, status: PredictionStatus, checkedAt: String? = nil, createdAt: String = "") {
        self.id = id
        self.topic = topic
        self.claim = claim
        self.windowStart = windowStart
        self.windowEnd = windowEnd
        self.confidence = confidence
        self.status = status
        self.checkedAt = checkedAt
        self.createdAt = createdAt
    }

    /// Unknown topics read as general and unknown statuses as open, so a
    /// server ahead of the app does not empty the list.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        claim = try c.decode(String.self, forKey: .claim)
        topic = MemoryTopic(rawValue: try c.decodeIfPresent(String.self, forKey: .topic) ?? "") ?? .general
        windowStart = try c.decodeIfPresent(String.self, forKey: .windowStart) ?? ""
        windowEnd = try c.decodeIfPresent(String.self, forKey: .windowEnd) ?? ""
        confidence = try c.decodeIfPresent(String.self, forKey: .confidence) ?? "possible"
        status = PredictionStatus(rawValue: try c.decodeIfPresent(String.self, forKey: .status) ?? "") ?? .open
        checkedAt = try c.decodeIfPresent(String.self, forKey: .checkedAt)
        createdAt = try c.decodeIfPresent(String.self, forKey: .createdAt) ?? ""
    }

    /// "Mar–Jun 2027", "Dec 2026 – Feb 2027", "Mar 2027". Matches `windowLabel` in lib/memory/types.ts.
    var windowLabel: String { PredictionWindow.label(start: windowStart, end: windowEnd) }

    /// Ask "Did this happen?" once the window has begun.
    func canCheck(today: String) -> Bool { status == .open && windowStart <= today }
}

enum PredictionWindow {
    private static let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

    static func label(start: String, end: String) -> String {
        func parts(_ iso: String) -> (Int, Int)? {
            let p = iso.split(separator: "-")
            guard p.count >= 2, let y = Int(p[0]), let m = Int(p[1]), (1...12).contains(m) else { return nil }
            return (y, m)
        }
        guard let (sy, sm) = parts(start), let (ey, em) = parts(end) else { return "" }
        if sy == ey {
            return sm == em ? "\(months[sm - 1]) \(sy)" : "\(months[sm - 1])–\(months[em - 1]) \(sy)"
        }
        return "\(months[sm - 1]) \(sy) – \(months[em - 1]) \(ey)"
    }

    /// Open ones first, soonest window first; then the settled ones, most recently checked first.
    static func ordered(_ predictions: [PredictionItem]) -> [PredictionItem] {
        let open = predictions.filter { $0.status == .open }.sorted { $0.windowStart < $1.windowStart }
        let closed = predictions.filter { $0.status != .open }
            .sorted { ($0.checkedAt ?? $0.createdAt) > ($1.checkedAt ?? $1.createdAt) }
        return open + closed
    }
}

/// The memory routes — `GET`/`DELETE /api/memory`, the per-row deletes and
/// "Did this happen?", the on-device ingest, and v1's `DELETE /api/facts/{id}`
/// — called with the same bearer token every other route gets, so RLS scopes
/// them to the signed-in user.
///
/// Kept beside the screen rather than in `SancharaAPI` so this feature lives
/// in its own files; the request and error handling are the same.
enum KnowledgeAPI {
    struct Payload: Decodable {
        let facts: [UserFact]
        let summaries: [ConversationSummary]
        let predictions: [PredictionItem]
        /// False while the server's database has no facts table yet.
        let available: Bool

        private enum CodingKeys: String, CodingKey { case facts, summaries, predictions, available }
        private struct Availability: Decodable { let facts: Bool? }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            facts = try c.decodeIfPresent([UserFact].self, forKey: .facts) ?? []
            summaries = try c.decodeIfPresent([ConversationSummary].self, forKey: .summaries) ?? []
            predictions = try c.decodeIfPresent([PredictionItem].self, forKey: .predictions) ?? []
            // `/api/facts` sends a Bool; `/api/memory` sends one flag per table.
            if let flag = try? c.decodeIfPresent(Bool.self, forKey: .available) {
                available = flag
            } else {
                available = (try? c.decodeIfPresent(Availability.self, forKey: .available))?.facts ?? true
            }
        }
    }

    static func list() async throws -> Payload {
        let (data, response) = try await URLSession.shared.data(for: request("api/memory", method: "GET"))
        try check(response, data)
        return try JSONDecoder().decode(Payload.self, from: data)
    }

    static func delete(id: String) async throws {
        try await send(request("api/facts/\(id)", method: "DELETE"))
    }

    /// Every fact, summary and prediction. Transcripts stay.
    static func deleteAll() async throws {
        try await send(request("api/memory", method: "DELETE"))
    }

    static func deleteSummary(conversationId: String) async throws {
        try await send(request("api/memory/summaries/\(conversationId)", method: "DELETE"))
    }

    static func deletePrediction(id: String) async throws {
        try await send(request("api/memory/predictions/\(id)", method: "DELETE"))
    }

    static func setStatus(id: String, status: PredictionStatus) async throws {
        try await send(request("api/memory/predictions/\(id)", method: "PATCH", json: ["status": status.rawValue]))
    }

    /// What the on-device model worked out after a reading.
    static func ingest(_ payload: MemoryIngest) async throws {
        try await send(request("api/memory/ingest", method: "POST", json: payload))
    }

    /// The on-device model could not run: the server remembers the turn instead.
    static func ingestFallback(conversationId: String) async throws {
        try await send(request("api/memory/ingest", method: "POST", json: ["conversationId": conversationId, "fallback": "server"]))
    }

    private static func send(_ req: URLRequest) async throws {
        let (data, response) = try await URLSession.shared.data(for: req)
        try check(response, data)
    }

    private static func request(_ path: String, method: String) async throws -> URLRequest {
        var req = URLRequest(url: AppConfig.apiBaseURL.appendingPathComponent(path))
        req.httpMethod = method
        guard let token = await Supa.accessToken() else { throw SancharaAPI.APIError.unauthorized }
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return req
    }

    private static func request(_ path: String, method: String, json: some Encodable) async throws -> URLRequest {
        var req = try await request(path, method: method)
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(json)
        return req
    }

    private static func check(_ response: URLResponse, _ data: Data) throws {
        guard let http = response as? HTTPURLResponse else { return }
        switch http.statusCode {
        case 200..<300: return
        case 401: throw SancharaAPI.APIError.unauthorized
        default:
            struct ErrorBody: Decodable { let error: String }
            let message = (try? JSONDecoder().decode(ErrorBody.self, from: data))?.error
                ?? "Something went wrong. Please try again."
            throw SancharaAPI.APIError.server(message)
        }
    }
}

/// What Astrya remembers about the user — the facts they told it, the
/// conversations they had, the predictions it made — and the controls to
/// forget any of it or say whether a prediction came true.
@Observable
@MainActor
final class KnowledgeStore {
    enum State: Equatable {
        case loading
        case ready
        case failed(String)
    }

    var state: State = .loading
    var facts: [UserFact] = []
    var summaries: [ConversationSummary] = []
    var predictions: [PredictionItem] = []
    /// A failed change, shown inline above the list. The list itself stays.
    var errorMessage: String?
    var isForgettingAll = false

    var groups: [FactGroup] { FactGrouping.groups(facts) }
    var orderedPredictions: [PredictionItem] { PredictionWindow.ordered(predictions) }
    var isEmpty: Bool { facts.isEmpty && summaries.isEmpty && predictions.isEmpty }
    var total: Int { facts.count + summaries.count + predictions.count }

    func load() async {
        do {
            let payload = try await KnowledgeAPI.list()
            facts = payload.facts
            summaries = payload.summaries
            predictions = payload.predictions
            state = .ready
        } catch {
            // A list already on screen stays; only a first load shows the failure.
            if isEmpty {
                state = .failed(error.localizedDescription)
            } else {
                errorMessage = error.localizedDescription
            }
        }
    }

    /// Applies `change` at once and puts things back if `request` fails.
    private func optimistic(_ change: () -> Void, request: () async throws -> Void, failure: String) async {
        errorMessage = nil
        let before = (facts, summaries, predictions)
        change()
        do {
            try await request()
        } catch {
            (facts, summaries, predictions) = before
            errorMessage = "\(failure) \(error.localizedDescription)"
        }
    }

    /// Optimistic: the row goes under the user's finger and comes back only
    /// if the server refuses.
    func delete(_ fact: UserFact) async {
        await optimistic({ facts.removeAll { $0.id == fact.id } },
                         request: { try await KnowledgeAPI.delete(id: fact.id) },
                         failure: "Couldn't remove that.")
    }

    func delete(_ summary: ConversationSummary) async {
        await optimistic({ summaries.removeAll { $0.id == summary.id } },
                         request: { try await KnowledgeAPI.deleteSummary(conversationId: summary.conversationId) },
                         failure: "Couldn't remove that.")
    }

    func delete(_ prediction: PredictionItem) async {
        await optimistic({ predictions.removeAll { $0.id == prediction.id } },
                         request: { try await KnowledgeAPI.deletePrediction(id: prediction.id) },
                         failure: "Couldn't remove that.")
    }

    /// "Did this happen?" — or `.open` to take the answer back.
    func mark(_ prediction: PredictionItem, _ status: PredictionStatus) async {
        await optimistic({
            guard let i = predictions.firstIndex(where: { $0.id == prediction.id }) else { return }
            predictions[i].status = status
            predictions[i].checkedAt = status == .open ? nil : ISO8601DateFormatter().string(from: .now)
        }, request: { try await KnowledgeAPI.setStatus(id: prediction.id, status: status) },
           failure: "Couldn't save that.")
    }

    func deleteAll() async {
        isForgettingAll = true
        defer { isForgettingAll = false }
        await optimistic({
            facts = []
            summaries = []
            predictions = []
        }, request: { try await KnowledgeAPI.deleteAll() }, failure: "Couldn't forget everything.")
    }
}

/// Astrya's record with one person: of the dated predictions its readings
/// made, how many they said came true. Mirrors `scorecard` in
/// lib/memory/scorecard.ts — keep the two in step.
///
/// Only the person's own answers count. "Not sure" stays out of the rate, and
/// no rate is shown below `minCheckedForRate` answers: a 100% from one
/// prediction is noise dressed up as a claim.
struct Scorecard: Equatable {
    static let minCheckedForRate = 3

    var happened = 0
    var didnt = 0
    var unsure = 0
    /// Open, and its window has begun: waiting for the person to say.
    var awaiting = 0
    /// Open, and its window is still ahead.
    var upcoming = 0
    var likelyChecked = 0
    var likelyHappened = 0
    var total = 0

    /// happened + didnt: the answers the rate is taken over.
    var checked: Int { happened + didnt }

    /// Rounded percentage that happened, or nil below `minCheckedForRate` answers.
    var rate: Int? {
        guard checked >= Self.minCheckedForRate else { return nil }
        return Int((Double(happened) / Double(checked) * 100).rounded())
    }

    init(_ predictions: [PredictionItem], today: String) {
        total = predictions.count
        for p in predictions {
            switch p.status {
            case .happened: happened += 1
            case .didnt: didnt += 1
            case .unsure: unsure += 1
            case .open: if p.windowStart <= today { awaiting += 1 } else { upcoming += 1 }
            }
            if p.confidence == "likely" && (p.status == .happened || p.status == .didnt) {
                likelyChecked += 1
                if p.status == .happened { likelyHappened += 1 }
            }
        }
    }
}
