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
                            BrutTag(text: alert.severity, fill: severityColor(alert.severity), textColor: Theme.ink)
                            Text(alert.createdAt.formatted(date: .abbreviated, time: .shortened))
                                .font(.brutMono(11))
                                .foregroundStyle(Theme.muted)
                        }

                        Text(alert.title)
                            .brutHeading(34)
                            .fixedSize(horizontal: false, vertical: true)

                        BrutDivider()

                        MarkdownText(markdown: alert.detail)

                        SancharaPrimaryButton(title: "Ask Sanchara about this", kind: .accent) {
                            onAsk(
                                "Tell me more about this: \(alert.title). \(alert.body) "
                                    + "What should I watch for, and what can I do about it?"
                            )
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
                    Button("Close") { dismiss() }
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.fg)
                }
            }
            .toolbarBackground(Theme.bg, for: .navigationBar)
        }
        .presentationBackground(Theme.bg)
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
