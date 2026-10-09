import SwiftUI

/// Astrya's record with this person: how many of its dated predictions they
/// said came true. Shown as it is, low or high — the point is that it is kept.
/// The web draws the same card (components/AccuracyCard.tsx).
struct AccuracyCard: View {
    let card: Scorecard

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Astrya's record").eyebrow()
                Spacer(minLength: 8)
                BrutTag(text: "Your answers", fill: Theme.fg, textColor: Theme.ink)
            }
            .padding(.bottom, 12)

            if let rate = card.rate {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("\(card.happened)")
                        .font(.brutNumeral(64))
                        .foregroundStyle(Theme.accent)
                    Text("/ \(card.checked)")
                        .font(.brutNumeral(24))
                        .foregroundStyle(Theme.muted)
                }
                Text("of its dated predictions came true, by your answers (\(rate)%).")
                    .font(.brutBody(14))
                    .foregroundStyle(Theme.muted)
                    .fixedSize(horizontal: false, vertical: true)
                BrutProgressBar(progress: Double(rate) / 100)
                    .padding(.top, 12)
                    .accessibilityHidden(true)
            } else {
                Text("Every prediction is written down")
                    .font(.brutTitle(20))
                    .foregroundStyle(Theme.fg)
                Text(pendingText)
                    .font(.brutBody(14))
                    .foregroundStyle(Theme.muted)
                    .lineSpacing(2)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 6)
            }

            VStack(spacing: 0) {
                if card.likelyChecked > 0 {
                    row("When it said \u{201C}likely\u{201D}", "\(card.likelyHappened) of \(card.likelyChecked)")
                }
                row("Waiting for your answer", "\(card.awaiting)", accent: card.awaiting > 0)
                row("Still ahead", "\(card.upcoming)", rule: card.unsure > 0)
                if card.unsure > 0 {
                    row("Not sure (not counted)", "\(card.unsure)", rule: false)
                }
            }
            .padding(.top, 12)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .brutCard()
        .accessibilityElement(children: .combine)
    }

    private var pendingText: String {
        var text = "When a reading names a window, Astrya keeps it. Once the dates arrive, tell it what happened. After \(Scorecard.minCheckedForRate) answers, its score with you shows here."
        if card.checked > 0 { text += " \(card.checked) answered so far." }
        return text
    }

    private func row(_ label: String, _ value: String, accent: Bool = false, rule: Bool = true) -> some View {
        VStack(spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text(label)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.muted)
                Spacer(minLength: 8)
                Text(value)
                    .font(.system(size: 18, weight: .medium).monospacedDigit())
                    .foregroundStyle(accent ? Theme.accent : Theme.fg)
            }
            .padding(.vertical, 10)
            if rule { BrutDivider() }
        }
    }
}
