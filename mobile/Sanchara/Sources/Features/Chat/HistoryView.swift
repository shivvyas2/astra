import SwiftUI

/// Past readings — the native stand-in for the web's `AppShell` sidebar.
struct HistoryView: View {
    let chat: ChatStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.bg.ignoresSafeArea()
                if chat.conversations.isEmpty {
                    VStack(spacing: 0) {
                        BrutEmptyState(
                            title: "No readings yet",
                            message: "Every reading you ask for is saved here, with its mode and date.",
                            systemImage: "clock"
                        )
                        .padding(.top, 16)
                        Spacer()
                    }
                    .padding(.horizontal, 16)
                } else {
                    List {
                        ForEach(chat.conversations) { conversation in
                            Button {
                                Task {
                                    await chat.open(conversation)
                                    dismiss()
                                }
                            } label: {
                                row(for: conversation)
                            }
                            .listRowBackground(Color.clear)
                            .listRowSeparatorTint(Theme.rule)
                        }
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                }
            }
            .navigationTitle("Readings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("New") {
                        chat.newReading()
                        dismiss()
                    }
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(Theme.fg)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(Theme.fg)
                }
            }
            .toolbarBackground(Theme.bg, for: .navigationBar)
        }
        .presentationBackground(Theme.bg)
        .task { await chat.loadConversations() }
    }

    private func row(for conversation: Conversation) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(conversation.title ?? "Reading")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.fg)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
            HStack(spacing: 8) {
                BrutTag(text: conversation.mode.label, fill: conversation.mode.dot)
                Text(conversation.createdAt.formatted(date: .abbreviated, time: .shortened))
                    .font(.brutMono(11, weight: .regular))
                    .foregroundStyle(Theme.muted)
            }
        }
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }
}
