import XCTest
@testable import Sanchara

/// `NatalChart.derived` is optional for two reasons at once: a chart cached in
/// the app group before this shipped has no `derived` key at all, and a
/// server chart that predates the derived layer never will either. Both cases
/// are decoded inside the widget and the Siri intent processes, which cannot
/// report a decode failure — a widget just shows a placeholder and a Siri
/// answer never arrives. That makes `Codable` behaviour, not the memberwise
/// initialiser, the thing worth testing here.
final class DerivedFactsTests: XCTestCase {

    /// A `NatalChart` payload with everything but `derived`. This is the
    /// pre-migration shape stored on disk before this feature shipped.
    private let chartWithoutDerived = """
    {
      "tradition": "vedic",
      "ascendant": { "sign": "Scorpio", "degree": 14.5 },
      "planets": [],
      "moonSign": "Cancer",
      "sunSign": "Leo",
      "ayanamsa": 24.17,
      "dasha": null
    }
    """

    /// The same chart, now carrying `derived` with one planet, one house and
    /// one dasha period — plus a `conditions` array, which the server does
    /// emit but `DerivedFacts` deliberately does not declare. If unknown-key
    /// tolerance ever broke, this is the payload that would catch it.
    private let chartWithDerived = """
    {
      "tradition": "vedic",
      "ascendant": { "sign": "Scorpio", "degree": 14.5 },
      "planets": [],
      "moonSign": "Cancer",
      "sunSign": "Leo",
      "ayanamsa": 24.17,
      "dasha": null,
      "derived": {
        "planets": [
          {
            "name": "Jupiter",
            "house": 5,
            "rules": [3, 12],
            "dignity": "own",
            "combust": false,
            "fromSun": 92.4,
            "aspects": [9, 11, 1],
            "conjunct": ["Venus"]
          }
        ],
        "houses": [
          {
            "number": 1,
            "sign": "Scorpio",
            "lord": "Mars",
            "lordHouse": 6,
            "occupants": ["Mars", "Ketu"]
          }
        ],
        "dasha": [
          {
            "level": "mahadasha",
            "lord": "Jupiter",
            "placement": {
              "name": "Jupiter",
              "house": 5,
              "rules": [3, 12],
              "dignity": "own",
              "combust": false,
              "fromSun": 92.4,
              "aspects": [9, 11, 1],
              "conjunct": ["Venus"]
            }
          },
          {
            "level": "antardasha",
            "lord": "Rahu",
            "placement": null
          }
        ],
        "conditions": [
          { "name": "mangal-dosha", "present": true }
        ]
      }
    }
    """

    func testChartWithoutDerivedKeyDecodesToNilRatherThanFailing() throws {
        let chart = try JSONDecoder().decode(NatalChart.self, from: Data(chartWithoutDerived.utf8))
        XCTAssertNil(chart.derived)
    }

    func testChartWithDerivedFactsDecodesValuesInPlace() throws {
        let chart = try JSONDecoder().decode(NatalChart.self, from: Data(chartWithDerived.utf8))
        let derived = try XCTUnwrap(chart.derived)

        let planet = try XCTUnwrap(derived.planets.first)
        XCTAssertEqual(planet.name, "Jupiter")
        XCTAssertEqual(planet.rules, [3, 12])
        XCTAssertEqual(planet.dignity, "own")
        XCTAssertEqual(planet.fromSun, 92.4)

        let house = try XCTUnwrap(derived.houses.first)
        XCTAssertEqual(house.lordHouse, 6)
        XCTAssertEqual(house.occupants, ["Mars", "Ketu"])

        let mahadasha = try XCTUnwrap(derived.dasha.first)
        XCTAssertEqual(mahadasha.placement?.house, 5)
    }

    /// `conditions` is the real payload shape — the server emits it — even
    /// though `DerivedFacts` never declares it. This pins the assumption the
    /// whole subset design rests on: an undeclared key does not fail the
    /// decode.
    func testUnknownConditionsKeyIsIgnoredRatherThanFailingTheDecode() throws {
        XCTAssertNoThrow(try JSONDecoder().decode(NatalChart.self, from: Data(chartWithDerived.utf8)))
    }

    /// `placement` is the one field inside `DerivedPeriod` that is genuinely
    /// optional server-side — an antardasha lord that is not itself a natal
    /// planet. Decoded directly, an absent key must land as `nil`, not throw.
    func testDerivedPeriodWithAbsentPlacementDecodesToNil() throws {
        let json = """
        {
          "level": "antardasha",
          "lord": "Rahu"
        }
        """
        let period = try JSONDecoder().decode(DerivedPeriod.self, from: Data(json.utf8))
        XCTAssertNil(period.placement)
        XCTAssertEqual(period.lord, "Rahu")
    }
}
