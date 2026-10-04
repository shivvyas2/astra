import SwiftUI

/// Past readings — the native stand-in for the web's `AppShell` sidebar.
struct HistoryView: View {
    let chat: ChatStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                Atmosphere(mood: .plain)
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        header
                            .padding(.bottom, 24)

                        if chat.conversations.isEmpty {
                            BrutEmptyState(
                                title: "No readings yet",
                                message: "Every reading you ask for is saved here the moment you send your first question, with its mode and date.",
                                systemImage: "clock"
                            )
                        } else {
                            ForEach(Array(chat.conversations.enumerated()), id: \.element.id) { index, conversation in
                                Button {
                                    Task {
                                        await chat.open(conversation)
                                        dismiss()
                                    }
                                } label: {
                                    row(for: conversation)
                                }
                                .buttonStyle(.plain)
                                .accessibilityHint("Opens this reading")
                                if index < chat.conversations.count - 1 {
                                    BrutDivider()
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .padding(.bottom, 32)
                }
            }
            .navigationTitle("Readings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.fg)
                }
            }
            .toolbarBackground(Theme.bg, for: .navigationBar)
        }
        .presentationBackground(Theme.bg)
        .task { await chat.loadConversations() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Past readings").eyebrow()
            Text("Everything you've asked")
                .brutHeading(34)
                .fixedSize(horizontal: false, vertical: true)
            SancharaPrimaryButton(title: "Start a new reading", kind: .accent) {
                chat.newReading()
                dismiss()
            }
            .padding(.top, 6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func row(for conversation: Conversation) -> some View {
        HStack(alignment: .center, spacing: 14) {
            VStack(alignment: .leading, spacing: 8) {
                BrutTag(text: conversation.mode.label, fill: conversation.mode.dot)
                Text(conversation.title ?? "Reading")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.fg)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                Text(conversation.createdAt.formatted(date: .abbreviated, time: .shortened))
                    .font(.brutMono(11, weight: .regular))
                    .foregroundStyle(Theme.muted)
            }
            Spacer(minLength: 8)
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.muted)
                .accessibilityHidden(true)
        }
        .padding(.vertical, 16)
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .contentShape(Rectangle())
    }
}
