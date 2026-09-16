import XCTest
@testable import Sanchara

/// The maths behind the period widget's bar and its "N years left" caption,
/// and the cache the widget reads. Both are shared with the widget target, so
/// a mistake here would show on the Home Screen with no way to notice it in
/// the app.
final class PeriodProgressTests: XCTestCase {

    func testFractionIsZeroAtStartAndOneAtEnd() {
        XCTAssertEqual(PeriodProgress.fraction(start: "2019-01-01", end: "2038-01-01", today: "2019-01-01"), 0)
        XCTAssertEqual(PeriodProgress.fraction(start: "2019-01-01", end: "2038-01-01", today: "2038-01-01"), 1)
    }

    func testFractionIsHalfwayAtTheMidpoint() {
        let f = PeriodProgress.fraction(start: "2020-01-01", end: "2022-01-01", today: "2021-01-01")
        XCTAssertEqual(f, 0.5, accuracy: 0.002)
    }

    func testFractionClampsOutsideThePeriod() {
        XCTAssertEqual(PeriodProgress.fraction(start: "2020-01-01", end: "2022-01-01", today: "2010-01-01"), 0)
        XCTAssertEqual(PeriodProgress.fraction(start: "2020-01-01", end: "2022-01-01", today: "2030-01-01"), 1)
    }

    func testZeroLengthAndMalformedDatesGiveZero() {
        XCTAssertEqual(PeriodProgress.fraction(start: "2020-01-01", end: "2020-01-01", today: "2020-01-01"), 0)
        XCTAssertEqual(PeriodProgress.fraction(start: "not a date", end: "2020-01-01", today: "2020-01-01"), 0)
    }

    func testYearsRemainingRoundsDownAndNeverGoesNegative() {
        XCTAssertEqual(PeriodProgress.yearsRemaining(end: "2038-01-01", today: "2026-06-01"), 11)
        XCTAssertEqual(PeriodProgress.yearsRemaining(end: "2038-01-01", today: "2037-12-31"), 0)
        XCTAssertEqual(PeriodProgress.yearsRemaining(end: "2020-01-01", today: "2026-01-01"), 0)
    }

    func testDashaBandProgressAgreesWithTheSharedHelper() {
        let band = DashaBand(
            lord: "Saturn", start: "2019-01-01", end: "2038-01-01", antardashas: [],
            isCurrent: true, isPast: false, eventCount: 0
        )
        XCTAssertEqual(
            band.progress(today: "2026-09-16"),
            PeriodProgress.fraction(start: "2019-01-01", end: "2038-01-01", today: "2026-09-16")
        )
    }

    // MARK: - Cache round trip

    func testCachedPeriodSurvivesTheRoundTrip() {
        let period = ChartCache.CachedPeriod(
            lord: "Saturn", antardasha: "Mercury",
            start: "2019-01-01", end: "2038-01-01",
            antardashaStart: "2024-03-01", antardashaEnd: "2026-11-01",
            theme: "Building slowly, then being tested",
            nowMeaning: "Two sentences about now.",
            savedAt: Date(timeIntervalSince1970: 1_700_000_000)
        )
        ChartCache.shared.save(period: period)
        // The write is queued on the cache's own queue; a read on the same
        // queue lands after it.
        let loaded = waitForPeriod()
        XCTAssertEqual(loaded, period)
    }

    func testClearRemovesTheCachedPeriod() {
        ChartCache.shared.save(period: ChartCache.CachedPeriod(
            lord: "Venus", antardasha: "Venus", start: "1997-01-01", end: "2017-01-01",
            antardashaStart: "1997-01-01", antardashaEnd: "2000-05-01",
            theme: nil, nowMeaning: nil, savedAt: Date()
        ))
        XCTAssertNotNil(waitForPeriod())
        ChartCache.shared.clear()
        XCTAssertNil(waitForPeriod())
    }

    /// Reads are synchronous on the cache queue and writes are asynchronous
    /// on it, so a read issued after a write sees the write.
    private func waitForPeriod() -> ChartCache.CachedPeriod? {
        ChartCache.shared.loadPeriod()
    }
}
