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

    /// Set once the chart arrives, which turns on free on-device lookups.
    /// Vedic only: the router reads a Vedic chart, so a Western or numerology
    /// question has nothing local to answer from and goes straight to Claude.
    var chart: NatalChart? {
        didSet { reasoner = chart.map(OnDeviceReasoner.init(chart:)) }
    }
    private var reasoner: OnDeviceReasoner?

    /// Whether the last assistant turn was answered locally, so the transcript
    /// can offer to get the full reading anyway.
    var canExpandLastAnswer: Bool {
        messages.last?.source == .onDevice && !isStreaming
    }

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

    /// Sends the last locally-answered question to Claude after all, keeping the
    /// question visible and replacing only the answer.
    ///
    /// `generative-ai.md › Outputs`: "Make it easy for people to refine or
    /// revert generated results". A fast local answer is only acceptable if the
    /// slower, fuller one is always one tap away.
    func expandLastAnswer() {
        guard canExpandLastAnswer else { return }
        guard let lastUser = messages.last(where: { $0.role == .user })?.content else { return }
        messages.removeLast()
        send(lastUser, silent: true, forceServer: true)
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
    func send(_ text: String, silent: Bool = false, forceServer: Bool = false) {
        guard !isStreaming else { return }
        errorMessage = nil
        isStreaming = true
        let wasNewConversation = conversationId == nil
        if !silent { messages.append(ChatMessage(role: .user, content: text)) }
        messages.append(ChatMessage(role: .assistant, content: ""))

        streamTask = Task {
            // A lookup the phone can answer from the chart it already holds
            // never reaches the network. The opening reading and an explicit
            // "read this properly" always do.
            if !silent, !forceServer, mode == .vedic, let reasoner {
                if case .answered(let local) = await reasoner.route(text) {
                    guard !Task.isCancelled else { return }
                    if let last = messages.indices.last, messages[last].role == .assistant {
                        messages[last].content = local
                        messages[last].source = .onDevice
                    }
                    isStreaming = false
                    return
                }
            }

            var failure: String?
            do {
                let stream = SancharaAPI.chatStream(
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
