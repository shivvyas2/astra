import Foundation
import Supabase

/// Drives one reading transcript.
///
/// Mirrors `components/Chat.tsx`: a turn is optimistically appended, the
/// assistant's bubble starts empty and fills as bytes arrive, and the
/// conversation id from the response header is reused for every later turn so
/// the server keeps appending to the same conversation.
@Observable
@MainActor
final class ChatStore {
    /// The web sends this same prompt on a user's very first visit.
    static let introPrompt =
        "Welcome me with a short reading for today based on my chart. Two or three short sections."

    var messages: [ChatMessage] = []
    var input = ""
    var mode: ChatMode = .vedic
    var deep = false
    var isStreaming = false
    var errorMessage: String?
    var conversations: [Conversation] = []

    private(set) var conversationId: String?
    private var streamTask: Task<Void, Never>?

    /// Loads past readings and, for a brand-new account, opens with a reading
    /// for today rather than an empty room.
    func start() async {
        await loadConversations()
        if conversations.isEmpty, messages.isEmpty, !isStreaming {
            send(Self.introPrompt, silent: true)
        }
    }

    func loadConversations() async {
        do {
            conversations = try await Supa.client
                .from("conversations")
                .select("id, tradition, title, created_at")
                .order("created_at", ascending: false)
                .execute()
                .value
        } catch {
            // A failed refresh keeps the last known list; the transcript is
            // unaffected, so this is not worth an error banner.
        }
    }

    /// Starts a fresh conversation. The previous one stays saved server-side.
    func newReading() {
        streamTask?.cancel()
        streamTask = nil
        isStreaming = false
        conversationId = nil
        messages = []
        errorMessage = nil
    }

    /// Reopens a past reading with its full transcript and its own mode.
    func open(_ conversation: Conversation) async {
        streamTask?.cancel()
        streamTask = nil
        isStreaming = false
        errorMessage = nil
        conversationId = conversation.id
        mode = conversation.mode
        messages = []
        do {
            let rows: [StoredMessage] = try await Supa.client
                .from("messages")
                .select("role, content, created_at")
                .eq("conversation_id", value: conversation.id)
                .order("created_at", ascending: true)
                .execute()
                .value
            messages = rows.map(\.asChatMessage)
        } catch {
            errorMessage = "Could not load that reading."
        }
    }

    func sendCurrentInput() {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        input = ""
        send(text)
    }

    /// `silent` hides the prompt itself — used for the opening reading, where
    /// the question is scaffolding the user never asked.
    func send(_ text: String, silent: Bool = false) {
        guard !isStreaming else { return }
        errorMessage = nil
        isStreaming = true
        let wasNewConversation = conversationId == nil
        if !silent { messages.append(ChatMessage(role: .user, content: text)) }
        messages.append(ChatMessage(role: .assistant, content: ""))

        streamTask = Task {
            var failure: String?
            do {
                let stream = AstraAPI.chatStream(
                    conversationId: conversationId,
                    mode: mode,
                    message: text,
                    deep: deep
                )
                for try await event in stream {
                    switch event {
                    case .conversationId(let id):
                        conversationId = id
                    case .text(let chunk):
                        appendToLastAssistant(chunk)
                    }
                }
            } catch is CancellationError {
                // Superseded by a new reading; leave the transcript as-is.
            } catch {
                failure = error.localizedDescription
            }

            guard !Task.isCancelled else { return }
            if let failure {
                if messages.last?.role == .assistant, messages.last?.content.isEmpty == true {
                    messages[messages.count - 1].content = failure
                } else {
                    errorMessage = failure
                }
            }
            isStreaming = false
            if wasNewConversation, conversationId != nil { await loadConversations() }
        }
    }

    private func appendToLastAssistant(_ chunk: String) {
        guard let last = messages.indices.last, messages[last].role == .assistant else { return }
        messages[last].content += chunk
    }
}
