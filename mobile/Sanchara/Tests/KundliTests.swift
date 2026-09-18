import XCTest
@testable import Sanchara

/// The kundli's pure logic: which rashi lands in which house, how the twelve
/// regions are laid out, and what the chart says when it is asked in words.
///
/// The drawing is not tested. What is tested is everything that could be wrong
/// without looking wrong — a chart with the signs rotated one house off is
/// still a perfectly handsome diagram.
final class KundliTests: XCTestCase {

    private func planet(
        _ name: String,
        sign: String = "Scorpio",
        degree: Double = 14.5,
        house: Int = 1,
        retrograde: Bool = false,
        nakshatra: String? = "Anuradha"
    ) -> ChartPlanet {
        ChartPlanet(
            name: name, sign: sign, degree: degree, house: house,
            retrograde: retrograde, nakshatra: nakshatra
        )
    }

    private func chart(
        ascendant: String = "Scorpio",
        planets: [ChartPlanet] = [],
        dasha: DashaInfo? = nil
    ) -> NatalChart {
        NatalChart(
            tradition: "vedic",
            ascendant: .init(sign: ascendant, degree: 14.5),
            planets: planets,
            moonSign: "Cancer",
            sunSign: "Leo",
            ayanamsa: 24.17,
            dasha: dasha,
            derived: nil
        )
    }

    // MARK: - Rashis in houses

    func testHouseOneHoldsTheLagnaRashi() {
        let houses = chart(ascendant: "Scorpio").houses
        XCTAssertEqual(houses[0].rashi, .vrishchika)
        XCTAssertTrue(houses[0].isLagna)
    }

    func testRashisRunForwardFromTheLagnaAndWrapAtPisces() {
        let houses = chart(ascendant: "Scorpio").houses
        // Vrishchika, Dhanu, Makara, Kumbha, Meena, then back round to Mesha.
        XCTAssertEqual(houses[1].rashi, .dhanu)
        XCTAssertEqual(houses[4].rashi, .meena)
        XCTAssertEqual(houses[5].rashi, .mesha)
        XCTAssertEqual(houses[11].rashi, .tula)
    }

    func testAnAriesLagnaPutsEachRashiInItsOwnNumberedHouse() {
        for house in chart(ascendant: "Aries").houses {
            XCTAssertEqual(house.rashi.number, house.number)
        }
    }

    func testPlanetsAreFiledUnderTheirOwnHouse() {
        let houses = chart(planets: [
            planet("Saturn", house: 7),
            planet("Mars", house: 7),
            planet("Sun", house: 2),
        ]).houses

        XCTAssertEqual(houses[6].planets.map(\.name), ["Saturn", "Mars"])
        XCTAssertEqual(houses[1].planets.map(\.name), ["Sun"])
        XCTAssertTrue(houses[3].planets.isEmpty)
    }

    // MARK: - Formatting

    func testDegreesArePrintedInDegreesAndMinutes() {
        XCTAssertEqual(planet("Sun", degree: 14.5).degreeText, "14°30'")
        XCTAssertEqual(planet("Sun", degree: 0.0).degreeText, "0°00'")
        XCTAssertEqual(planet("Sun", degree: 29.983).degreeText, "29°58'")
    }

    func testEveryGrahaHasItsOwnGlyph() {
        let glyphs = ChartFacts.bodyNames.map { planet($0).glyph }
        XCTAssertEqual(Set(glyphs).count, glyphs.count, "two grahas share a glyph")
        XCTAssertFalse(glyphs.contains { $0.count > 1 }, "a glyph fell back to an abbreviation")
    }

    func testSpokenDescriptionNamesEverythingVoiceOverNeeds() {
        let spoken = planet("Saturn", sign: "Pisces", degree: 3.25, house: 5, retrograde: true).spokenDescription
        XCTAssertTrue(spoken.contains("Saturn"))
        XCTAssertTrue(spoken.contains("Pisces"))
        XCTAssertTrue(spoken.contains("3°15'"))
        XCTAssertTrue(spoken.contains("house 5"))
        XCTAssertTrue(spoken.contains("retrograde"))
    }

    func testAnEmptyHouseSaysSoRatherThanReadingAsBlank() {
        let house = chart().houses[3]
        XCTAssertTrue(house.accessibilityLabel.hasSuffix("Empty."))
    }

    // MARK: - Geometry

    func testTheTwelveHousesTileTheSquareExactly() {
        // The four kites are an eighth of the square each, the eight triangles a
        // sixteenth. Together that is the whole square and no more.
        let total = (1...12).map { Self.area(KundliGeometry.polygon(house: $0)) }.reduce(0, +)
        XCTAssertEqual(total, 1.0, accuracy: 0.0001, "the houses do not tile the chart")
    }

    func testKitesAndTrianglesHaveTheAreasTheyShould() {
        for house in [1, 4, 7, 10] {
            XCTAssertEqual(Self.area(KundliGeometry.polygon(house: house)), 0.125, accuracy: 0.0001)
        }
        for house in [2, 3, 5, 6, 8, 9, 11, 12] {
            XCTAssertEqual(Self.area(KundliGeometry.polygon(house: house)), 0.0625, accuracy: 0.0001)
        }
    }

    func testHouseOneIsAtTheTopAndSevenAtTheBottom() {
        // The one orientation rule a North Indian chart cannot get wrong.
        XCTAssertLessThan(KundliGeometry.labelAnchor(house: 1).y, 0.35)
        XCTAssertGreaterThan(KundliGeometry.labelAnchor(house: 7).y, 0.65)
        XCTAssertLessThan(KundliGeometry.labelAnchor(house: 4).x, 0.35)
        XCTAssertGreaterThan(KundliGeometry.labelAnchor(house: 10).x, 0.65)
    }

    func testEveryLabelAnchorSitsInsideItsOwnHouse() {
        for house in 1...12 {
            let anchor = KundliGeometry.labelAnchor(house: house)
            XCTAssertTrue(
                Self.contains(KundliGeometry.polygon(house: house), anchor),
                "house \(house)'s label would be drawn outside it"
            )
        }
    }

    /// The shoelace formula.
    private static func area(_ points: [CGPoint]) -> CGFloat {
        var sum: CGFloat = 0
        for i in points.indices {
            let a = points[i], b = points[(i + 1) % points.count]
            sum += a.x * b.y - b.x * a.y
        }
        return abs(sum) / 2
    }

    /// Winding test, which handles the concave kites the centroid test needs.
    private static func contains(_ polygon: [CGPoint], _ point: CGPoint) -> Bool {
        var inside = false
        var j = polygon.count - 1
        for i in polygon.indices {
            let a = polygon[i], b = polygon[j]
            if (a.y > point.y) != (b.y > point.y),
               point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x {
                inside.toggle()
            }
            j = i
        }
        return inside
    }
}
