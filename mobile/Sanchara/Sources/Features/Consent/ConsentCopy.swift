import Foundation

/// The consent screen's words. Mirrors `CONSENT_COPY` in lib/billing/copy.ts;
/// change both together, and bump `ConsentPolicy.currentVersion` (and the
/// server's) when what is sent, to whom, or what is kept changes.
///
/// Computed rather than stored so the words follow the app's language when it
/// changes; a `static let` would keep the language of its first use.
enum ConsentCopy {
    struct Section: Identifiable {
        let label: String
        let title: String
        let points: [String]
        var id: String { title }
    }

    static var eyebrow: String { L10n.string("Your data") }
    static var title: String { L10n.string("Before your first reading") }
    static var intro: String { L10n.string("Astrya's readings are written by an AI model made by Anthropic. To write one, your details have to be sent to it. Here is exactly what goes where.") }

    static var sections: [Section] { [
        Section(label: L10n.string("Sent"), title: L10n.string("What is sent"), points: [
            L10n.string("Your birth date, time and place, and the chart worked out from them."),
            L10n.string("The questions you ask and the conversation so far."),
            L10n.string("Facts Astrya remembers about you, and short notes from past readings."),
        ]),
        Section(label: L10n.string("To"), title: L10n.string("Who receives it"), points: [
            L10n.string("Anthropic, the maker of Claude, only to write your reading. Under Anthropic's commercial terms it is not used to train their models."),
            L10n.string("On iPhones with Apple Intelligence, some answers and notes are made by Apple's on-device model. That stays on your phone."),
        ]),
        Section(label: L10n.string("Kept"), title: L10n.string("What is kept, and where"), points: [
            L10n.string("Your birth details, chart, conversations and remembered facts are stored in Astrya's database (Supabase)."),
            L10n.string("The Astrya team can read conversations and what Astrya remembers, to fix problems and keep readings safe."),
            L10n.string("It stays until you delete it or your account."),
        ]),
        Section(label: L10n.string("Yours"), title: L10n.string("Your choices"), points: [
            L10n.string("See or delete what Astrya remembers in Profile, under What Astrya knows."),
            L10n.string("Delete your account and everything in it from Profile at any time."),
            L10n.string("Withdraw this consent in Profile whenever you like. Readings pause until you agree again."),
        ]),
    ] }

    static var agree: String { L10n.string("Agree and continue") }
    static var notNow: String { L10n.string("Not now") }
    static var declinedTitle: String { L10n.string("Readings need this") }
    static var declinedBody: String { L10n.string("Every reading is written by Anthropic's model from your chart and your question, so Astrya can't read for you without sending them. Nothing has been sent. Come back to this whenever you're ready.") }
    static var reviewAgain: String { L10n.string("Review again") }

    static let privacyURL = AppConfig.apiBaseURL.appendingPathComponent("privacy")
    static let termsURL = AppConfig.apiBaseURL.appendingPathComponent("terms")
}
