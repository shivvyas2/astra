import Foundation

/// The consent screen's words. Mirrors `CONSENT_COPY` in lib/billing/copy.ts;
/// change both together, and bump `ConsentPolicy.currentVersion` (and the
/// server's) when what is sent, to whom, or what is kept changes.
enum ConsentCopy {
    struct Section: Identifiable {
        let label: String
        let title: String
        let points: [String]
        var id: String { title }
    }

    static let eyebrow = "Your data"
    static let title = "Before your first reading"
    static let intro = "Astrya's readings are written by an AI model made by Anthropic. To write one, your details have to be sent to it. Here is exactly what goes where."

    static let sections: [Section] = [
        Section(label: "Sent", title: "What is sent", points: [
            "Your birth date, time and place, and the chart worked out from them.",
            "The questions you ask and the conversation so far.",
            "Facts Astrya remembers about you, and short notes from past readings.",
        ]),
        Section(label: "To", title: "Who receives it", points: [
            "Anthropic, the maker of Claude, only to write your reading. Under Anthropic's commercial terms it is not used to train their models.",
            "On iPhones with Apple Intelligence, some answers and notes are made by Apple's on-device model. That stays on your phone.",
        ]),
        Section(label: "Kept", title: "What is kept, and where", points: [
            "Your birth details, chart, conversations and remembered facts are stored in Astrya's database (Supabase).",
            "The Astrya team can read conversations and what Astrya remembers, to fix problems and keep readings safe.",
            "It stays until you delete it or your account.",
        ]),
        Section(label: "Yours", title: "Your choices", points: [
            "See or delete what Astrya remembers in Profile, under What Astrya knows.",
            "Delete your account and everything in it from Profile at any time.",
            "Withdraw this consent in Profile whenever you like. Readings pause until you agree again.",
        ]),
    ]

    static let agree = "Agree and continue"
    static let notNow = "Not now"
    static let declinedTitle = "Readings need this"
    static let declinedBody = "Every reading is written by Anthropic's model from your chart and your question, so Astrya can't read for you without sending them. Nothing has been sent. Come back to this whenever you're ready."
    static let reviewAgain = "Review again"

    static let privacyURL = AppConfig.apiBaseURL.appendingPathComponent("privacy")
}
