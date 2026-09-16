import SwiftUI
import XCTest
@testable import Sanchara

/// Renders the kundli to a PNG so it can be looked at.
///
/// Not an assertion about pixels — a snapshot test that fails whenever anyone
/// touches a colour is a test that gets deleted. This exists so the diagram can
/// be inspected during development without launching the app and signing in,
/// and it asserts only that something was drawn.
final class KundliSnapshotTests: XCTestCase {

    @MainActor
    func testRendersTheChart() throws {
        let chart = NatalChart(
            tradition: "vedic",
            ascendant: .init(sign: "Scorpio", degree: 14.5),
            planets: [
                ChartPlanet(name: "Sun", sign: "Leo", degree: 21.4, house: 10, retrograde: false, nakshatra: "Purva Phalguni"),
                ChartPlanet(name: "Moon", sign: "Cancer", degree: 3.1, house: 9, retrograde: false, nakshatra: "Punarvasu"),
                ChartPlanet(name: "Mercury", sign: "Virgo", degree: 8.9, house: 11, retrograde: true, nakshatra: "Uttara Phalguni"),
                ChartPlanet(name: "Venus", sign: "Leo", degree: 28.2, house: 10, retrograde: false, nakshatra: "Uttara Phalguni"),
                ChartPlanet(name: "Mars", sign: "Scorpio", degree: 2.7, house: 1, retrograde: false, nakshatra: "Vishakha"),
                ChartPlanet(name: "Jupiter", sign: "Pisces", degree: 17.0, house: 5, retrograde: false, nakshatra: "Revati"),
                ChartPlanet(name: "Saturn", sign: "Aquarius", degree: 11.6, house: 4, retrograde: true, nakshatra: "Shatabhisha"),
                ChartPlanet(name: "Rahu", sign: "Taurus", degree: 19.3, house: 7, retrograde: false, nakshatra: "Mrigashira"),
                ChartPlanet(name: "Ketu", sign: "Scorpio", degree: 19.3, house: 1, retrograde: false, nakshatra: "Jyeshtha"),
            ],
            moonSign: "Cancer",
            sunSign: "Leo",
            ayanamsa: 24.17,
            dasha: DashaInfo(
                mahadasha: "Venus", mahadashaStart: "2012-04-01", mahadashaEnd: "2032-04-01",
                antardasha: "Mercury", antardashaStart: "2025-02-01", antardashaEnd: "2027-12-01"
            )
        )

        let view = KundliChartView(chart: chart, selected: .constant(nil))
            .frame(width: 340, height: 340)
            .padding(20)
            .background(Theme.bg)

        let renderer = ImageRenderer(content: view)
        renderer.scale = 3
        let image = try XCTUnwrap(renderer.uiImage, "the chart rendered to nothing")
        let png = try XCTUnwrap(image.pngData())
        XCTAssertGreaterThan(png.count, 2_000, "the chart rendered but appears blank")

        let url = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("kundli-chart.png")
        try png.write(to: url)
        print("KUNDLI_SNAPSHOT_PATH=\(url.path)")
    }
}
