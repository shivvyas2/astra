import SwiftUI

/// A whole conversation, read-only: the person's messages in dark capsules
/// on the right, Astrya's readings in white panels on the left.
struct AdminTranscriptView: View {
    let conversationID: String
    var fallbackTitle: String?
    @Environment(AdminStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    private var transcript: AdminTranscript? { store.transcripts[conversationID] }

    var body: some View {
        AdminFrame(title: "Chat", leading: .back, leadingAction: { dismiss() }) {
            if let mode = transcript?.conversation.mode {
                AdminChip(text: AdminFormat.label(mode)).padding(.trailing, 6)
            }
        } content: {
            Group {
                if let transcript {
                    content(transcript)
                } else if let message = store.transcriptErrors[conversationID] {
                    VStack {
                        AdminMessage(systemImage: "exclamationmark", title: "Couldn't load this chat", detail: message,
                                     actionTitle: "Try again") { Task { await store.loadTranscript(conversationID) } }
                        Spacer()
                    }
                    .padding(16)
                } else {
                    VStack {
                        AdminMessage(systemImage: "", title: "Opening the chat…", isLoading: true)
                        Spacer()
                    }
                    .padding(16)
                }
            }
        }
        .task { if transcript == nil { await store.loadTranscript(conversationID) } }
    }

    private func content(_ t: AdminTranscript) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(t.conversation.title?.isEmpty == false ? t.conversation.title! : (fallbackTitle ?? "Untitled chat"))
                        .font(.adminTitle(24))
                        .foregroundStyle(AdminTheme.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                    HStack(spacing: 6) {
                        Text("\(t.messages.count) messages")
                        if let started = AdminFormat.parseDate(t.conversation.createdAt) {
                            Text("·")
                            Text("started \(AdminFormat.dayAndTime(started))")
                        }
                    }
                    .font(.caption)
                    .foregroundStyle(AdminTheme.muted)
                }
                .padding(.horizontal, 4)
                .padding(.bottom, 4)

                if t.messages.isEmpty {
                    AdminMessage(systemImage: "text.bubble", title: "No messages in this chat")
                }

                ForEach(Array(t.messages.enumerated()), id: \.offset) { _, message in
                    AdminMessageBubble(message: message)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
            .padding(.bottom, 48)
        }
        .scrollIndicators(.hidden)
        .refreshable { await store.loadTranscript(conversationID) }
    }
}

struct AdminMessageBubble: View {
    let message: AdminTranscript.Message

    private var isUser: Bool { message.role.lowercased() == "user" }
    private var isSystem: Bool { !["user", "assistant"].contains(message.role.lowercased()) }

    var body: some View {
        let time = AdminFormat.parseDate(message.createdAt).map { AdminFormat.dayAndTime($0) }
        Group {
            if isSystem {
                Text(message.content)
                    .font(.caption)
                    .foregroundStyle(AdminTheme.muted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 4)
            } else {
                VStack(alignment: isUser ? .trailing : .leading, spacing: 4) {
                    Text(rendered)
                        .font(.body)
                        .foregroundStyle(isUser ? AdminTheme.onFrame : AdminTheme.ink)
                        .textSelection(.enabled)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                        .background(
                            RoundedRectangle(cornerRadius: isUser ? 22 : AdminTheme.panelRadius, style: .continuous)
                                .fill(isUser ? AdminTheme.frameRaised : AdminTheme.raised)
                        )
                    if let time {
                        Text(time).font(.caption2).foregroundStyle(AdminTheme.muted).padding(.horizontal, 6)
                    }
                }
                .frame(maxWidth: .infinity, alignment: isUser ? .trailing : .leading)
                .padding(isUser ? .leading : .trailing, 36)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(isUser ? "They said" : isSystem ? "System" : "Astrya said"): \(message.content)")
    }

    /// Readings are markdown; bold and italics come through, line breaks stay.
    private var rendered: AttributedString {
        (try? AttributedString(
            markdown: message.content,
            options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        )) ?? AttributedString(message.content)
    }
}
