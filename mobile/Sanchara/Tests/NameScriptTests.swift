import SwiftUI
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

    func testEveryScriptUsesLettersAndUnknownNamesPassThrough() {
        XCTAssertEqual(planet("Sun").chartLabel(in: .english), "Su")
        XCTAssertEqual(planet("Moon").chartLabel(in: .english), "Mo")
        for script in NameScript.allCases {
            XCTAssertEqual(Set(ChartPlanet.order.map { planet($0).chartLabel(in: script) }).count, 9, "\(script)")
        }
        XCTAssertEqual(planet("Sun").chartLabel(in: .sanskrit), "Su")
        XCTAssertEqual(ChartPlanet.name(english: "Pluto", in: .hindi), "Pluto")
    }

    func testAHouseWritesFullNamesWhereItHasRoom() {
        func labels(_ number: Int, _ count: Int, _ type: DynamicTypeSize = .large) -> KundliLabels {
            let planets = ChartPlanet.order.prefix(count).map { planet($0) }
            return KundliLabels(KundliHouse(number: number, rashi: .mesha, planets: planets), script: .english, side: 320, glyphSize: 15, typeSize: type)
        }
        for kite in [1, 4, 7, 10] { XCTAssertEqual([4, 5].map { labels(kite, $0).full }, [true, false]) }
        for triangle in [2, 3, 5, 6, 8, 9, 11, 12] { XCTAssertEqual([2, 3].map { labels(triangle, $0).full }, [true, false]) }
        XCTAssertEqual(labels(1, 2).rows.count, 2)
        XCTAssertEqual(labels(1, 2).text(planet("Mercury")), "Mercury")
        XCTAssertEqual(labels(2, 3).text(planet("Mercury")), "Me")
        XCTAssertFalse(labels(1, 1, .accessibility1).full)
    }

    func testAnEarlierChoiceSurvivesAndAnEchoOfTheLanguageDoesNot() throws {
        let d = try XCTUnwrap(UserDefaults(suiteName: "names-test"))
        d.removePersistentDomain(forName: "names-test")
        let echo = NameScript.followingLanguage
        let other = try XCTUnwrap(NameScript.allCases.first { $0 != echo })
        d.set(echo.rawValue, forKey: "kundli.nameScript")
        NameScript.keepEarlierChoice(d)
        XCTAssertNil(d.string(forKey: NameScript.storageKey))

        d.removePersistentDomain(forName: "names-test")
        d.set(other.rawValue, forKey: "kundli.nameScript")
        NameScript.keepEarlierChoice(d)
        XCTAssertEqual(d.string(forKey: NameScript.storageKey), other.rawValue)
        // Once only: a later change of mind is not undone.
        d.removeObject(forKey: NameScript.storageKey)
        NameScript.keepEarlierChoice(d)
        XCTAssertNil(d.string(forKey: NameScript.storageKey))
        d.removePersistentDomain(forName: "names-test")
    }
}
