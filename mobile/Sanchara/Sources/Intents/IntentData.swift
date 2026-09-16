import Foundation

/// What the intents read from, in the order they should try.
///
/// An intent has a budget measured in a second or two — Siri gives up, and a
/// widget refresh that waits is a widget that shows stale content anyway — so
/// every path here starts with the on-disk cache and only reaches for the
/// network when the cache cannot answer. Nothing here throws: an intent that
/// cannot find data says so in words, which is a better outcome than an error
/// Siri reads out as a failure.
enum IntentData {

    /// The chart. Fixed at birth, so a cache hit is always correct.
    static func chart() -> NatalChart? {
        ChartCache.shared.load()
    }

    static func details() -> BirthProfileDetails? {
        ChartCache.shared.loadDetails()
    }

    /// The most recent reading, preferring a cached one written today.
    static func latestReading() async -> DailyReadingEntityData? {
        if let cached = ChartCache.shared.loadReading(), cached.isFresh {
            return DailyReadingEntityData(
                id: cached.id, title: cached.title, body: cached.body,
                slot: cached.slot, forDate: cached.forDate
            )
        }
        return await fetchReadings().first
    }

    @available(iOS 18.0, *)
    static func recentReadings() async -> [DailyReadingEntity] {
        await fetchReadings().map {
            DailyReadingEntity(id: $0.id, title: $0.title, body: $0.body, slot: $0.slot, forDate: $0.forDate)
        }
    }

    /// The plain shape, so the fetch below does not depend on AppIntents types.
    struct DailyReadingEntityData: Sendable {
        let id: String
        let title: String
        let body: String
        let slot: String
        let forDate: String
    }

    private static func fetchReadings() async -> [DailyReadingEntityData] {
        do {
            let rows: [DailyReading] = try await Supa.client
                .from("daily_readings")
                .select("id, for_date, slot, title, body, detail, created_at, read_at")
                .order("for_date", ascending: false)
                .order("created_at", ascending: false)
                .limit(10)
                .execute()
                .value
            let mapped = rows.map {
                DailyReadingEntityData(
                    id: $0.id, title: $0.title, body: $0.body, slot: $0.slot, forDate: $0.forDate
                )
            }
            // Warm the cache for the widget, which cannot make this call.
            if let newest = mapped.first {
                ChartCache.shared.save(reading: .init(
                    id: newest.id, slot: newest.slot, title: newest.title,
                    body: newest.body, forDate: newest.forDate, savedAt: Date()
                ))
            }
            return mapped
        } catch {
            return []
        }
    }
}

@available(iOS 18.0, *)
extension DailyReadingEntity {
    init(_ data: IntentData.DailyReadingEntityData) {
        self.init(id: data.id, title: data.title, body: data.body, slot: data.slot, forDate: data.forDate)
    }
}
