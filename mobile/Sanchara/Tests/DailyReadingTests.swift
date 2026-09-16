import XCTest
@testable import Sanchara

/// The daily readings are the archive the user browses, so the grouping is the
/// feature: newest day first, morning above night, and dates that read like
/// dates.
@MainActor
final class DailyReadingTests: XCTestCase {

    private func reading(_ id: String, date: String, slot: String) -> DailyReading {
        let json = """
        {
          "id": "\(id)",
          "for_date": "\(date)",
          "slot": "\(slot)",
          "title": "t",
          "body": "b",
          "detail": "d",
          "created_at": "2026-08-26T03:00:00Z",
          "read_at": null
        }
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try! decoder.decode(DailyReading.self, from: Data(json.utf8))
    }

    func testGroupsNewestDayFirst() {
        let days = DailyStore.group([
            reading("a", date: "2026-08-24", slot: "night"),
            reading("b", date: "2026-08-26", slot: "morning"),
            reading("c", date: "2026-08-25", slot: "morning"),
        ])
        XCTAssertEqual(days.map(\.date), ["2026-08-26", "2026-08-25", "2026-08-24"])
    }

    func testMorningComesBeforeNightWithinADay() {
        let days = DailyStore.group([
            reading("night", date: "2026-08-26", slot: "night"),
            reading("morning", date: "2026-08-26", slot: "morning"),
        ])
        XCTAssertEqual(days.count, 1)
        XCTAssertEqual(days[0].readings.map(\.slot), ["morning", "night"])
    }

    func testLabelsUseTodayAndYesterday() {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        let today = formatter.string(from: Date())
        let yesterday = formatter.string(from: Calendar.current.date(byAdding: .day, value: -1, to: Date())!)

        XCTAssertEqual(DailyReadingDay(date: today, readings: []).label, "Today")
        XCTAssertEqual(DailyReadingDay(date: yesterday, readings: []).label, "Yesterday")
        XCTAssertEqual(DailyReadingDay(date: "2026-01-09", readings: []).label, "January 9, 2026")
    }

    func testSlotLabelling() {
        XCTAssertTrue(reading("x", date: "2026-08-26", slot: "morning").isMorning)
        XCTAssertEqual(reading("y", date: "2026-08-26", slot: "night").slotLabel, "Night")
    }
}
