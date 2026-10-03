import SwiftUI
import XCTest
@testable import Sanchara

/// Renders the design system and the reading's markdown to PNGs so they can
/// be looked at without signing in.
///
/// Like `KundliSnapshotTests`, this asserts only that something was drawn —
/// a pixel assertion that fails whenever anyone touches a colour is a test
/// that gets deleted. The files are written to the temporary directory and
/// their paths printed.
final class BrutSnapshotTests: XCTestCase {

    @MainActor
    private func render<V: View>(_ view: V, name: String, width: CGFloat = 390) throws {
        let framed = view
            .frame(width: width)
            .background(Theme.bg)
            .environment(\.colorScheme, .dark)
        let renderer = ImageRenderer(content: framed)
        renderer.scale = 2
        let image = try XCTUnwrap(renderer.uiImage, "\(name) rendered to nothing")
        let png = try XCTUnwrap(image.pngData())
        XCTAssertGreaterThan(png.count, 2_000, "\(name) rendered but appears blank")
        let url = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("\(name).png")
        try png.write(to: url)
        print("BRUT_SNAPSHOT_PATH=\(url.path)")
    }

    @MainActor
    func testRendersAReadingWithTheSimpleWordsCallout() throws {
        let reading = """
        **Career**
        Saturn rules your tenth house from the fourth, so the work that lasts for you is built at home first. Likely: a role change between March and June 2027, when the Venus sub-period ends.

        **Money**
        - Jupiter aspects your second house from the tenth.
        - Possible: a late payment lands in November 2026.

        **In simple words**
        Expect a job offer in spring 2027. Say yes if it lets you work from where you live.
        """
        try render(
            VStack(alignment: .leading, spacing: 20) {
                HStack(alignment: .top, spacing: 12) {
                    Rectangle().fill(Theme.accent).frame(width: 4)
                    MarkdownText(markdown: reading)
                }
                Text("Will I change jobs next year?")
                    .font(.brutBody(15))
                    .foregroundStyle(Theme.fg)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .brutCard(fill: Theme.surfaceRaised)
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
            .padding(16),
            name: "brut-reading"
        )
    }

    @MainActor
    func testRendersTheTabBarAndHeader() throws {
        try render(
            VStack(alignment: .leading, spacing: 24) {
                ScreenHeader(
                    eyebrow: "Ask",
                    title: "Read your stars, Asha",
                    blurb: "Ask about work, love, money, a decision, a year. Every answer is read from your real birth chart, not your Sun sign."
                )
                .padding(.horizontal, 16)
                BrutTabBar(selection: .constant(.ask), badge: { $0 == .today ? 2 : 0 })
            }
            .padding(.vertical, 16),
            name: "brut-shell"
        )
    }

    @MainActor
    func testRendersTheComponents() throws {
        try render(
            VStack(alignment: .leading, spacing: 18) {
                Text("Components").eyebrow()
                SancharaPrimaryButton(title: "Primary") {}
                SancharaPrimaryButton(title: "Accent", kind: .accent) {}
                SancharaSecondaryButton(title: "Secondary") {}
                HStack(spacing: 8) {
                    BrutChip(text: "Vedic", active: true, color: Theme.accent) {}
                    BrutChip(text: "Western", color: Theme.violet) {}
                    BrutChip(text: "Numerology", color: Theme.yellow) {}
                    BrutChip(text: "Deep", active: true, color: Theme.fg) {}
                }
                BrutSegmented(options: [("a", "That day"), ("b", "That month"), ("c", "That year")], selection: .constant("b"))
                BrutProgressBar(progress: 0.38)
                HStack(spacing: 8) {
                    BrutTag(text: "Now")
                    BrutTag(text: "Morning", fill: Theme.yellow)
                    BrutTag(text: "Warning", fill: Theme.accent)
                    BrutTag(text: "Western", fill: Theme.violet)
                }
                BrutNotice(text: "Could not load that reading.")
                BrutEmptyState(
                    title: "No readings yet",
                    message: "Sanchara writes you a reading each morning and each night. They collect here by date.",
                    systemImage: "sun.max"
                )
                HStack(spacing: 10) {
                    BrutIconButton(systemImage: "clock", label: "Past readings") {}
                    BrutIconButton(systemImage: "bell", label: "Inbox", badge: 3) {}
                    BrutIconButton(systemImage: "square.and.pencil", label: "New reading") {}
                }
            }
            .padding(16),
            name: "brut-components"
        )
    }
}
