import SwiftUI

/// The reading, as a card.
///
/// Shared by the Siri snippet and the widget, so it carries no assumptions
/// about which. It sets its own colours rather than reading the environment:
/// Sanchara is dark-only by design (`UIUserInterfaceStyle: Dark` in
/// `Info.plist`), and a card that went light inside Siri while the app stayed
/// dark would read as a different product.
struct ReadingCard: View {
    let eyebrow: String
    let title: String
    /// Named `text`, not `body`: `body` is the View requirement.
    let text: String
    /// Widgets get less room than a Siri snippet does.
    var bodyLineLimit: Int = 6

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(eyebrow)
                .font(.system(size: 10, weight: .regular))
                .textCase(.uppercase)
                .tracking(2)
                .foregroundStyle(Theme.muted)

            Text(title)
                .font(.system(.headline, design: .serif))
                .foregroundStyle(Theme.fg)
                .fixedSize(horizontal: false, vertical: true)

            Text(text)
                .font(.system(size: 13))
                .foregroundStyle(Theme.muted)
                .lineLimit(bodyLineLimit)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(eyebrow). \(title). \(text)")
    }
}
