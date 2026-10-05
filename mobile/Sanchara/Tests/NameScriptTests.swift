import XCTest
@testable import Sanchara

/// The kundli's names toggle: every graha and rashi has a name in every
/// script, and the tables line up with the API's English names.
final class NameScriptTests: XCTestCase {
    private func planet(_ name: String) -> ChartPlanet {
        ChartPlanet(name: name, sign: "Leo", degree: 1, house: 1, retrograde: false, nakshatra: nil)
    }

    func testEveryGrahaHasANameAndChartLabelInEveryScript() {
        for script in NameScript.allCases {
            let names = Set(ChartPlanet.order.map { planet($0).name(in: script) })
            XCTAssertEqual(names.count, 9, "\(script) repeats or drops a graha")
            for english in ChartPlanet.order {
                XCTAssertFalse(planet(english).chartLabel(in: script).isEmpty)
            }
        }
    }

    func testEveryRashiHasADistinctNameInEveryScript() {
        for script in NameScript.allCases {
            XCTAssertEqual(Set(Rashi.allCases.map { $0.name(in: script) }).count, 12, "\(script)")
        }
    }

    func testTablesLineUpWithTheEnglishNames() {
        XCTAssertEqual(planet("Saturn").name(in: .sanskrit), "Shani")
        XCTAssertEqual(planet("Jupiter").name(in: .hindi), "गुरु")
        XCTAssertEqual(planet("Mars").name(in: .gujarati), "મંગળ")
        XCTAssertEqual(ChartPlanet.name(english: "Venus", in: .gujarati), "શુક્ર")
        XCTAssertEqual(Rashi.vrishchika.name(in: .gujarati), "વૃશ્ચિક")
        XCTAssertEqual(Rashi.meena.name(in: .hindi), "मीन")
        XCTAssertEqual(Rashi.mesha.name(in: .english), "Aries")
    }

    func testEnglishKeepsTheGlyphsAndUnknownNamesPassThrough() {
        XCTAssertEqual(planet("Sun").chartLabel(in: .english), "☉")
        XCTAssertEqual(planet("Sun").chartLabel(in: .sanskrit), "Su")
        XCTAssertEqual(ChartPlanet.name(english: "Pluto", in: .hindi), "Pluto")
    }
}
