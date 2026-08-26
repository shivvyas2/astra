import Foundation
import Supabase

/// One of the two readings written for a day.
struct DailyReading: Decodable, Identifiable, Hashable {
    let id: String
    /// The user's own local date, as `yyyy-MM-dd`.
    let forDate: String
    let slot: String
    let title: String
    let body: String
    let detail: String
    let createdAt: Date
    let readAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, slot, title, body, detail
        case forDate = "for_date"
        case createdAt = "created_at"
        case readAt = "read_at"
    }

    var isUnread: Bool { readAt == nil }
    var isMorning: Bool { slot == "morning" }
    var slotLabel: String { isMorning ? "Morning" : "Night" }
}

/// A day's readings, for the date-grouped list.
struct DailyReadingDay: Identifiable {
    let date: String
    let readings: [DailyReading]
    var id: String { date }

    /// "Today", "Yesterday", or "26 August 2026".
    var label: String {
        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.dateFormat = "yyyy-MM-dd"
        guard let day = parser.date(from: date) else { return date }

        let calendar = Calendar.current
        if calendar.isDateInToday(day) { return "Today" }
        if calendar.isDateInYesterday(day) { return "Yesterday" }

        let pretty = DateFormatter()
        pretty.dateStyle = .long
        pretty.timeStyle = .none
        return pretty.string(from: day)
    }
}

@Observable
@MainActor
final class DailyStore {
    var readings: [DailyReading] = []
    var selected: DailyReading?

    var unreadCount: Int { readings.filter(\.isUnread).count }

    /// Newest day first, morning above night within a day.
    var days: [DailyReadingDay] {
        Self.group(readings)
    }

    static func group(_ readings: [DailyReading]) -> [DailyReadingDay] {
        let byDate = Dictionary(grouping: readings, by: \.forDate)
        return byDate.keys.sorted(by: >).map { date in
            let ordered = (byDate[date] ?? []).sorted { lhs, rhs in
                lhs.isMorning && !rhs.isMorning
            }
            return DailyReadingDay(date: date, readings: ordered)
        }
    }

    func load() async {
        do {
            readings = try await Supa.client
                .from("daily_readings")
                .select("id, for_date, slot, title, body, detail, created_at, read_at")
                .order("for_date", ascending: false)
                .order("created_at", ascending: false)
                .limit(60)
                .execute()
                .value
        } catch {
            // Secondary to the chat; keep whatever was already loaded.
        }
    }

    func open(id: String) async {
        if let known = readings.first(where: { $0.id == id }) {
            selected = known
            await markRead(known)
            return
        }
        await load()
        if let found = readings.first(where: { $0.id == id }) {
            selected = found
            await markRead(found)
        }
    }

    func markRead(_ reading: DailyReading) async {
        guard reading.isUnread else { return }
        do {
            try await Supa.client
                .from("daily_readings")
                .update(["read_at": ISO8601DateFormatter().string(from: Date())])
                .eq("id", value: reading.id)
                .execute()
            await load()
        } catch {
            // The badge stays until the next successful load.
        }
    }
}
