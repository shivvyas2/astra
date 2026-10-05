import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

#if canImport(FoundationModels)
// The shapes Apple's on-device model fills in after a reading. Guided
// generation means the result is always these fields with these value sets,
// never prose to parse. The descriptions are part of the prompt, so — like the
// instructions below — they never name the subject: the on-device model
// refuses astrology, and this is a note-taking task on a conversation.

@available(iOS 26.0, *)
@Generable
struct NotedFact {
    @Guide(description: "One short neutral sentence with no subject, under 25 words, for example: Works as a nurse in Pune.")
    var text: String

    @Guide(description: "What the fact is about.", .anyOf(FactCategory.allCases.map(\.rawValue)))
    var category: String

    @Guide(description: "stated if the person said it outright, inferred if their words make it plain.", .anyOf(["stated", "inferred"]))
    var confidence: String

    @Guide(description: "The reference, like F2, of a noted fact this one changes, or an empty string.")
    var replaces: String
}

@available(iOS 26.0, *)
@Generable
struct NotedEvent {
    @Guide(description: "One plain sentence about the expected event, addressed to the person, for example: A job offer from outside your company.")
    var claim: String

    @Guide(description: "What the event concerns.", .anyOf(MemoryTopic.allCases.map(\.rawValue)))
    var topic: String

    @Guide(description: "The first month of the window the reply gives, written yyyy-mm.")
    var firstMonth: String

    @Guide(description: "The last month of that window, written yyyy-mm. The same as firstMonth for a single month.")
    var lastMonth: String

    @Guide(description: "How sure the reply says it is.", .anyOf(["likely", "possible", "unlikely"]))
    var likelihood: String
}

@available(iOS 26.0, *)
@Generable
struct ConversationNotes {
    @Guide(
        description: "Lasting facts the person states about their own life in their newest message: work, relationships, family, health, money, home, plans, worries. Never from the advisor's reply. Usually empty.",
        .maximumCount(6)
    )
    var facts: [NotedFact]

    @Guide(description: "References, like F3, of noted facts the newest message says are no longer true. Usually empty.", .maximumCount(6))
    var noLongerTrue: [String]

    @Guide(description: "The whole conversation so far including the newest exchange, in two or three plain sentences under 80 words, third person: what the person asked and what the advisor concluded, with any months named.")
    var summary: String

    @Guide(description: "Up to four subjects of the conversation.", .maximumCount(4), .element(.anyOf(MemoryTopic.allCases.map(\.rawValue))))
    var topics: [String]

    @Guide(
        description: "Each concrete event the advisor's newest reply says is expected within named months. Leave out advice and anything without months. Usually zero to three.",
        .maximumCount(4)
    )
    var expectedEvents: [NotedEvent]
}
#endif

/// After a reading, works out what to remember — fact changes, the
/// conversation's rolling summary, the dated predictions — on the phone, with
/// Apple's on-device model, instead of the server paying Claude Haiku for it.
///
/// The chat request for that turn carries `memory: "on-device"` so the server
/// skips its own pass; `ChatStore` posts what this returns to
/// `/api/memory/ingest`, which validates it exactly as strictly as it does the
/// server pass. When this returns nil (a refusal, assets not downloaded),
/// `ChatStore` asks the server to run its pass after all, so no turn is lost.
enum OnDeviceMemory {
    /// The same check as `SuggestionEngine.isOnDeviceAvailable`, without its
    /// main-actor isolation, so the pass can run off the main actor.
    static var isAvailable: Bool {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            return SystemLanguageModel.default.availability == .available
        }
        #endif
        return false
    }

    static func notes(
        message: String,
        reply: String,
        previousSummary: String?,
        context: MemoryContext,
        today: String
    ) async -> ProposedNotes? {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *), isAvailable {
            return await generate(
                input: MemoryPayloadBuilder.modelInput(
                    message: message,
                    reply: reply,
                    previousSummary: previousSummary,
                    context: context,
                    today: today
                )
            )
        }
        #endif
        return nil
    }

    #if canImport(FoundationModels)
    @available(iOS 26.0, *)
    private static func generate(input: String) async -> ProposedNotes? {
        // Permissive guardrails: the input is Astrya's own reading and the
        // user's message to it, and the task is a transformation of that text.
        let session = LanguageModelSession(
            model: SystemLanguageModel(guardrails: .permissiveContentTransformations),
            instructions: """
                You take notes on a conversation between a person and an advisor, so the advisor \
                remembers it next time. You only restate what the text says. You never add facts of \
                your own, never answer the person, and never give advice. Facts about the person come \
                only from the person's own message.
                """
        )
        do {
            let response = try await session.respond(
                to: input,
                generating: ConversationNotes.self,
                options: GenerationOptions(sampling: .greedy, maximumResponseTokens: 700)
            )
            let c = response.content
            return ProposedNotes(
                facts: c.facts.map { .init(text: $0.text, category: $0.category, confidence: $0.confidence, replaces: $0.replaces) },
                noLongerTrue: c.noLongerTrue,
                summary: c.summary,
                topics: c.topics,
                events: c.expectedEvents.map {
                    .init(claim: $0.claim, topic: $0.topic, firstMonth: $0.firstMonth, lastMonth: $0.lastMonth, likelihood: $0.likelihood)
                }
            )
        } catch {
            #if DEBUG
            print("on-device memory unavailable: \(error)")
            #endif
            return nil
        }
    }
    #endif
}
