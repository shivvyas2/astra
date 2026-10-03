import XCTest
import SwiftUI
@testable import Sanchara

/// The native app and the website share one palette. These assert the tokens
/// match `app/globals.css` exactly, so a careless edit to Theme.swift fails the
/// build rather than quietly drifting.
final class ThemeTests: XCTestCase {

    private func rgb(_ color: Color) -> [Int] {
        let ui = UIColor(color)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        ui.getRed(&r, green: &g, blue: &b, alpha: &a)
        return [Int((r * 255).rounded()), Int((g * 255).rounded()), Int((b * 255).rounded())]
    }

    func testBackgroundMatchesCSSToken() {
        XCTAssertEqual(rgb(Theme.bg), [0x0A, 0x0A, 0x0B])
    }

    func testSurfaceMatchesCSSToken() {
        XCTAssertEqual(rgb(Theme.surface), [0x15, 0x15, 0x18])
    }

    func testForegroundMatchesCSSToken() {
        XCTAssertEqual(rgb(Theme.fg), [0xF4, 0xF1, 0xEA])
    }

    func testMutedMatchesCSSToken() {
        XCTAssertEqual(rgb(Theme.muted), [0x9A, 0x97, 0x8F])
    }

    func testAccentMatchesCSSToken() {
        XCTAssertEqual(rgb(Theme.accent), [0xFF, 0x6B, 0x3D])
    }

    func testVioletMatchesCSSToken() {
        XCTAssertEqual(rgb(Theme.violet), [0x7C, 0x6C, 0xFF])
    }

    func testYellowMatchesCSSToken() {
        XCTAssertEqual(rgb(Theme.yellow), [0xFF, 0xD2, 0x3F])
    }

    /// Text on a bright fill is the ground colour, so a filled button reads
    /// the same way the page does — ink on bone, inverted.
    func testInkIsTheBackground() {
        XCTAssertEqual(rgb(Theme.ink), rgb(Theme.bg))
    }

    /// Borders are drawn in bone at full strength, two points thick, with a
    /// four-point hard shadow. The look depends on these three staying put.
    func testBrutalistGeometry() {
        XCTAssertEqual(Theme.lineWidth, 2)
        XCTAssertEqual(Theme.shadowOffset, 4)
        XCTAssertEqual(Theme.cornerRadius, 4)
    }
}
