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

    /// What Astrya remembers, as last fetched from `/api/memory`: the facts
    /// (for the on-device memory pass and for answering "what do you know
    /// about me?" without a call), each conversation's summary (so the
    /// on-device pass can roll it forward), and how many predictions are open.
    /// Nil until the first fetch succeeds.
    private var knownFacts: [UserFact]?
    private var conversationSummaries: [String: String] = [:]
    private var openPredictions = 0

    /// Whether the last assistant turn was answered locally, so the transcript
    /// can offer to get the full reading anyway.
    var canExpandLastAnswer: Bool {
        messages.last?.source == .onDevice && !isStreaming
    }

    /// Loads past readings and, for a brand-new account, opens with a reading
    /// for today rather than an empty room.
    func start() async {
        async let memory: Void = refreshMemory()
        await loadConversations()
        await memory
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

    /// Fetches what Astrya remembers. A failure keeps what was there: memory
    /// is a nicety here, never a reason to show an error.
    func refreshMemory() async {
        guard let payload = try? await KnowledgeAPI.list() else { return }
        knownFacts = payload.facts
        conversationSummaries = Dictionary(
            payload.summaries.map { ($0.conversationId, $0.summary) },
            uniquingKeysWith: { first, _ in first }
        )
        openPredictions = payload.predictions.filter { $0.status == .open }.count
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
            // "What do you know about me?" is answered from what the phone
            // already holds: no server call, no model call.
            if !silent, !forceServer, let facts = knownFacts, MemoryQuestion.isAskingWhatIsKnown(text) {
                if let last = messages.indices.last, messages[last].role == .assistant {
                    messages[last].content = MemoryQuestion.answer(
                        facts: facts,
                        conversations: conversationSummaries.count,
                        predictions: openPredictions
                    )
                    messages[last].source = .onDevice
                }
                isStreaming = false
                return
            }

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

            // With Apple Intelligence on, this phone works out what to
            // remember from the turn and the server skips its Haiku pass.
            let rememberOnDevice = OnDeviceMemory.isAvailable
            var failure: String?
            do {
                let stream = SancharaAPI.chatStream(
                    conversationId: conversationId,
                    mode: mode,
                    message: text,
                    deep: deep,
                    memory: rememberOnDevice ? "on-device" : nil
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
                // 403 consent_required brings the AI consent screen back (Features/Consent).
                failure = ConsentStore.handleChatError(error) ?? error.localizedDescription
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
            if rememberOnDevice, failure == nil, let id = conversationId,
               let reply = messages.last(where: { $0.role == .assistant })?.content,
               !reply.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                remember(conversationId: id, message: text, reply: reply)
            }
            if wasNewConversation, conversationId != nil { await loadConversations() }
        }
    }

    // MARK: - Memory

    /// The on-device memory pass for one finished reading. Runs on its own,
    /// outside the transcript's generation, so starting a new reading does not
    /// lose it. If the on-device model cannot produce notes, the server is
    /// asked to run its own pass on this turn instead.
    private func remember(conversationId: String, message: String, reply: String) {
        let context = MemoryContext(facts: knownFacts ?? [])
        let previous = conversationSummaries[conversationId]
        let today = Self.localDate()
        Task {
            if let notes = await OnDeviceMemory.notes(
                message: message,
                reply: reply,
                previousSummary: previous,
                context: context,
                today: today
            ) {
                let payload = MemoryPayloadBuilder.build(conversationId: conversationId, notes: notes, context: context)
                if let summary = payload.summary { conversationSummaries[conversationId] = summary }
                if !payload.isEmpty { try? await KnowledgeAPI.ingest(payload) }
            } else {
                try? await KnowledgeAPI.ingestFallback(conversationId: conversationId)
            }
            await refreshMemory()
        }
    }

    /// The user's own calendar date, `yyyy-MM-dd`.
    private static func localDate() -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: .now)
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
