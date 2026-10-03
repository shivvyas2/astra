import SwiftUI

struct AlertDetailView: View {
    let alert: SancharaAlert
    var onAsk: (String) -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.bg.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        HStack(spacing: 10) {
                            BrutTag(text: alert.severity, fill: severityColor(alert.severity), textColor: Theme.ink)
                            Text(alert.createdAt.formatted(date: .abbreviated, time: .shortened))
                                .font(.brutMono(11))
                                .foregroundStyle(Theme.muted)
                        }

                        Text(alert.title).brutHeading(26)

                        MarkdownText(markdown: alert.detail)

                        SancharaPrimaryButton(title: "Ask Sanchara about this", kind: .accent) {
                            onAsk(
                                "Tell me more about this: \(alert.title). \(alert.body) "
                                    + "What should I watch for, and what can I do about it?"
                            )
                        }
                        .padding(.top, 8)
                    }
                    .padding(.horizontal, 24)
                    .padding(.vertical, 24)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Close") { dismiss() }
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(Theme.fg)
                }
            }
            .toolbarBackground(Theme.bg, for: .navigationBar)
        }
        .presentationBackground(Theme.bg)
    }
}

/// The flat fill behind a severity tag. Warnings are the accent, cautions the
/// yellow, and anything else sits quietly in muted.
func severityColor(_ severity: String) -> Color {
    switch severity {
    case "warning": Theme.accent
    case "caution": Theme.yellow
    default: Theme.muted
    }
}
