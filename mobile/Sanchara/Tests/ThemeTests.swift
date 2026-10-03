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

    /// The accent is lime: the one vivid colour on the ground.
    func testAccentMatchesCSSToken() {
        XCTAssertEqual(rgb(Theme.accent), [0xDF, 0xEE, 0x6B])
    }

    func testEmberMatchesCSSToken() {
        XCTAssertEqual(rgb(Theme.ember), [0xFF, 0x6B, 0x3D])
    }

    func testVioletMatchesCSSToken() {
        XCTAssertEqual(rgb(Theme.violet), [0x7C, 0x6C, 0xFF])
    }

    /// Text on a bright fill is the ground colour, so a filled button reads
    /// the same way the page does, inverted.
    func testInkIsTheBackground() {
        XCTAssertEqual(rgb(Theme.ink), rgb(Theme.bg))
    }

    /// Structure is drawn with a one-point line and nothing casts a shadow.
    /// The look depends on these staying put.
    func testLineGeometry() {
        XCTAssertEqual(Theme.lineWidth, 1)
        XCTAssertEqual(Theme.shadowOffset, 0)
        XCTAssertEqual(Theme.cardRadius, 24)
    }
}
