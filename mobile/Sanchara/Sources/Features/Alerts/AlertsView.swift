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
                        HStack(spacing: 8) {
                            Circle().fill(severityColor(alert.severity)).frame(width: 6, height: 6)
                            Text(alert.severity.uppercased())
                                .font(.system(size: 11))
                                .tracking(2)
                                .foregroundStyle(Theme.muted)
                            Text("·").foregroundStyle(Theme.muted)
                            Text(alert.createdAt.formatted(date: .abbreviated, time: .shortened))
                                .font(.system(size: 11))
                                .foregroundStyle(Theme.muted)
                        }

                        Text(alert.title)
                            .font(.system(size: 24, weight: .light))
                            .tracking(-0.4)
                            .foregroundStyle(Theme.fg)

                        MarkdownText(markdown: alert.detail)

                        SancharaPrimaryButton(title: "Ask Sanchara about this") {
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
                    Button("Close") { dismiss() }.foregroundStyle(Theme.muted)
                }
            }
            .toolbarBackground(Theme.bg, for: .navigationBar)
        }
        .presentationBackground(Theme.bg)
    }
}

func severityColor(_ severity: String) -> Color {
    switch severity {
    case "warning": Theme.accent
    case "caution": Color(hex: 0xF0B429)
    default: Theme.muted
    }
}
