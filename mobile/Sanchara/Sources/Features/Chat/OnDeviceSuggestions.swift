import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

#if canImport(FoundationModels)
/// The shape Apple's on-device model fills in. Constrained decoding means the
/// result is always three usable strings, never prose to be parsed.
@available(iOS 26.0, *)
@Generable
struct FollowUpQuestions {
    // The schema text is part of the prompt, so it stays as neutral as the
    // instructions do — see `generate(from:)`.
    @Guide(
        description: """
            Exactly three short questions the passage leaves unanswered. Each is written in \
            the first person, under sixty characters, with no numbering and no quotation marks.
            """
    )
    var questions: [String]
}
#endif

/// Suggested next questions under the reading.
///
/// These run on Apple's on-device model, so the reading text never leaves the
/// phone, the suggestions cost nothing per tap, and they appear instantly after
/// a reading finishes. Where Apple Intelligence is unavailable — an older
/// device, or a user who has it switched off — mode-appropriate starters are
/// shown instead, so the feature degrades rather than disappears.
@Observable
@MainActor
final class SuggestionEngine {
    private(set) var suggestions: [String] = []
    private(set) var isThinking = false

    private var work: Task<Void, Never>?

    /// Whether the phone can actually run the on-device model right now.
    static var isOnDeviceAvailable: Bool {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            return SystemLanguageModel.default.availability == .available
        }
        #endif
        return false
    }

    /// A human-readable status, shown on the profile screen.
    static var onDeviceStatus: String {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            switch SystemLanguageModel.default.availability {
            case .available:
                return "On, generating suggestions on this device"
            case .unavailable(.appleIntelligenceNotEnabled):
                return "Turn on Apple Intelligence in Settings to enable"
            case .unavailable(.modelNotReady):
                return "Apple Intelligence is still downloading its model"
            case .unavailable(.deviceNotEligible):
                return "This device doesn't support Apple Intelligence"
            case .unavailable:
                return "Unavailable on this device"
            }
        }
        #endif
        return "Needs iOS 26 or later"
    }

    /// What to offer before there is a reading to build on.
    func showStarters(for mode: ChatMode) {
        work?.cancel()
        isThinking = false
        suggestions = Self.starters(for: mode)
    }

    /// Reads the finished reading and proposes where to go next.
    func refresh(after reading: String, mode: ChatMode) {
        work?.cancel()
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *), Self.isOnDeviceAvailable {
            isThinking = true
            suggestions = []
            work = Task {
                let generated = await Self.generate(from: reading)
                guard !Task.isCancelled else { return }
                suggestions = generated.isEmpty ? Self.starters(for: mode) : generated
                isThinking = false
            }
            return
        }
        #endif
        suggestions = Self.starters(for: mode)
    }

    func clear() {
        work?.cancel()
        isThinking = false
        suggestions = []
    }

    #if canImport(FoundationModels)
    @available(iOS 26.0, *)
    private static func generate(from reading: String) async -> [String] {
        // Two things had to be got right here, both found by testing against
        // the real model:
        //
        // 1. Permissive guardrails — the input is Sanchara's own reading, not
        //    arbitrary user content.
        // 2. Framing. Asked to act as an astrologer's assistant, the on-device
        //    model refuses outright ("May contain sensitive content"): fortune
        //    telling is off-limits for it. Asked to list what a passage leaves
        //    unanswered — a plain text transformation, which is all this is —
        //    it answers well. So the prompt never mentions astrology.
        let model = SystemLanguageModel(guardrails: .permissiveContentTransformations)
        let session = LanguageModelSession(
            model: model,
            instructions: """
                You rewrite and summarise text. You never add facts of your own, and you \
                never answer the questions you raise.
                """
        )
        // The tail carries the conclusion, which is what a follow-up hangs off.
        let excerpt = String(reading.suffix(1200))
        do {
            let response = try await session.respond(
                to: "Passage:\n\(excerpt)\n\nList three short questions, in the first person, that this passage leaves unanswered.",
                generating: FollowUpQuestions.self
            )
            return response.content.questions
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty && $0.count <= 90 }
                .prefix(3)
                .map { String($0) }
        } catch {
            // Guardrails, a cancelled session, or a device whose model assets
            // are not downloaded: the written starters are a fine answer.
            #if DEBUG
            print("on-device suggestions unavailable: \(error)")
            #endif
            return []
        }
    }
    #endif

    static func starters(for mode: ChatMode) -> [String] {
        switch mode {
        case .vedic:
            [
                "What does my chart say about work right now?",
                "Do I have any doshas I should know about?",
                "How will the next few months go?",
            ]
        case .western:
            [
                "What are my strongest placements?",
                "What is this transit doing to me?",
                "How do I come across to other people?",
            ]
        case .numerology:
            [
                "What do my numbers say about this year?",
                "Which dates suit me best?",
                "What kind of work fits my numbers?",
            ]
        }
    }
}
