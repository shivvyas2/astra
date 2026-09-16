import XCTest
@testable import Sanchara

/// How a proposed moment becomes a pinned one: a dated candidate goes through
/// as it came, an undated one needs a year and lands on January 1st at year
/// precision, and the add button waits for every chosen undated one.
final class CandidateResolverTests: XCTestCase {

    private let dated = CandidateEvent(
        occurredOn: "2019-11-01", precision: "month", title: "Left the job", evidence: "I left in Nov 2019"
    )
    private let undated = CandidateEvent(
        occurredOn: nil, precision: "unknown", title: "Got married", evidence: "since we got married"
    )

    func testDatedCandidatePassesThroughUnchanged() {
        let event = CandidateResolver.resolve(dated, year: nil)
        XCTAssertEqual(event, NewLifeEvent(
            occurredOn: "2019-11-01", precision: "month", title: "Left the job", note: nil, source: "extracted"
        ))
    }

    func testUndatedCandidateWithoutAYearCannotBeResolved() {
        XCTAssertNil(CandidateResolver.resolve(undated, year: nil))
    }

    func testUndatedCandidateBecomesAYearPrecisionMomentOnJanuaryFirst() {
        let event = CandidateResolver.resolve(undated, year: 2015)
        XCTAssertEqual(event?.occurredOn, "2015-01-01")
        XCTAssertEqual(event?.precision, "year")
        XCTAssertEqual(event?.source, "extracted")
    }

    func testAddIsBlockedUntilEveryChosenUndatedCandidateHasAYear() {
        XCTAssertFalse(CandidateResolver.canAdd(chosen: [], years: [:]))
        XCTAssertTrue(CandidateResolver.canAdd(chosen: [dated], years: [:]))
        XCTAssertFalse(CandidateResolver.canAdd(chosen: [dated, undated], years: [:]))
        XCTAssertTrue(CandidateResolver.canAdd(chosen: [dated, undated], years: [undated.id: 2015]))
    }

    func testYearRangeRunsFromBirthToToday() {
        XCTAssertEqual(CandidateResolver.yearRange(birthDate: "1990-06-15", today: "2026-09-16"), 1990...2026)
        // A clock set before the birth date cannot produce an invalid range.
        XCTAssertEqual(CandidateResolver.yearRange(birthDate: "2030-01-01", today: "2026-09-16"), 2026...2026)
    }

    func testUndatedCandidateDecodesFromANullDate() throws {
        let json = #"{"occurredOn":null,"precision":"unknown","title":"Moved to Pune","evidence":"when I moved to Pune"}"#
        let candidate = try JSONDecoder().decode(CandidateEvent.self, from: Data(json.utf8))
        XCTAssertTrue(candidate.isUndated)
        XCTAssertNil(candidate.dateLabel)
        XCTAssertEqual(candidate.evidence, "when I moved to Pune")
    }

    func testOlderServerRepliesWithoutEvidenceStillDecode() throws {
        let json = #"{"occurredOn":"2021-01-01","precision":"year","title":"Started the business"}"#
        let candidate = try JSONDecoder().decode(CandidateEvent.self, from: Data(json.utf8))
        XCTAssertEqual(candidate.evidence, "")
        XCTAssertEqual(candidate.dateLabel, "2021")
    }

    func testTimelinePayloadDecodesTheExplainFields() throws {
        let json = """
        {"birthDate":"1990-06-15","today":"2026-09-16","scanned":true,"messagesSinceScan":12,"needsExplaining":false,
         "periods":[{"lord":"Saturn","start":"2019-01-01","end":"2038-01-01","antardashas":[],"isCurrent":true,"isPast":false,
                     "eventCount":1,"theme":"Building slowly","meaning":"A paragraph.","stale":true}],
         "events":[],
         "now":{"lord":"Saturn","antardasha":"Mercury","start":"2024-03-01","end":"2026-11-01","theme":"t","meaning":"m"}}
        """
        let payload = try JSONDecoder().decode(TimelinePayload.self, from: Data(json.utf8))
        XCTAssertEqual(payload.periods.first?.theme, "Building slowly")
        XCTAssertEqual(payload.periods.first?.stale, true)
        XCTAssertEqual(payload.now?.pairLabel, "Saturn – Mercury")
        XCTAssertEqual(payload.messagesSinceScan, 12)
    }

    func testTimelinePayloadFromAnOlderServerStillDecodes() throws {
        let json = """
        {"birthDate":"1990-06-15","today":"2026-09-16","scanned":false,
         "periods":[{"lord":"Saturn","start":"2019-01-01","end":"2038-01-01","antardashas":[],"isCurrent":true,"isPast":false,"eventCount":0}],
         "events":[]}
        """
        let payload = try JSONDecoder().decode(TimelinePayload.self, from: Data(json.utf8))
        XCTAssertNil(payload.periods.first?.theme)
        XCTAssertFalse(payload.periods.first?.stale ?? true)
        XCTAssertNil(payload.now)
        XCTAssertFalse(payload.needsExplaining)
        XCTAssertEqual(payload.messagesSinceScan, 0)
    }
}
