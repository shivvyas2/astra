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

    /// How often arriving text is folded into the transcript. The network
    /// delivers a reading in dozens of small pieces a second; redrawing the
    /// markdown for each one is what made the transcript stutter. Every
    /// `flushInterval` the pieces that arrived are appended in one go.
    static let flushInterval: Duration = .milliseconds(80)

    var messages: [ChatMessage] = []
    var input = ""
    var mode: ChatMode = .vedic
    var deep = false
    var isStreaming = false
    var errorMessage: String?
    var conversations: [Conversation] = []

    private(set) var conversationId: String?
    private var streamTask: Task<Void, Never>?

    /// Text that has arrived but not yet been shown, and the timer that will
    /// show it. See `flushInterval`.
    private var pendingText = ""
    private var flushTask: Task<Void, Never>?
    /// Bumped whenever the transcript is replaced, so a flush scheduled for
    /// the previous reading cannot land in this one.
    private var generation = 0

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
        stopStreaming()
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
        guard !messages.isEmpty else { return }
        messages.removeLast()
        send(lastUser, silent: true, forceServer: true)
    }

    /// Reopens a past reading with its full transcript and its own mode.
    func open(_ conversation: Conversation) async {
        stopStreaming()
        errorMessage = nil
        conversationId = conversation.id
        mode = conversation.mode
        messages = []
        let opened = generation
        do {
            let rows: [StoredMessage] = try await Supa.client
                .from("messages")
                .select("role, content, created_at")
                .eq("conversation_id", value: conversation.id)
                .order("created_at", ascending: true)
                .execute()
                .value
            // The user may have moved on while the rows were loading.
            guard opened == generation else { return }
            messages = rows.map(\.asChatMessage)
        } catch {
            guard opened == generation else { return }
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
        let thisGeneration = generation
        if !silent { messages.append(ChatMessage(role: .user, content: text)) }
        messages.append(ChatMessage(role: .assistant, content: ""))

        streamTask = Task {
            // A lookup the phone can answer from the chart it already holds
            // never reaches the network. The opening reading and an explicit
            // "read this properly" always do.
            if !silent, !forceServer, mode == .vedic, let reasoner {
                if case .answered(let local) = await reasoner.route(text) {
                    guard !Task.isCancelled, thisGeneration == generation else { return }
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
                    guard thisGeneration == generation else { return }
                    switch event {
                    case .conversationId(let id):
                        conversationId = id
                    case .text(let chunk):
                        enqueue(chunk)
                    }
                }
            } catch is CancellationError {
                // Superseded by a new reading; leave the transcript as-is.
            } catch {
                failure = error.localizedDescription
            }

            guard !Task.isCancelled, thisGeneration == generation else { return }
            flushPending()
            if let failure {
                if let last = messages.indices.last, messages[last].role == .assistant, messages[last].content.isEmpty {
                    messages[last].content = failure
                } else {
                    errorMessage = failure
                }
            }
            isStreaming = false
            if wasNewConversation, conversationId != nil { await loadConversations() }
        }
    }

    // MARK: - Streaming

    /// Cancels whatever is in flight and drops any text it had not shown.
    private func stopStreaming() {
        streamTask?.cancel()
        streamTask = nil
        flushTask?.cancel()
        flushTask = nil
        pendingText = ""
        generation += 1
        isStreaming = false
    }

    private func enqueue(_ chunk: String) {
        pendingText += chunk
        guard flushTask == nil else { return }
        let scheduled = generation
        flushTask = Task { [weak self] in
            try? await Task.sleep(for: Self.flushInterval)
            guard let self, !Task.isCancelled, scheduled == self.generation else { return }
            self.flushPending()
        }
    }

    private func flushPending() {
        flushTask = nil
        guard !pendingText.isEmpty else { return }
        appendToLastAssistant(pendingText)
        pendingText = ""
    }

    private func appendToLastAssistant(_ chunk: String) {
        guard let last = messages.indices.last, messages[last].role == .assistant else { return }
        messages[last].content += chunk
    }
}
