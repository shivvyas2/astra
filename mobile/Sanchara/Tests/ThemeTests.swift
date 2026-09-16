import XCTest
import SwiftUI
@testable import Sanchara

/// The whole premise of the native rewrite is that it looks like the website.
/// These assert the four tokens match `app/globals.css` exactly, so a careless
/// edit to Theme.swift fails the build rather than quietly drifting.
final class ThemeTests: XCTestCase {

    private func rgb(_ color: Color) -> (r: Int, g: Int, b: Int) {
        let ui = UIColor(color)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        ui.getRed(&r, green: &g, blue: &b, alpha: &a)
        return (Int((r * 255).rounded()), Int((g * 255).rounded()), Int((b * 255).rounded()))
    }

    func testBackgroundMatchesCSSToken() {
        XCTAssertEqual(rgb(Theme.bg).r, 0x0A)
        XCTAssertEqual(rgb(Theme.bg).g, 0x0A)
        XCTAssertEqual(rgb(Theme.bg).b, 0x0B)
    }

    func testForegroundMatchesCSSToken() {
        let c = rgb(Theme.fg)
        XCTAssertEqual([c.r, c.g, c.b], [0xF4, 0xF1, 0xEA])
    }

    func testMutedMatchesCSSToken() {
        let c = rgb(Theme.muted)
        XCTAssertEqual([c.r, c.g, c.b], [0x9A, 0x97, 0x8F])
    }

    func testAccentMatchesCSSToken() {
        let c = rgb(Theme.accent)
        XCTAssertEqual([c.r, c.g, c.b], [0xE8, 0x66, 0x3D])
    }
}
