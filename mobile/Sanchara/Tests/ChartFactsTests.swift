import XCTest
@testable import Sanchara

/// The table the on-device model reads.
///
/// Two things are asserted and both matter. That the derived rows appear when
/// the server sent them, and that every row falls back cleanly when it did not
/// — a chart cached before derived facts shipped must still answer.
///
/// The third property, that the real model does not refuse this wording, cannot
/// be tested here. See the release gate in the plan.
final class ChartFactsTests: XCTestCase {

    private let venus = DerivedPlanet(
        name: "Venus", house: 7, rules: [7, 12], dignity: "exalted",
        combust: false, fromSun: 41.2, aspects: [1], conjunct: []
    )

    /// A dasha, so `currentPeriod()` — which is nil whenever `chart.dasha` is
    /// nil — actually renders. This is what lets the forbidden-vocabulary
    /// sweep reach the derived-append branch inside `currentPeriod()`, and
    /// lets the fallback test prove that branch stays silent when the server
    /// sent no derived block.
    private let period = DashaInfo(
        mahadasha: "Venus", mahadashaStart: "2020-01-01", mahadashaEnd: "2040-01-01",
        antardasha: "Venus", antardashaStart: "2020-01-01", antardashaEnd: "2022-01-01"
    )

    private func chart(derived: DerivedFacts?, dasha: DashaInfo? = nil) -> NatalChart {
        NatalChart(
            tradition: "vedic",
            ascendant: .init(sign: "Scorpio", degree: 14.5),
            planets: [
                ChartPlanet(name: "Venus", sign: "Taurus", degree: 2.0, house: 7,
                            retrograde: false, nakshatra: "Krittika"),
            ],
            moonSign: "Cancer",
            sunSign: "Leo",
            ayanamsa: 24.17,
            dasha: dasha,
            derived: derived
        )
    }

    private var full: ChartFacts {
        ChartFacts(chart: chart(derived: DerivedFacts(
            planets: [venus],
            houses: [DerivedHouse(number: 7, sign: "Taurus", lord: "Venus",
                                  lordHouse: 7, occupants: ["Venus"])],
            dasha: []
        )))
    }

    private var bare: ChartFacts { ChartFacts(chart: chart(derived: nil)) }

    /// `full`, but also carrying a dasha and a derived period bound to Venus,
    /// so `currentPeriod()` renders its derived-append branch.
    private var fullWithPeriod: ChartFacts {
        ChartFacts(chart: chart(
            derived: DerivedFacts(
                planets: [venus],
                houses: [DerivedHouse(number: 7, sign: "Taurus", lord: "Venus",
                                      lordHouse: 7, occupants: ["Venus"])],
                dasha: [DerivedPeriod(level: "mahadasha", lord: "Venus", placement: venus)]
            ),
            dasha: period
        ))
    }

    /// A dasha with no derived block at all — the case `bare` cannot exercise,
    /// since `bare` never sets `chart.dasha`.
    private var bareWithPeriod: ChartFacts { ChartFacts(chart: chart(derived: nil, dasha: period)) }

    func testBodyRowNamesWhatItControlsWithoutAstrologyWords() throws {
        let row = try XCTUnwrap(full.body(named: "Venus"))
        XCTAssertTrue(row.contains("Controls sections 7, 12"), row)
        XCTAssertTrue(row.contains("Strength rating: highest"), row)
        XCTAssertTrue(row.contains("Linked to sections 1"), row)
    }

    /// Every row builder that can carry derived text — `body(named:)` (via
    /// `everything()`), `section(_:)`, and `currentPeriod()` (via
    /// `fullWithPeriod`, which is the only fixture where it renders) — is
    /// swept here. A banned word leaking from any one of them fails this test.
    func testNoForbiddenVocabularyReachesTheModel() throws {
        var row = try XCTUnwrap(full.body(named: "Venus")) + full.everything()
        row += try XCTUnwrap(full.section(7))
        row += try XCTUnwrap(fullWithPeriod.currentPeriod())
        for word in ["lord", "aspect", "exalt", "debilit", "house", "dosha", "planet", "astrolog"] {
            XCTAssertFalse(row.lowercased().contains(word), "leaked \(word): \(row)")
        }
    }

    func testSectionRowNamesItsController() throws {
        let row = try XCTUnwrap(full.section(7))
        XCTAssertTrue(row.contains("controlled by Venus"), row)
    }

    /// The period row, once a dasha and a derived block are both present,
    /// names where the running lord is filed and what it controls.
    func testCurrentPeriodRowNamesTheRunningEntrysPlacement() throws {
        let row = try XCTUnwrap(fullWithPeriod.currentPeriod())
        XCTAssertTrue(row.contains("filed in section 7"), row)
        XCTAssertTrue(row.contains("controlling sections 7, 12"), row)
    }

    func testEveryRowFallsBackWhenTheServerSentNoDerivedBlock() throws {
        let row = try XCTUnwrap(bare.body(named: "Venus"))
        XCTAssertTrue(row.contains("Venus"), row)
        XCTAssertFalse(row.contains("Controls"), row)
        XCTAssertNotNil(bare.section(7))
        XCTAssertFalse(bare.everything().isEmpty)

        // A chart with a dasha but no derived block must still answer the
        // period question — just without the derived-append sentence.
        let periodRow = try XCTUnwrap(bareWithPeriod.currentPeriod())
        XCTAssertTrue(periodRow.contains("Current major period: Venus"), periodRow)
        XCTAssertFalse(periodRow.contains("filed in section"), periodRow)
    }
}
