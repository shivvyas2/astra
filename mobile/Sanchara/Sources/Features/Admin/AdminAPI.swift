import Foundation

// MARK: - Lenient decoding

/// Every admin payload decodes through these, so a server that renames,
/// drops, adds or re-types a field shows a zero or a dash instead of taking
/// the whole screen down. Counts sent as `12.0` or `"12"` still read as 12,
/// ids sent as numbers still read as strings, and one malformed row in a list
/// drops that row, not the list.
extension KeyedDecodingContainer {
    func lenientString(_ key: Key) -> String? {
        if let value = try? decodeIfPresent(String.self, forKey: key) { return value }
        if let value = try? decodeIfPresent(Int.self, forKey: key) { return String(value) }
        if let value = try? decodeIfPresent(Double.self, forKey: key) { return String(value) }
        return nil
    }

    func lenientInt(_ key: Key) -> Int? {
        if let value = try? decodeIfPresent(Int.self, forKey: key) { return value }
        if let value = try? decodeIfPresent(Double.self, forKey: key), value.isFinite { return Int(value.rounded()) }
        if let value = try? decodeIfPresent(String.self, forKey: key) { return Int(value) ?? Double(value).map { Int($0.rounded()) } }
        return nil
    }

    func lenientDouble(_ key: Key) -> Double? {
        if let value = try? decodeIfPresent(Double.self, forKey: key) { return value }
        if let value = try? decodeIfPresent(Int.self, forKey: key) { return Double(value) }
        if let value = try? decodeIfPresent(String.self, forKey: key) { return Double(value) }
        return nil
    }

    func lenientBool(_ key: Key) -> Bool? {
        if let value = try? decodeIfPresent(Bool.self, forKey: key) { return value }
        if let value = try? decodeIfPresent(Int.self, forKey: key) { return value != 0 }
        if let value = try? decodeIfPresent(String.self, forKey: key) { return ["true", "1", "yes"].contains(value.lowercased()) }
        return nil
    }

    func lenientList<T: Decodable>(_ key: Key) -> [T] {
        ((try? decodeIfPresent([AdminLossy<T>].self, forKey: key)) ?? []).compactMap(\.value)
    }

    func lenientObject<T: Decodable>(_ key: Key) -> T? {
        try? decodeIfPresent(T.self, forKey: key)
    }
}

/// One element of a list that decodes to nil instead of failing the list.
struct AdminLossy<T: Decodable>: Decodable {
    let value: T?
    init(from decoder: Decoder) throws { value = try? T(from: decoder) }
}

// MARK: - /api/admin/me

struct AdminMe: Codable, Hashable {
    let isAdmin: Bool

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        isAdmin = c.lenientBool(.isAdmin) ?? false
    }
}

// MARK: - /api/admin/overview

struct AdminOverview: Codable, Hashable {
    let generatedAt: String
    let days: Int
    let totals: Totals
    let series: [Point]
    let modes: [ModeCount]
    let models: [ModelSpend]
    let kinds: [KindSpend]
    /// Top ten by 30-day cost. Absent on servers that predate it.
    let topUsers: [TopUser]

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        generatedAt = c.lenientString(.generatedAt) ?? ""
        days = c.lenientInt(.days) ?? 30
        totals = c.lenientObject(.totals) ?? Totals.zero
        series = c.lenientList(.series)
        modes = c.lenientList(.modes)
        models = c.lenientList(.models)
        kinds = c.lenientList(.kinds)
        topUsers = c.lenientList(.topUsers)
    }

    struct Totals: Codable, Hashable {
        let users: Int
        let newUsers: Int
        let activeUsers7d: Int
        let readings: Int
        let readingsToday: Int
        /// Share of readings that were deep, 0–1. A server that sends a
        /// percentage (0–100) is read as one.
        let deepShare: Double
        let costUsd: Double
        let costToday: Double
        let costPerReading: Double
        let facts: Int
        let conversationMemories: Int
        let predictionsOpen: Int
        let predictionsHappened: Int
        let predictionsDidnt: Int
        let predictionHitRate: Double?
        let dailyReadings: Int
        let alertsSent: Int
        let pushDevices: Int
        let lifeEvents: Int
        /// People in the top tier of use. Replaced `quotaHits`; the product has
        /// no usage limits any more, so that field is ignored if sent.
        let heavyUsers: Int

        static let zero = Totals()

        private init() {
            users = 0; newUsers = 0; activeUsers7d = 0; readings = 0; readingsToday = 0
            deepShare = 0; costUsd = 0; costToday = 0; costPerReading = 0; facts = 0
            conversationMemories = 0; predictionsOpen = 0; predictionsHappened = 0
            predictionsDidnt = 0; predictionHitRate = nil; dailyReadings = 0; alertsSent = 0
            pushDevices = 0; lifeEvents = 0; heavyUsers = 0
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            users = c.lenientInt(.users) ?? 0
            newUsers = c.lenientInt(.newUsers) ?? 0
            activeUsers7d = c.lenientInt(.activeUsers7d) ?? 0
            readings = c.lenientInt(.readings) ?? 0
            readingsToday = c.lenientInt(.readingsToday) ?? 0
            let share = c.lenientDouble(.deepShare) ?? 0
            deepShare = share > 1 ? share / 100 : share
            costUsd = c.lenientDouble(.costUsd) ?? 0
            costToday = c.lenientDouble(.costToday) ?? 0
            costPerReading = c.lenientDouble(.costPerReading) ?? 0
            facts = c.lenientInt(.facts) ?? 0
            conversationMemories = c.lenientInt(.conversationMemories) ?? 0
            predictionsOpen = c.lenientInt(.predictionsOpen) ?? 0
            predictionsHappened = c.lenientInt(.predictionsHappened) ?? 0
            predictionsDidnt = c.lenientInt(.predictionsDidnt) ?? 0
            predictionHitRate = c.lenientDouble(.predictionHitRate).map { $0 > 1 ? $0 / 100 : $0 }
            dailyReadings = c.lenientInt(.dailyReadings) ?? 0
            alertsSent = c.lenientInt(.alertsSent) ?? 0
            pushDevices = c.lenientInt(.pushDevices) ?? 0
            lifeEvents = c.lenientInt(.lifeEvents) ?? 0
            heavyUsers = c.lenientInt(.heavyUsers) ?? 0
        }

        /// The server's rate when it sends one; otherwise happened over settled.
        var hitRate: Double? {
            if let predictionHitRate { return predictionHitRate }
            let settled = predictionsHappened + predictionsDidnt
            return settled > 0 ? Double(predictionsHappened) / Double(settled) : nil
        }
    }

    struct Point: Codable, Hashable, Identifiable {
        let day: String
        let signups: Int
        let readings: Int
        let costUsd: Double
        let activeUsers: Int
        var id: String { day }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            day = c.lenientString(.day) ?? ""
            signups = c.lenientInt(.signups) ?? 0
            readings = c.lenientInt(.readings) ?? 0
            costUsd = c.lenientDouble(.costUsd) ?? 0
            activeUsers = c.lenientInt(.activeUsers) ?? 0
        }

        var date: Date? { AdminFormat.parseDate(day) }
    }

    struct ModeCount: Codable, Hashable, Identifiable {
        let mode: String
        let readings: Int
        var id: String { mode }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            mode = c.lenientString(.mode) ?? "unknown"
            readings = c.lenientInt(.readings) ?? 0
        }
    }

    struct ModelSpend: Codable, Hashable, Identifiable {
        let model: String
        let calls: Int
        let costUsd: Double
        var id: String { model }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            model = c.lenientString(.model) ?? "unknown"
            calls = c.lenientInt(.calls) ?? 0
            costUsd = c.lenientDouble(.costUsd) ?? 0
        }
    }

    struct KindSpend: Codable, Hashable, Identifiable {
        let kind: String
        let calls: Int
        let costUsd: Double
        var id: String { kind }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            kind = c.lenientString(.kind) ?? "unknown"
            calls = c.lenientInt(.calls) ?? 0
            costUsd = c.lenientDouble(.costUsd) ?? 0
        }
    }

    struct TopUser: Codable, Hashable, Identifiable {
        let id: String
        let name: String?
        let email: String?
        let costUsd30d: Double
        let readings30d: Int

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            guard let id = c.lenientString(.id) else {
                throw DecodingError.keyNotFound(CodingKeys.id, .init(codingPath: c.codingPath, debugDescription: "A top user needs an id."))
            }
            self.id = id
            name = c.lenientString(.name)
            email = c.lenientString(.email)
            costUsd30d = c.lenientDouble(.costUsd30d) ?? 0
            readings30d = c.lenientInt(.readings30d) ?? 0
        }

        var displayName: String { AdminFormat.displayName(name: name, email: email) }
    }
}

// MARK: - /api/admin/users

struct AdminUsersPage: Codable, Hashable {
    let users: [AdminUserRow]
    let total: Int

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        users = c.lenientList(.users)
        total = c.lenientInt(.total) ?? users.count
    }
}

struct AdminUserRow: Codable, Hashable, Identifiable {
    let id: String
    let email: String?
    let name: String?
    let place: String?
    let createdAt: String?
    let lastActiveAt: String?
    let plan: String?
    let readings: Int
    let readings7d: Int
    let costUsd30d: Double
    let facts: Int
    let predictionsOpen: Int
    let hasPush: Bool
    let isAdmin: Bool

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        guard let id = c.lenientString(.id) else {
            throw DecodingError.keyNotFound(CodingKeys.id, .init(codingPath: c.codingPath, debugDescription: "A user row needs an id."))
        }
        self.id = id
        email = c.lenientString(.email)
        name = c.lenientString(.name)
        place = c.lenientString(.place)
        createdAt = c.lenientString(.createdAt)
        lastActiveAt = c.lenientString(.lastActiveAt)
        plan = c.lenientString(.plan)
        readings = c.lenientInt(.readings) ?? 0
        readings7d = c.lenientInt(.readings7d) ?? 0
        costUsd30d = c.lenientDouble(.costUsd30d) ?? 0
        facts = c.lenientInt(.facts) ?? 0
        predictionsOpen = c.lenientInt(.predictionsOpen) ?? 0
        hasPush = c.lenientBool(.hasPush) ?? false
        isAdmin = c.lenientBool(.isAdmin) ?? false
    }

    var displayName: String { AdminFormat.displayName(name: name, email: email) }
}

// MARK: - /api/admin/users/:id

struct AdminUserDetail: Codable, Hashable {
    let user: Profile
    let stats: Stats
    let timeline: [TimelineEvent]
    let conversations: [Conversation]
    let memory: Memory
    let usage: [UsageDay]

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        guard let user: Profile = c.lenientObject(.user) else {
            throw DecodingError.keyNotFound(CodingKeys.user, .init(codingPath: c.codingPath, debugDescription: "The detail payload needs a user."))
        }
        self.user = user
        stats = c.lenientObject(.stats) ?? Stats.zero
        timeline = c.lenientList(.timeline)
        conversations = c.lenientList(.conversations)
        memory = c.lenientObject(.memory) ?? Memory.empty
        usage = c.lenientList(.usage)
    }

    struct Profile: Codable, Hashable {
        let id: String
        let email: String?
        let name: String?
        let createdAt: String?
        let lastActiveAt: String?
        let plan: String?
        let isAdmin: Bool
        let birth: Birth?
        let chart: Chart?

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            id = c.lenientString(.id) ?? ""
            email = c.lenientString(.email)
            name = c.lenientString(.name)
            createdAt = c.lenientString(.createdAt)
            lastActiveAt = c.lenientString(.lastActiveAt)
            plan = c.lenientString(.plan)
            isAdmin = c.lenientBool(.isAdmin) ?? false
            birth = c.lenientObject(.birth)
            chart = c.lenientObject(.chart)
        }

        var displayName: String { AdminFormat.displayName(name: name, email: email) }
    }

    struct Birth: Codable, Hashable {
        let date: String?
        let time: String?
        /// True unless the server says otherwise.
        let timeKnown: Bool
        let place: String?
        let timezone: String?

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            date = c.lenientString(.date)
            time = c.lenientString(.time)
            timeKnown = c.lenientBool(.timeKnown) ?? true
            place = c.lenientString(.place)
            timezone = c.lenientString(.timezone)
        }
    }

    struct Chart: Codable, Hashable {
        let lagna: String?
        let moonSign: String?
        let sunSign: String?
        let mahadasha: String?
        let antardasha: String?
        let antardashaEnd: String?

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            lagna = c.lenientString(.lagna)
            moonSign = c.lenientString(.moonSign)
            sunSign = c.lenientString(.sunSign)
            mahadasha = c.lenientString(.mahadasha)
            antardasha = c.lenientString(.antardasha)
            antardashaEnd = c.lenientString(.antardashaEnd)
        }
    }

    struct Stats: Codable, Hashable {
        let readings: Int
        let deepReadings: Int
        let costUsd: Double
        let costUsd30d: Double
        let facts: Int
        let summaries: Int
        let predictionsOpen: Int
        let predictionsHappened: Int
        let predictionsDidnt: Int
        let lifeEvents: Int
        let alerts: Int
        let dailyReadings: Int
        let pushDevices: Int

        static let zero = Stats()

        private init() {
            readings = 0; deepReadings = 0; costUsd = 0; costUsd30d = 0; facts = 0; summaries = 0
            predictionsOpen = 0; predictionsHappened = 0; predictionsDidnt = 0; lifeEvents = 0
            alerts = 0; dailyReadings = 0; pushDevices = 0
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            readings = c.lenientInt(.readings) ?? 0
            deepReadings = c.lenientInt(.deepReadings) ?? 0
            costUsd = c.lenientDouble(.costUsd) ?? 0
            costUsd30d = c.lenientDouble(.costUsd30d) ?? 0
            facts = c.lenientInt(.facts) ?? 0
            summaries = c.lenientInt(.summaries) ?? 0
            predictionsOpen = c.lenientInt(.predictionsOpen) ?? 0
            predictionsHappened = c.lenientInt(.predictionsHappened) ?? 0
            predictionsDidnt = c.lenientInt(.predictionsDidnt) ?? 0
            lifeEvents = c.lenientInt(.lifeEvents) ?? 0
            alerts = c.lenientInt(.alerts) ?? 0
            dailyReadings = c.lenientInt(.dailyReadings) ?? 0
            pushDevices = c.lenientInt(.pushDevices) ?? 0
        }
    }

    struct TimelineEvent: Codable, Hashable, Identifiable {
        let at: String
        let kind: String
        let title: String
        let detail: String?
        let refId: String?

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            at = c.lenientString(.at) ?? ""
            kind = c.lenientString(.kind) ?? "event"
            title = c.lenientString(.title) ?? ""
            detail = c.lenientString(.detail)
            refId = c.lenientString(.refId)
        }

        /// Stable enough for a list: the server sends no id of its own.
        var id: String { "\(at)|\(kind)|\(refId ?? title)" }
        var date: Date? { AdminFormat.parseDate(at) }
    }

    struct Conversation: Codable, Hashable, Identifiable {
        let id: String
        let title: String?
        let mode: String?
        let createdAt: String?
        let lastMessageAt: String?
        let messages: Int

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            guard let id = c.lenientString(.id) else {
                throw DecodingError.keyNotFound(CodingKeys.id, .init(codingPath: c.codingPath, debugDescription: "A conversation needs an id."))
            }
            self.id = id
            title = c.lenientString(.title)
            mode = c.lenientString(.mode)
            createdAt = c.lenientString(.createdAt)
            lastMessageAt = c.lenientString(.lastMessageAt)
            messages = c.lenientInt(.messages) ?? 0
        }
    }

    struct Memory: Codable, Hashable {
        let facts: [Fact]
        let summaries: [Summary]
        let predictions: [Prediction]

        static let empty = Memory()

        private init() { facts = []; summaries = []; predictions = [] }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            facts = c.lenientList(.facts)
            summaries = c.lenientList(.summaries)
            predictions = c.lenientList(.predictions)
        }
    }

    struct Fact: Codable, Hashable, Identifiable {
        let id: String
        let fact: String
        let category: String
        let confidence: Double?
        let source: String?
        let updatedAt: String?

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            fact = c.lenientString(.fact) ?? ""
            id = c.lenientString(.id) ?? fact
            category = c.lenientString(.category) ?? "other"
            confidence = c.lenientDouble(.confidence)
            source = c.lenientString(.source)
            updatedAt = c.lenientString(.updatedAt)
        }
    }

    struct Summary: Codable, Hashable, Identifiable {
        let conversationId: String
        let summary: String
        let topics: [String]
        let lastMessageAt: String?
        var id: String { conversationId }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            summary = c.lenientString(.summary) ?? ""
            conversationId = c.lenientString(.conversationId) ?? summary
            topics = c.lenientList(.topics)
            lastMessageAt = c.lenientString(.lastMessageAt)
        }
    }

    struct Prediction: Codable, Hashable, Identifiable {
        let id: String
        let topic: String?
        let claim: String
        let windowStart: String?
        let windowEnd: String?
        let confidence: String?
        let status: String
        let checkedAt: String?

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            claim = c.lenientString(.claim) ?? ""
            id = c.lenientString(.id) ?? claim
            topic = c.lenientString(.topic)
            windowStart = c.lenientString(.windowStart)
            windowEnd = c.lenientString(.windowEnd)
            // Confidence is a word ("likely") on today's server; a number reads as a percentage.
            if let word = try? c.decodeIfPresent(String.self, forKey: .confidence) {
                confidence = word
            } else if let number = c.lenientDouble(.confidence) {
                confidence = AdminFormat.percent(number > 1 ? number / 100 : number)
            } else {
                confidence = nil
            }
            status = c.lenientString(.status) ?? "open"
            checkedAt = c.lenientString(.checkedAt)
        }

        var windowLabel: String { AdminFormat.window(start: windowStart, end: windowEnd) }
    }

    struct UsageDay: Codable, Hashable, Identifiable {
        let day: String
        let readings: Int
        let costUsd: Double
        var id: String { day }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            day = c.lenientString(.day) ?? ""
            readings = c.lenientInt(.readings) ?? 0
            costUsd = c.lenientDouble(.costUsd) ?? 0
        }

        var date: Date? { AdminFormat.parseDate(day) }
    }
}

// MARK: - /api/admin/conversations/:id

struct AdminTranscript: Codable, Hashable {
    let conversation: Header
    let messages: [Message]

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        conversation = c.lenientObject(.conversation) ?? Header.blank
        messages = c.lenientList(.messages)
    }

    struct Header: Codable, Hashable {
        let id: String
        let userId: String?
        let title: String?
        let mode: String?
        let createdAt: String?

        static let blank = Header()
        private init() { id = ""; userId = nil; title = nil; mode = nil; createdAt = nil }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            id = c.lenientString(.id) ?? ""
            userId = c.lenientString(.userId)
            title = c.lenientString(.title)
            mode = c.lenientString(.mode)
            createdAt = c.lenientString(.createdAt)
        }
    }

    struct Message: Codable, Hashable {
        let role: String
        let content: String
        let createdAt: String?

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            role = c.lenientString(.role) ?? "assistant"
            content = c.lenientString(.content) ?? ""
            createdAt = c.lenientString(.createdAt)
        }
    }
}

// MARK: - Calls

/// What the admin screens need from the server. A protocol so the store can
/// be driven by sample data in tests and previews.
protocol AdminService: Sendable {
    func me() async throws -> AdminMe
    func overview(days: Int) async throws -> AdminOverview
    func users(query: String, limit: Int, offset: Int) async throws -> AdminUsersPage
    func user(id: String) async throws -> AdminUserDetail
    func conversation(id: String) async throws -> AdminTranscript
}

/// The admin routes on the Astrya API. The server checks the token against
/// its admin list and reads with the service role; this app never queries
/// the admin data from Supabase itself.
///
/// The request is built the way every other authenticated call is
/// (`SancharaAPI`, `KnowledgeAPI`): base URL from `AppConfig`, the current
/// Supabase access token — which the client refreshes as needed — as a
/// bearer token.
struct AdminAPI: AdminService {
    enum AdminError: LocalizedError, Equatable {
        /// 401 or 403, or no session: show "Admins only", not an error.
        case notAdmin
        case server(String)
        case unreadable

        var errorDescription: String? {
            switch self {
            case .notAdmin: "This account doesn't have admin access."
            case .server(let message): message
            case .unreadable: "The admin data came back in a shape this build can't read."
            }
        }
    }

    func me() async throws -> AdminMe {
        try await get("api/admin/me")
    }

    func overview(days: Int) async throws -> AdminOverview {
        try await get("api/admin/overview", query: [URLQueryItem(name: "days", value: String(days))])
    }

    func users(query: String, limit: Int, offset: Int) async throws -> AdminUsersPage {
        try await get("api/admin/users", query: [
            URLQueryItem(name: "q", value: query),
            URLQueryItem(name: "limit", value: String(limit)),
            URLQueryItem(name: "offset", value: String(offset)),
        ])
    }

    func user(id: String) async throws -> AdminUserDetail {
        try await get("api/admin/users/\(Self.pathSafe(id))")
    }

    func conversation(id: String) async throws -> AdminTranscript {
        try await get("api/admin/conversations/\(Self.pathSafe(id))")
    }

    private func get<T: Decodable>(_ path: String, query: [URLQueryItem] = []) async throws -> T {
        guard var components = URLComponents(url: AppConfig.apiBaseURL, resolvingAgainstBaseURL: false) else {
            throw AdminError.server("That request could not be built.")
        }
        // `path` is already percent-encoded (see `pathSafe`), so it is set as
        // such rather than through `appendingPathComponent`, which would
        // encode the `%` a second time.
        let base = components.percentEncodedPath.hasSuffix("/")
            ? String(components.percentEncodedPath.dropLast())
            : components.percentEncodedPath
        components.percentEncodedPath = base + "/" + path
        if !query.isEmpty { components.queryItems = query }
        guard let url = components.url else { throw AdminError.server("That request could not be built.") }

        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        guard let token = await Supa.accessToken() else { throw AdminError.notAdmin }
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await URLSession.shared.data(for: req)
        if let http = response as? HTTPURLResponse, let error = Self.error(status: http.statusCode, body: data) {
            throw error
        }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw AdminError.unreadable
        }
    }

    /// The error a status maps to, or nil for success. Pure, so it is tested.
    static func error(status: Int, body: Data) -> AdminError? {
        switch status {
        case 200..<300: return nil
        case 401, 403: return .notAdmin
        default:
            struct ErrorBody: Decodable { let error: String }
            let message = (try? JSONDecoder().decode(ErrorBody.self, from: body))?.error
                ?? "Something went wrong (\(status)). Please try again."
            return .server(message)
        }
    }

    /// Ids are uuids today; anything else is percent-encoded so it cannot
    /// change the path.
    static func pathSafe(_ id: String) -> String {
        id.addingPercentEncoding(withAllowedCharacters: .alphanumerics.union(CharacterSet(charactersIn: "-_"))) ?? id
    }
}
