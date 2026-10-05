import SwiftUI

/// The reading, as a card.
///
/// Shared by the Siri snippet and the widget, so it carries no assumptions
/// about which. It sets its own colours rather than reading the environment:
/// Astrya is dark-only by design (`UIUserInterfaceStyle: Dark` in
/// `Info.plist`), and a card that went light inside Siri while the app stayed
/// dark would read as a different product.
///
/// Same language as the app: a thin accent rule down the leading edge, a
/// small eyebrow, a title in medium weight set tight, plain body. Nothing
/// blurred. The widgets now draw their own layouts (`SancharaWidgets/`); this
/// card remains for the Siri snippet.
///
/// This file is compiled into the widget extension, which does not include
/// `Components.swift`, so the card outline is drawn here rather than with
/// `brutCard()`. It is off by default: the widget already sits in the
/// system's own rounded container, and a card inside it reads as a box in a
/// box. A Siri snippet can pass `framed: true`.
struct ReadingCard: View {
    let eyebrow: String
    let title: String
    /// Named `text`, not `body`: `body` is the View requirement.
    let text: String
    /// Widgets get less room than a Siri snippet does.
    var bodyLineLimit: Int = 6
    /// Draws the app's card outline around the reading.
    var framed: Bool = false

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Capsule()
                .fill(Theme.accent)
                .frame(width: 2)
                .accessibilityHidden(true)
            content
        }
        .fixedSize(horizontal: false, vertical: true)
        .padding(framed ? 16 : 0)
        .background {
            if framed {
                RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous)
                    .fill(Theme.fg.opacity(0.04))
                RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous)
                    .strokeBorder(Theme.line, lineWidth: Theme.lineWidth)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(eyebrow). \(title). \(text)")
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(eyebrow)
                .font(.system(size: 10, weight: .semibold))
                .textCase(.uppercase)
                .tracking(1.4)
                .foregroundStyle(Theme.muted)

            // The revamp's display type: medium weight, set tight.
            Text(title)
                .font(.system(size: 20, weight: .medium))
                .tracking(-0.7)
                .foregroundStyle(Theme.fg)
                .fixedSize(horizontal: false, vertical: true)

            Text(text)
                .font(.system(size: 13))
                .foregroundStyle(Theme.muted)
                .lineLimit(bodyLineLimit)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
