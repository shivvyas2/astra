import SwiftUI

struct AlertDetailView: View {
    let alert: SancharaAlert
    var onAsk: (String) -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                Atmosphere(mood: .ember)
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        HStack(spacing: 10) {
                            BrutTag(text: severityLabel(alert.severity), fill: severityColor(alert.severity), textColor: Theme.ink)
                            Text(alert.createdAt.formatted(Date.FormatStyle(date: .abbreviated, time: .shortened).locale(L10n.locale)))
                                .font(.brutMono(11))
                                .foregroundStyle(Theme.muted)
                        }

                        Text(alert.title)
                            .brutHeading(34)
                            .fixedSize(horizontal: false, vertical: true)

                        BrutDivider()

                        MarkdownText(markdown: alert.detail)

                        SancharaPrimaryButton(title: L10n.string("Ask Astrya about this"), kind: .accent) {
                            onAsk(L10n.string("Tell me more about this: \(alert.title). \(alert.body) What should I watch for, and what can I do about it?"))
                        }
                        .padding(.top, 8)
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 32)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .font(.scaled(size: 14, weight: .bold))
                        .foregroundStyle(Theme.fg)
                }
            }
            .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
        }
        .presentationBackground(Theme.bg)
    }
}

/// A severity as its tag reads. The raw value stays English: it is what the
/// server writes and what `severityColor` switches on.
func severityLabel(_ severity: String) -> String {
    switch severity {
    case "warning": L10n.string("Warning")
    case "caution": L10n.string("Caution")
    default: L10n.string("Note")
    }
}

/// The flat fill behind a severity tag. Warnings are ember, cautions the lime
/// accent, and anything else sits quietly in muted.
func severityColor(_ severity: String) -> Color {
    switch severity {
    case "warning": Theme.ember
    case "caution": Theme.accent
    default: Theme.muted
    }
}
