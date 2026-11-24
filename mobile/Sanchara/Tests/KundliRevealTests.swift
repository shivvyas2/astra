import XCTest
import SwiftUI
@testable import Sanchara

@MainActor
final class KundliRevealTests: XCTestCase {
    private func planet(_ name: String, _ sign: String, _ degree: Double, house: Int = 1) -> ChartPlanet {
        ChartPlanet(name: name, sign: sign, degree: degree, house: house, retrograde: false, nakshatra: nil)
    }
    private func chart(ascendant: Double = 14) -> NatalChart {
        NatalChart(
            tradition: "vedic", ascendant: .init(sign: "Aries", degree: ascendant),
            planets: [planet("Sun", "Aquarius", 24, house: 11), planet("Mars", "Capricorn", 20.8, house: 10), planet("Saturn", "Capricorn", 19.9, house: 10)],
            moonSign: "Aries", sunSign: "Aquarius", ayanamsa: nil, dasha: nil, derived: nil
        )
    }

    func testLongitudeIsThirtyDegreesASign() {
        XCTAssertEqual(KundliReveal.longitude(of: planet("Sun", "Aries", 0)), 0)
        XCTAssertEqual(KundliReveal.longitude(of: planet("Sun", "Aquarius", 24.5)), 324.5)
        XCTAssertNil(KundliReveal.longitude(of: planet("Sun", "Nowhere", 1)))
    }

    func testTheNodesSitOppositeEachOther() {
        let rahu = KundliReveal.longitude(of: planet("Rahu", "Sagittarius", 12.5))!
        let ketu = KundliReveal.longitude(of: planet("Ketu", "Gemini", 12.5))!
        XCTAssertEqual(abs(rahu - ketu), 180)
    }

    func testCloseTogetherPlanetsFanOut() {
        let rings = KundliReveal.rings(chart().planets)
        XCTAssertNotEqual(rings["Mars"], rings["Saturn"])
        XCTAssertEqual(rings["Sun"], 0)
        // Across 0 Aries too.
        let seam = KundliReveal.rings([planet("Sun", "Pisces", 28), planet("Moon", "Aries", 2)])
        XCTAssertNotEqual(seam["Sun"], seam["Moon"])
    }

    func testACorrectedChartHasANewKeyAndTheSameChartKeepsIts() {
        XCTAssertEqual(KundliReveal.key(for: chart()), KundliReveal.key(for: chart()))
        XCTAssertNotEqual(KundliReveal.key(for: chart()), KundliReveal.key(for: chart(ascendant: 15)))
    }

    func testTheEndOfTheDrawingIsInsideItsOwnLength() {
        XCTAssertLessThanOrEqual(KundliReveal.settleAt + KundliReveal.settleFor, KundliReveal.duration + 0.001)
        XCTAssertLessThan(KundliReveal.lastLanding, KundliReveal.settleAt)
    }
}
