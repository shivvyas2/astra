import XCTest
@testable import Sanchara

final class InkTests: XCTestCase {
    private let line = [CGPoint(x: 0, y: 0), CGPoint(x: 100, y: 0)]
    private let style = Ink.Style(color: .white)

    func testTheSameSeedAlwaysDrawsTheSameLine() {
        XCTAssertEqual(Ink.samples(line, progress: 1, hand: 1, style: style), Ink.samples(line, progress: 1, hand: 1, style: style))
        var other = style
        other.seed = 2
        XCTAssertNotEqual(Ink.samples(line, progress: 1, hand: 1, style: style), Ink.samples(line, progress: 1, hand: 1, style: other))
    }

    func testAHandDrawnLineStaysWithinItsWobble() {
        for sample in Ink.samples(line, progress: 1, hand: 1, style: style) {
            XCTAssertLessThanOrEqual(abs(sample.point.y), style.wobble * 1.32)
            XCTAssertGreaterThanOrEqual(sample.point.x, -style.overshoot - 0.01)
            XCTAssertLessThanOrEqual(sample.point.x, 100 + style.overshoot + 0.01)
        }
    }

    func testASettledLineIsTheCleanLine() {
        let settled = Ink.samples(line, progress: 1, hand: 0, style: style)
        XCTAssertEqual(settled.first?.point, CGPoint(x: 0, y: 0))
        XCTAssertEqual(settled.last!.point.x, 100, accuracy: 0.001)
        XCTAssertTrue(settled.allSatisfy { abs($0.point.y) < 0.0001 && $0.width == style.restWidth })
    }

    func testProgressDrawsThatMuch() {
        XCTAssertTrue(Ink.samples(line, progress: 0, hand: 1, style: style).isEmpty)
        XCTAssertEqual(Ink.samples(line, progress: 0.5, hand: 0, style: style).last!.point.x, 50, accuracy: 0.001)
    }

    func testAClosedShapeComesBackToItsStart() {
        var closed = style
        closed.closed = true
        let box = [CGPoint(x: 0, y: 0), CGPoint(x: 10, y: 0), CGPoint(x: 10, y: 10)]
        let end = Ink.samples(box, progress: 1, hand: 0, style: closed).last!.point
        XCTAssertEqual(end.x, 0, accuracy: 0.001)
        XCTAssertEqual(end.y, 0, accuracy: 0.001)
    }

    func testEveryGrahaHasItsOwnSignInsideTheBox() {
        var seen: [[[CGPoint]]] = []
        for name in ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Rahu", "Ketu"] {
            let strokes = PlanetInk.strokes(for: name)
            XCTAssertFalse(strokes.isEmpty, name)
            for point in strokes.joined() {
                XCTAssertLessThanOrEqual(max(abs(point.x), abs(point.y)), 1.2, name)
            }
            XCTAssertFalse(seen.contains(strokes), name)
            seen.append(strokes)
        }
    }
}

@MainActor
final class MotionGateTests: XCTestCase {
    private var defaults: UserDefaults!
    override func setUp() async throws {
        defaults = UserDefaults(suiteName: "motion-gate-tests")
        defaults.removePersistentDomain(forName: "motion-gate-tests")
        MotionGate.resetForTests()
    }

    func testOnceEverIsRememberedPerKey() throws {
        try XCTSkipIf(Theme.reducesMotion, "Reduce Motion is on in this simulator")
        XCTAssertTrue(MotionGate.shouldPlay("a", .onceEver, defaults: defaults))
        MotionGate.recordPlayed("a", .onceEver, defaults: defaults)
        XCTAssertFalse(MotionGate.shouldPlay("a", .onceEver, defaults: defaults))
        XCTAssertTrue(MotionGate.shouldPlay("b", .onceEver, defaults: defaults))
    }

    func testOncePerLaunchPlaysAgainNextLaunch() throws {
        try XCTSkipIf(Theme.reducesMotion, "Reduce Motion is on in this simulator")
        MotionGate.recordPlayed("a", .oncePerLaunch, defaults: defaults)
        XCTAssertFalse(MotionGate.shouldPlay("a", .oncePerLaunch, defaults: defaults))
        MotionGate.resetForTests()
        XCTAssertTrue(MotionGate.shouldPlay("a", .oncePerLaunch, defaults: defaults))
    }

    func testNothingPlaysUnderTheAppsReduceMotion() {
        let key = Theme.Accessibility.reduceMotionKey
        let before = UserDefaults.standard.bool(forKey: key)
        UserDefaults.standard.set(true, forKey: key)
        defer { UserDefaults.standard.set(before, forKey: key) }
        XCTAssertFalse(MotionGate.shouldPlay("a", .onceEver, defaults: defaults))
        XCTAssertFalse(MotionGate.shouldPlay("a", .oncePerLaunch, defaults: defaults))
    }
}
