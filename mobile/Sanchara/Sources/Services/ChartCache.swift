import Foundation

/// The chart, the birth details, and the last reading, on disk in the app
/// group.
///
/// Three processes need this data and only one of them can sign in: the app,
/// the App Intents extension Siri runs, and the widget timeline provider.
/// Neither of the latter two can hold a Supabase session or block on a network
/// round trip — a widget that fetches is a widget that shows a placeholder, and
/// a Siri answer that waits is a Siri answer nobody hears. So the app writes
/// here after every successful load, and the others only ever read.
///
/// Nothing secret goes in: no tokens, no session. A birth chart is personal,
/// which is why it lives in the app group container rather than anywhere it
/// could be backed up to a shared location, and why `clear()` runs on sign-out.
final class ChartCache: @unchecked Sendable {
    static let shared = ChartCache()

    /// Must match the App Group capability on both the app and the widget
    /// target — see `mobile/project.yml`.
    static let appGroup = "group.com.shivvyas.astra"

    private let queue = DispatchQueue(label: "com.shivvyas.astra.chartcache")
    private let directory: URL

    private init() {
        let shared = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: Self.appGroup
        )
        // Without the entitlement (a simulator build with no provisioning, say)
        // the app still works — it just stops sharing with the widget.
        directory = shared ?? URL.cachesDirectory
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    private func url(_ name: String) -> URL {
        directory.appendingPathComponent("\(name).json")
    }

    private func write<T: Encodable>(_ value: T, to name: String) {
        queue.async {
            guard let data = try? JSONEncoder().encode(value) else { return }
            try? data.write(to: self.url(name), options: [.atomic, .completeFileProtection])
        }
    }

    private func read<T: Decodable>(_ type: T.Type, from name: String) -> T? {
        queue.sync {
            guard let data = try? Data(contentsOf: url(name)) else { return nil }
            return try? JSONDecoder().decode(type, from: data)
        }
    }

    // MARK: - Chart

    func save(chart: NatalChart) { write(chart, to: "chart") }
    func load() -> NatalChart? { read(NatalChart.self, from: "chart") }

    // MARK: - Birth details

    func save(details: BirthProfileDetails) { write(details, to: "details") }
    func loadDetails() -> BirthProfileDetails? { read(BirthProfileDetails.self, from: "details") }

    // MARK: - The latest reading

    /// The most recent daily reading, flattened to what a widget or a Siri
    /// snippet needs. The full row stays in Supabase.
    struct CachedReading: Codable, Sendable {
        let id: String
        let slot: String
        let title: String
        let body: String
        let forDate: String
        let savedAt: Date

        /// A widget should not keep insisting on yesterday's morning reading.
        var isFresh: Bool {
            Calendar.current.isDateInToday(savedAt) || savedAt.timeIntervalSinceNow > -86_400
        }
    }

    func save(reading: CachedReading) { write(reading, to: "reading") }
    func loadReading() -> CachedReading? { read(CachedReading.self, from: "reading") }

    // MARK: - The current dasha period

    /// The mahadasha–antardasha pair running today, with the server's one-line
    /// theme, for the period widget. The dates alone are already in the cached
    /// chart; what this adds is the meaning, which only the timeline API
    /// writes. All dates are ISO calendar days.
    struct CachedPeriod: Codable, Sendable, Equatable {
        let lord: String
        let antardasha: String
        let start: String
        let end: String
        let antardashaStart: String
        let antardashaEnd: String
        let theme: String?
        let nowMeaning: String?
        let savedAt: Date
    }

    func save(period: CachedPeriod) { write(period, to: "period") }
    func loadPeriod() -> CachedPeriod? { read(CachedPeriod.self, from: "period") }

    // MARK: - Where to land

    /// Set by an intent or a control in another process, drained by the app.
    ///
    /// `UserDefaults` rather than a file: it is one short string, it is written
    /// from a widget extension milliseconds before the app launches, and the
    /// suite gives both processes the same store without either having to
    /// coordinate.
    private var defaults: UserDefaults? { UserDefaults(suiteName: Self.appGroup) }

    func setPendingDestination(_ value: String?) {
        defaults?.set(value, forKey: "pendingDestination")
    }

    /// Reads and clears in one step, so a destination is never handled twice.
    func takePendingDestination() -> String? {
        guard let value = defaults?.string(forKey: "pendingDestination") else { return nil }
        defaults?.removeObject(forKey: "pendingDestination")
        return value
    }

    // MARK: - Sign-out

    func clear() {
        queue.async {
            for name in ["chart", "details", "reading", "period"] {
                try? FileManager.default.removeItem(at: self.url(name))
            }
            self.defaults?.removeObject(forKey: "pendingDestination")
        }
    }
}
