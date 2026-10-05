import Foundation

/// Fetches the latest reading and alerts into the app group cache, from
/// whichever process happens to be awake.
///
/// The widget calls this from its own timeline provider, with a token from
/// `SharedSession` — that is what lets the Home Screen move on without the app
/// being opened. The app calls it from a background refresh task and when a
/// push arrives, with a token from its Supabase client. Both write the same
/// cache and both talk to PostgREST directly with the user's own JWT, so row
/// level security decides what comes back, exactly as it does for the app.
///
/// Any failure keeps the cache as it was: a widget showing this morning's
/// reading is better than a widget showing an error.
///
/// Compiled into the widget extension, so it depends on nothing but
/// Foundation, `ChartCache`, `SharedSession` and `AppConfig`.
enum WidgetSync {
    typealias TokenSource = @Sendable () async -> SharedSession.Access

    struct Outcome: Equatable, Sendable {
        /// Something new reached the cache.
        var changed = false
        /// The network was actually used.
        var fetched = false
        /// The session can no longer be refreshed without the app.
        var revoked = false
    }

    /// The widget's own token source.
    static let widgetToken: TokenSource = { await SharedSession.access() }

    private static let coalescer = Coalescer()

    /// Fetches unless another caller did so in the last few minutes. `force`
    /// skips that check — for a push that says something new exists.
    static func refresh(
        token: @escaping TokenSource,
        force: Bool = false,
        now: Date = Date()
    ) async -> Outcome {
        await coalescer.run { await perform(token: token, force: force, now: now) }
    }

    private static func perform(token: TokenSource, force: Bool, now: Date) async -> Outcome {
        let cache = ChartCache.shared
        if !force, !SyncPolicy.shouldFetch(lastSync: cache.lastSync, now: now) {
            return Outcome(revoked: cache.sessionRevoked)
        }

        let jwt: String
        switch await token() {
        case .token(let value):
            jwt = value
        case .revoked:
            cache.sessionRevoked = true
            return Outcome(revoked: true)
        case .signedOut, .unavailable:
            return Outcome(revoked: cache.sessionRevoked)
        }

        async let readingRows = fetchReadings(jwt: jwt)
        async let alertRows = fetchAlerts(jwt: jwt)
        let (readings, alerts) = await (readingRows, alertRows)

        var outcome = Outcome(fetched: true)
        if let newest = readings?.first {
            let previous = cache.loadReading()
            if previous?.id != newest.id || previous?.title != newest.title || previous?.body != newest.body {
                outcome.changed = true
            }
            cache.save(reading: ChartCache.CachedReading(
                id: newest.id, slot: newest.slot, title: newest.title, body: newest.body,
                forDate: newest.forDate, savedAt: now
            ))
        }
        if let alerts {
            let mapped = alerts.compactMap(\.cached)
            if cache.loadAlerts() != mapped { outcome.changed = true }
            cache.save(alerts: mapped)
        }
        if readings != nil || alerts != nil {
            cache.lastSync = now
            cache.sessionRevoked = false
        }
        cache.flush()
        return outcome
    }

    // MARK: - PostgREST

    struct ReadingRow: Decodable {
        let id: String
        let forDate: String
        let slot: String
        let title: String
        let body: String

        enum CodingKeys: String, CodingKey {
            case id, slot, title, body
            case forDate = "for_date"
        }
    }

    struct AlertRow: Decodable {
        let id: String
        let severity: String
        let kinds: [String]?
        let title: String
        let body: String
        let createdAt: String
        let readAt: String?

        enum CodingKeys: String, CodingKey {
            case id, severity, kinds, title, body
            case createdAt = "created_at"
            case readAt = "read_at"
        }

        var cached: ChartCache.CachedAlert? {
            guard let created = WidgetDates.parse(createdAt) else { return nil }
            return ChartCache.CachedAlert(
                id: id, severity: severity, kinds: kinds ?? [], title: title, body: body,
                createdAt: created, readAt: readAt.flatMap(WidgetDates.parse)
            )
        }
    }

    private static func fetchReadings(jwt: String) async -> [ReadingRow]? {
        await get("daily_readings", jwt: jwt, query: [
            URLQueryItem(name: "select", value: "id,for_date,slot,title,body"),
            URLQueryItem(name: "order", value: "for_date.desc,created_at.desc"),
            URLQueryItem(name: "limit", value: "1"),
        ])
    }

    private static func fetchAlerts(jwt: String) async -> [AlertRow]? {
        await get("alerts", jwt: jwt, query: [
            URLQueryItem(name: "select", value: "id,severity,kinds,title,body,created_at,read_at"),
            URLQueryItem(name: "order", value: "created_at.desc"),
            URLQueryItem(name: "limit", value: "10"),
        ])
    }

    private static func get<T: Decodable>(_ table: String, jwt: String, query: [URLQueryItem]) async -> T? {
        guard var parts = URLComponents(
            url: AppConfig.supabaseURL.appendingPathComponent("rest/v1/\(table)"),
            resolvingAgainstBaseURL: false
        ) else { return nil }
        parts.queryItems = query
        guard let url = parts.url else { return nil }
        var request = URLRequest(url: url)
        request.timeoutInterval = 12
        request.setValue(AppConfig.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(jwt)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode)
        else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }
}

/// Whether to use the network now, or let the cache answer.
enum SyncPolicy {
    /// The reading and alert widgets rebuild together, and the app may have
    /// just fetched; one fetch serves them all for this long.
    static let minInterval: TimeInterval = 10 * 60

    static func shouldFetch(lastSync: Date?, now: Date, minInterval: TimeInterval = minInterval) -> Bool {
        guard let lastSync else { return true }
        // A clock set backwards would otherwise freeze the widget.
        if lastSync > now { return true }
        return now.timeIntervalSince(lastSync) >= minInterval
    }
}

/// When a widget should next ask for a timeline.
///
/// Readings are written by the cron in `vercel.json` at 02:30 and 15:30 UTC —
/// whichever is the user's morning or night — so the widget asks again a
/// quarter of an hour after each, when the reading exists. Alerts come from
/// the same runs, but a reading can also be marked read, or an alert opened,
/// in the app or on the web, so it never waits longer than `maxInterval`.
///
/// Twelve-odd refreshes a day per widget sits well inside WidgetKit's budget
/// (roughly 40–70 a day for a widget someone looks at); the system may still
/// run them later than asked.
enum RefreshSchedule {
    static let readingTimesUTC: [(hour: Int, minute: Int)] = [(2, 45), (15, 45)]
    static let maxInterval: TimeInterval = 2 * 3600

    static func next(after now: Date) -> Date {
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC") ?? .gmt
        let candidates = readingTimesUTC.compactMap { time in
            utc.nextDate(
                after: now,
                matching: DateComponents(hour: time.hour, minute: time.minute, second: 0),
                matchingPolicy: .nextTime
            )
        }
        let ceiling = now.addingTimeInterval(maxInterval)
        guard let soonest = candidates.min() else { return ceiling }
        return min(soonest, ceiling)
    }
}

/// Which alert the widget leads with.
enum AlertPick {
    /// An unread alert older than this has stopped being news. It is still in
    /// the app's inbox; the widget just stops shouting about it.
    static let maxAge: TimeInterval = 21 * 86_400

    static func fresh(_ alerts: [ChartCache.CachedAlert], now: Date) -> [ChartCache.CachedAlert] {
        alerts
            .filter { $0.isUnread && now.timeIntervalSince($0.createdAt) <= maxAge }
            .sorted { $0.createdAt > $1.createdAt }
    }

    /// The newest unread alert, or nil for "all clear".
    static func latestUnread(_ alerts: [ChartCache.CachedAlert], now: Date) -> ChartCache.CachedAlert? {
        fresh(alerts, now: now).first
    }
}

/// `sanchara://` links a widget opens. Routed by `DeepLink.handle(url:)`.
enum WidgetLink {
    static func alert(_ id: String) -> URL? { item("alert", id) }
    static func reading(_ id: String) -> URL? { item("reading", id) }
    static let timeline = URL(string: "sanchara://timeline")

    private static func item(_ host: String, _ id: String) -> URL? {
        guard let safe = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) else { return nil }
        return URL(string: "sanchara://\(host)/\(safe)")
    }
}

/// Postgres `timestamptz` as PostgREST writes it: ISO 8601 with up to six
/// fractional digits and a `+00:00` offset. `ISO8601DateFormatter` only
/// reliably parses three, so the fraction is trimmed first.
enum WidgetDates {
    static func parse(_ raw: String) -> Date? {
        var text = raw.replacingOccurrences(of: " ", with: "T")
        var hasFraction = false
        if let dot = text.firstIndex(of: "."), let t = text.firstIndex(of: "T"), dot > t {
            let digitsEnd = text[text.index(after: dot)...].firstIndex { !$0.isNumber } ?? text.endIndex
            let digits = text[text.index(after: dot)..<digitsEnd]
            let millis = String(digits.prefix(3)).padding(toLength: 3, withPad: "0", startingAt: 0)
            text.replaceSubrange(text.index(after: dot)..<digitsEnd, with: millis)
            hasFraction = true
        }
        // A bare `+00` offset is valid Postgres output but not ISO 8601.
        if let plus = text.lastIndex(where: { $0 == "+" || $0 == "-" }),
           let t = text.firstIndex(of: "T"), plus > t,
           text[plus...].count == 3 {
            text += ":00"
        }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = hasFraction
            ? [.withInternetDateTime, .withFractionalSeconds]
            : [.withInternetDateTime]
        return formatter.date(from: text)
    }
}

/// Lets concurrent callers share one in-flight sync.
private actor Coalescer {
    private var inFlight: Task<WidgetSync.Outcome, Never>?

    func run(_ work: @escaping @Sendable () async -> WidgetSync.Outcome) async -> WidgetSync.Outcome {
        if let inFlight { return await inFlight.value }
        let task = Task { await work() }
        inFlight = task
        let result = await task.value
        inFlight = nil
        return result
    }
}
