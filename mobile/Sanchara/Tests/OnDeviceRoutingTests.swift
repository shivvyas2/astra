import XCTest
@testable import Sanchara

/// The half of on-device routing that does not need Apple Intelligence: what
/// counts as a question the chart can answer, and what the chart says back.
///
/// The model itself is not tested here — it cannot be, on a machine without
/// Apple Intelligence, and its answers are not deterministic anyway. What is
/// tested is everything that decides *whether* it runs, because those are the
/// decisions that cost money when they are wrong: a lookup that escalates is a
/// paid call that did not need making, and an interpretive question that does
/// not escalate is a thin answer where a reading was wanted.
final class OnDeviceRoutingTests: XCTestCase {

    private func chart(
        planets: [ChartPlanet] = [
            ChartPlanet(name: "Saturn", sign: "Pisces", degree: 3.25, house: 5,
                        retrograde: true, nakshatra: "Uttara Bhadrapada"),
            ChartPlanet(name: "Moon", sign: "Cancer", degree: 21.0, house: 9,
                        retrograde: false, nakshatra: "Ashlesha"),
        ],
        dasha: DashaInfo? = DashaInfo(
            mahadasha: "Venus", mahadashaStart: "2012-04-01", mahadashaEnd: "2032-04-01",
            antardasha: "Mercury", antardashaStart: "2025-02-01", antardashaEnd: "2027-12-01"
        )
    ) -> NatalChart {
        NatalChart(
            tradition: "vedic",
            ascendant: .init(sign: "Scorpio", degree: 14.5),
            planets: planets,
            moonSign: "Cancer",
            sunSign: "Leo",
            ayanamsa: 24.17,
            dasha: dasha,
            derived: nil
        )
    }

    private var facts: ChartFacts { ChartFacts(chart: chart()) }

    // MARK: - The cheap filter

    func testQuestionsNamingPartOfTheChartGetOffered() {
        for question in [
            "where is my saturn",
            "what's in my 7th house",
            "what's in house 12",
            "which dasha am I in",
            "what is my lagna",
            "what nakshatra is my moon in",
        ] {
            XCTAssertTrue(
                OnDeviceReasoner.mentionsTheTable(question),
                "\"\(question)\" should reach the on-device router"
            )
        }
    }

    func testQuestionsAboutLifeNeverReachTheModel() {
        for question in [
            "should I take the job",
            "is he the one",
            "how will this year go for me",
            "when will I get married",
            "tell me about myself",
        ] {
            XCTAssertFalse(
                OnDeviceReasoner.mentionsTheTable(question),
                "\"\(question)\" should go straight to a full reading"
            )
        }
    }

    // MARK: - Reading a house number out of a sentence

    func testHouseNumbersAreFoundHoweverTheyAreWritten() {
        XCTAssertEqual(ChartFacts.sectionNumber(in: "what's in my 7th house"), 7)
        XCTAssertEqual(ChartFacts.sectionNumber(in: "house 12"), 12)
        XCTAssertEqual(ChartFacts.sectionNumber(in: "my fourth house"), 4)
        XCTAssertEqual(ChartFacts.sectionNumber(in: "the 1st"), 1)
    }

    func testNumbersOutsideTheTwelveAreNotHouses() {
        XCTAssertNil(ChartFacts.sectionNumber(in: "my 40th birthday"))
        XCTAssertNil(ChartFacts.sectionNumber(in: "nothing numeric here"))
    }

    // MARK: - What the table returns

    func testABodyRowCarriesEverythingNeededToAnswer() {
        let row = facts.body(named: "Saturn")
        XCTAssertNotNil(row)
        XCTAssertTrue(row!.contains("Pisces"))
        XCTAssertTrue(row!.contains("3°15'"))
        XCTAssertTrue(row!.contains("section 5"))
        XCTAssertTrue(row!.contains("Uttara Bhadrapada"))
        XCTAssertTrue(row!.contains("retrograde"))
    }

    func testABodyLookupIsCaseInsensitive() {
        XCTAssertNotNil(facts.body(named: "saturn"))
        XCTAssertNotNil(facts.body(named: "  MOON "))
    }

    func testAMissingBodyReturnsNothingRatherThanAGuess() {
        XCTAssertNil(facts.body(named: "Pluto"))
        XCTAssertNil(facts.body(named: ""))
    }

    func testAnEmptySectionSaysSoExplicitly() {
        // Scorpio rising: section 3 is Makara, and nothing is filed there.
        let row = facts.section(3)
        XCTAssertNotNil(row)
        XCTAssertTrue(row!.contains("No entries are filed under it"))
    }

    func testASectionListsWhatItHolds() {
        let row = facts.section(5)
        XCTAssertNotNil(row)
        XCTAssertTrue(row!.contains("Saturn"))
        XCTAssertTrue(row!.contains("retrograde"))
    }

    func testTheCurrentPeriodRowNamesBothLordsAndBothEndDates() {
        let row = facts.currentPeriod()
        XCTAssertNotNil(row)
        XCTAssertTrue(row!.contains("Venus"))
        XCTAssertTrue(row!.contains("Mercury"))
        XCTAssertTrue(row!.contains("1 April 2032"))
    }

    func testAChartWithoutADashaHasNoPeriodRow() {
        XCTAssertNil(ChartFacts(chart: chart(dasha: nil)).currentPeriod())
    }

    /// The load-bearing constraint. Apple's on-device model refuses anything it
    /// reads as fortune telling, so not one word of what it is handed may name
    /// the practice. If this test fails, the feature silently stops answering.
    func testNothingHandedToTheModelNamesAstrology() {
        let forbidden = [
            "astrolog", "horoscope", "kundli", "vedic", "zodiac", "planet", "graha",
            "house", "rashi", "dasha", "nakshatra", "birth chart", "fortune", "predict",
        ]
        let everything = facts.everything().lowercased()
        for word in forbidden {
            XCTAssertFalse(
                everything.contains(word),
                "the word \"\(word)\" reached the on-device model and will draw a refusal"
            )
        }
    }
}
