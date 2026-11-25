import SwiftUI
import XCTest
@testable import Sanchara

/// Charts drawn in a reading: how they arrive, and when they are left as words.
final class ChartBlockTests: XCTestCase {
    private let signs = ["Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces", "Aries"]

    private func block(_ id: String = "D9", items: [Int: String] = [1: "Moon, Jupiter (R)", 7: "Venus"]) -> String {
        (["**Chart \(id) (Asha)**"] + signs.enumerated().map { "- \($0 + 1) \($1): \(items[$0 + 1] ?? "-")" }).joined(separator: "\n")
    }

    func testAChartIsLiftedOutOfTheWords() throws {
        let (charts, prose) = ChartBlock.split(block() + "\n\n**Love**\nMost likely yes.")
        XCTAssertEqual(charts.count, 1)
        XCTAssertEqual(charts[0].id, "D9")
        XCTAssertEqual(charts[0].name, "Asha")
        XCTAssertFalse(prose.contains("Taurus"))
        XCTAssertTrue(prose.contains("**Love**\nMost likely yes."))
        let natal = try XCTUnwrap(charts[0].natal)
        XCTAssertEqual(natal.ascendant.sign, "Taurus")
        XCTAssertEqual(natal.houses[0].planets.map(\.name), ["Moon", "Jupiter"])
        XCTAssertEqual(natal.houses[0].planets.map(\.retrograde), [false, true])
        XCTAssertEqual(natal.houses[6].planets.map(\.name), ["Venus"])
        XCTAssertEqual(natal.houses[6].rashi, .vrishchika)
    }

    func testPointsAndDashas() {
        let (charts, _) = ChartBlock.split(block("SAV", items: [1: "28", 2: "31"]) + "\n\n**Chart Dasha (Asha)**\n- Ketu: 1999-03-14 to 2004-01-02\n- Venus: 2004-01-02 to 2024-01-02\n\nWords.")
        XCTAssertEqual(charts.map(\.id), ["SAV", "Dasha"])
        XCTAssertNil(charts[0].natal)
        XCTAssertEqual(charts[1].content, .dasha([.init(lord: "Ketu", start: "1999-03-14", end: "2004-01-02"), .init(lord: "Venus", start: "2004-01-02", end: "2024-01-02")]))
    }

    func testAHalfArrivedChartIsHeldBack() {
        let (charts, prose) = ChartBlock.split("**Chart D9 (Asha)**\n- 1 Taurus: Moon\n- 2 Gem")
        XCTAssertTrue(charts.isEmpty)
        XCTAssertEqual(prose, "")
    }

    func testWordsThatOnlyLookLikeAChartStayWords() {
        let text = "**Chart basis**\n- Moon: Taurus 4°, house 1"
        XCTAssertEqual(ChartBlock.split(text).prose, text)
        let odd = "**Chart D9 (Asha)**\n- Moon is strong\n\nMore."
        XCTAssertTrue(ChartBlock.split(odd).charts.isEmpty)
        XCTAssertEqual(ChartBlock.split(odd).prose, odd)
    }

    func testLookupsAreTheServersToAnswer() {
        for q in ["D9 dekh kr btao", "What does my navamsa say", "Give my dasha timeline chart", "When is my sade sati ending", "draw my kundli", "kundli dikhao", "my d-7"] {
            XCTAssertTrue(OnDeviceReasoner.needsLookup(q), q)
        }
        for q in ["which planet rules my chart", "what is my moon sign", "is anything exalted in my chart", "who is my 10th lord"] {
            XCTAssertFalse(OnDeviceReasoner.needsLookup(q), q)
        }
    }

    /// Rendered to look at, as `KundliSnapshotTests` does. The kundli itself
    /// needs a page to be seen on before it draws, so it is asked for at rest.
    @MainActor
    func testRendersEveryKind() throws {
        let dashas = "**Chart Dasha (Asha)**\n- Rahu: 2015-03-30 to 2033-03-30\n- Jupiter: 2033-03-30 to 2049-03-30\n\nx"
        let text = block() + "\n\n" + block("SAV", items: Dictionary(uniqueKeysWithValues: (1...12).map { ($0, "\(20 + $0)") })) + "\n\n" + dashas
        let charts = ChartBlock.split(text).charts
        XCTAssertEqual(charts.count, 3)
        let natal = try XCTUnwrap(charts[0].natal)
        MotionGate.recordPlayed(KundliReveal.key(for: natal), .onceEver)
        for script in NameScript.allCases {
            let key = VStack(alignment: .leading, spacing: 8) {
                KundliChartView(chart: natal, selected: .constant(nil), script: script).frame(width: 300, height: 300)
                ChartKey(planets: natal.planets.map(\.name), hasRetrograde: true, script: script, open: true)
            }.padding(16).background(Theme.bg)
            let r = ImageRenderer(content: key); r.scale = 2
            let url = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("names-\(script.rawValue).png")
            try XCTUnwrap(r.uiImage?.pngData()).write(to: url)
            print("NAMES_PATH=\(url.path)")
        }
        let view = VStack(spacing: 16) { ForEach(Array(charts.enumerated()), id: \.offset) { _, c in ChartBlockView(block: c) } }
            .frame(width: 360)
            .padding(16)
            .background(Theme.bg)
        let renderer = ImageRenderer(content: view)
        renderer.scale = 2
        let png = try XCTUnwrap(renderer.uiImage?.pngData())
        XCTAssertGreaterThan(png.count, 5_000)
        let url = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("chart-blocks.png")
        try png.write(to: url)
        print("CHART_BLOCKS_PATH=\(url.path)")
    }
}
