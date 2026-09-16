import XCTest
@testable import Sanchara

/// The timeline's pure logic: how a period reports its span, how far through it
/// we are, and how a moment is labelled. The rendering is not tested; these are
/// the parts that would be wrong silently.
final class TimelineTests: XCTestCase {

    private func band(
        lord: String = "Venus",
        start: String = "1997-01-01",
        end: String = "2017-01-01",
        isCurrent: Bool = false,
        isPast: Bool = false,
        eventCount: Int = 0
    ) -> DashaBand {
        DashaBand(
            lord: lord, start: start, end: end, antardashas: [],
            isCurrent: isCurrent, isPast: isPast, eventCount: eventCount
        )
    }

    func testBandReportsLengthInWholeYears() {
        XCTAssertEqual(band(start: "1997-01-01", end: "2017-01-01").years, 20)
        XCTAssertEqual(band(start: "1990-01-01", end: "1996-12-31").years, 7)
    }

    func testBandYearLabelsComeOffTheISODates() {
        let b = band(start: "1997-03-04", end: "2017-11-02")
        XCTAssertEqual(b.startYear, "1997")
        XCTAssertEqual(b.endYear, "2017")
    }

    func testProgressThroughTheCurrentPeriod() {
        let b = band(start: "2000-01-01", end: "2020-01-01")
        XCTAssertEqual(b.progress(today: "2010-01-01"), 0.5, accuracy: 0.01)
        XCTAssertEqual(b.progress(today: "2000-01-01"), 0)
        XCTAssertEqual(b.progress(today: "2020-01-01"), 1)
    }

    /// A date outside the band must pin the bar to an end, not overflow it.
    func testProgressClampsOutsideThePeriod() {
        let b = band(start: "2000-01-01", end: "2020-01-01")
        XCTAssertEqual(b.progress(today: "1990-01-01"), 0)
        XCTAssertEqual(b.progress(today: "2030-01-01"), 1)
    }

    func testProgressIsZeroForAZeroLengthBand() {
        XCTAssertEqual(band(start: "2000-01-01", end: "2000-01-01").progress(today: "2000-01-01"), 0)
    }

    private func event(
        occurredOn: String = "2020-06-01",
        precision: String = "month",
        mahadasha: String? = "Sun",
        antardasha: String? = "Venus"
    ) -> LifeEvent {
        LifeEvent(
            id: "e1", occurredOn: occurredOn, precision: precision, title: "Something",
            note: nil, source: "manual", mahadasha: mahadasha, antardasha: antardasha
        )
    }

    func testEventNamesTheDashaPairItFellIn() {
        XCTAssertEqual(event().duringLabel, "during Sun–Venus")
    }

    func testEventWithOnlyAMahadashaNamesJustThat() {
        XCTAssertEqual(event(antardasha: nil).duringLabel, "during Sun")
    }

    func testEventOutsideTheComputedSpanClaimsNoPeriod() {
        XCTAssertNil(event(mahadasha: nil, antardasha: nil).duringLabel)
    }

    /// The honesty rule: a year-precision memory must not render a month or a
    /// day the user never gave us.
    func testDateIsRenderedOnlyToThePrecisionGiven() {
        let year = event(occurredOn: "2020-01-01", precision: "year").dateLabel
        let month = event(occurredOn: "2020-06-01", precision: "month").dateLabel
        let day = event(occurredOn: "2020-06-15", precision: "day").dateLabel

        XCTAssertTrue(year.contains("2020"))
        XCTAssertFalse(year.contains("1"), "a year label must not leak a day or month number")
        XCTAssertGreaterThan(month.count, year.count)
        XCTAssertGreaterThan(day.count, month.count)
    }

    func testUnknownPrecisionFallsBackToTheFullDate() {
        let label = event(occurredOn: "2020-06-15", precision: "nonsense").dateLabel
        XCTAssertGreaterThan(label.count, 4)
    }

    func testDatesParseInUTCNotTheDeviceZone() {
        let parsed = TimelineDate.parse("2020-06-15")
        XCTAssertNotNil(parsed)
        XCTAssertEqual(TimelineDate.format(parsed!), "2020-06-15")
    }

    func testMalformedDatesParseToNothingRatherThanToday() {
        XCTAssertNil(TimelineDate.parse("not a date"))
        XCTAssertNil(TimelineDate.parse(""))
    }
}
