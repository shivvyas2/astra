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
                    VStack(spacing: 8) {
                        Text("No readings yet").eyebrow()
                        Text("Your past readings will collect here.")
                            .font(.system(size: 14))
                            .foregroundStyle(Theme.muted)
                    }
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
                            .listRowSeparatorTint(Theme.hairline)
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
                    .foregroundStyle(Theme.muted)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(Theme.muted)
                }
            }
            .toolbarBackground(Theme.bg, for: .navigationBar)
        }
        .presentationBackground(Theme.bg)
        .task { await chat.loadConversations() }
    }

    private func row(for conversation: Conversation) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(conversation.title ?? "Reading")
                .font(.system(size: 15))
                .foregroundStyle(Theme.fg)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
            HStack(spacing: 6) {
                Circle().fill(conversation.mode.dot).frame(width: 5, height: 5)
                Text(conversation.mode.label)
                Text("·")
                Text(conversation.createdAt.formatted(date: .abbreviated, time: .shortened))
            }
            .font(.system(size: 12))
            .foregroundStyle(Theme.muted)
        }
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }
}
