import AppIntents
import SwiftUI

/// The reading, rendered inside Siri.
///
/// A snippet is what turns "Siri reads a paragraph at you" into something you
/// can actually look at — and, because a `SnippetIntent` is re-run rather than
/// re-rendered, something that can update in place. The card here is
/// deliberately the same object as the widget's: same eyebrow, same serif
/// title, same body. Seeing one thing in three places is what makes it feel
/// like one app rather than three integrations.
@available(iOS 26.0, *)
struct ReadingSnippetIntent: SnippetIntent {
    static var title: LocalizedStringResource = "Reading card"
    /// Not something to offer in Shortcuts on its own — it is the presentation
    /// of another intent's result.
    static var isDiscoverable = false

    @Parameter(title: "Reading")
    var reading: DailyReadingEntity

    init() {}

    init(reading: DailyReadingEntity) {
        self.reading = reading
    }

    func perform() async throws -> some IntentResult & ShowsSnippetView {
        .result(view: ReadingCard(
            eyebrow: "\(reading.slotLabel) · \(reading.prettyDate)",
            title: reading.title,
            text: reading.body
        ))
    }
}
