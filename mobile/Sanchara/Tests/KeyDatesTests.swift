import XCTest
@testable import Sanchara

/// The Key dates payload is `GET /api/timing` (lib/timing/engine.ts).
final class KeyDatesTests: XCTestCase {
    func testDecodesTheServerPayloadAndToleratesUnknownValues() throws {
        let json = """
        {"today":"2026-10-09","horizonEnd":"2027-10-09","events":[
          {"id":"2026-10-31-Jupiter-ingress","date":"2026-10-31","end":"2027-01-25","kind":"ingress","body":"Jupiter",
           "title":"Jupiter into Leo: your 6th house","detail":"Jupiter moves.","houseFromAsc":6,"houseFromMoon":1,
           "topics":["career","health"],"tone":"mixed"},
          {"id":"x","date":"2027-07-19","end":null,"kind":"eclipse","body":"Sun","title":"Something new","detail":"",
           "topics":[],"tone":"auspicious"}
        ]}
        """
        let payload = try JSONDecoder().decode(TimingPayload.self, from: Data(json.utf8))
        XCTAssertEqual(payload.events.count, 2)
        XCTAssertEqual(payload.events[0].end, "2027-01-25")
        XCTAssertEqual(payload.events[0].topics, ["career", "health"])
        XCTAssertEqual(payload.events[1].kind, .ingress)
        XCTAssertEqual(payload.events[1].tone, .mixed)
    }

    func testGroupsByMonthInDateOrder() {
        func e(_ id: String, _ date: String) -> TimingEvent {
            TimingEvent(id: id, date: date, end: nil, kind: .station, body: "Mars", title: id, detail: "", topics: [], tone: .mixed)
        }
        let groups = KeyDates.byMonth([e("c", "2027-01-11"), e("a", "2026-10-31"), e("b", "2026-10-02")])
        XCTAssertEqual(groups.map(\.month), ["2026-10", "2027-01"])
        XCTAssertEqual(groups[0].events.map(\.id), ["b", "a"])
        XCTAssertEqual(KeyDates.monthTitle("2026-10"), "October 2026")
        XCTAssertEqual(KeyDates.dayNumber("2026-10-02"), "02")
    }

    func testDecodesADateComparison() throws {
        let json = """
        {"a":{"date":"2026-11-03","score":2,"factors":[{"label":"Chandra bala","detail":"Moon in Libra.","score":1}],
          "moonSign":"Libra","nakshatra":"Swati"},
         "b":{"date":"2026-12-01","score":0,"factors":[],"moonSign":"Leo","nakshatra":"Magha"},
         "better":"a","topic":null}
        """
        let c = try JSONDecoder().decode(DateComparison.self, from: Data(json.utf8))
        XCTAssertEqual(c.winner?.date, "2026-11-03")
        XCTAssertEqual(c.a.factors.first?.score, 1)
    }

    func testDecodesMoodWithAndWithoutASummary() throws {
        let full = """
        {"available":true,"checkins":[{"day":"2026-10-09","mood":4}],
         "summary":{"days":12,"mean":3.2,"needed":0,"patterns":[{"key":"chandra","label":"Chandra bala",
           "good":{"mean":4,"days":6},"other":{"mean":2,"days":6},"gap":2,"sentence":"On days the Moon is well placed."}]}}
        """
        let p = try JSONDecoder().decode(MoodPayload.self, from: Data(full.utf8))
        XCTAssertEqual(p.summary?.patterns.first?.label, "Chandra bala")
        XCTAssertEqual(p.checkins.first?.mood, 4)
        let bare = try JSONDecoder().decode(MoodPayload.self, from: Data(#"{"available":false,"checkins":[],"summary":null}"#.utf8))
        XCTAssertFalse(bare.available)
        XCTAssertNil(bare.summary)
    }
}
