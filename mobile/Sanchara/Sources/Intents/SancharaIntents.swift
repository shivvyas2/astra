import AppIntents
import Foundation

/// What Siri, Shortcuts, Spotlight, and the Action button can do with Astrya.
///
/// App Intents is the only route into an app that Siri takes now — SiriKit's
/// domains never covered astrology and are on their way out regardless — so
/// everything Siri should reach lives in this file.
///
/// The split between these intents is the same one the chat makes. Positions
/// and periods are records: they are fixed, they are on the device, and an
/// intent can answer them instantly, offline, and for nothing. Readings are
/// written by Claude: an intent can hand back one already written, but it never
/// commissions a new one, because a Siri phrase should not silently spend money
/// or take thirty seconds to answer.

// MARK: - Today's reading

@available(iOS 18.0, *)
struct TodaysReadingIntent: AppIntent {
    static var title: LocalizedStringResource = "Today's reading"
    static var description = IntentDescription(
        "Reads back the most recent reading written for you.",
        categoryName: "Readings",
        searchKeywords: ["kundli", "horoscope", "astrology", "daily"]
    )

    /// Answering in Siri rather than dumping the person into the app is the
    /// whole point: `openAppWhenRun = false` is what makes this useful hands-free.
    static var openAppWhenRun = false

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<DailyReadingEntity> & ProvidesDialog {
        guard let reading = await IntentData.latestReading() else {
            throw SancharaIntentError.noReadingYet
        }
        let entity = DailyReadingEntity(reading)
        return .result(
            value: entity,
            dialog: IntentDialog("\(entity.title). \(entity.body)")
        )
    }
}

/// The same reading, shown as a card instead of spoken.
///
/// Kept separate from `TodaysReadingIntent` rather than branching inside it:
/// `SnippetIntent` arrived in iOS 26, an intent's `perform()` has one concrete
/// return type, and the two are genuinely different actions anyway — one is for
/// asking with the phone in your pocket, the other for asking with it in your
/// hand.
@available(iOS 26.0, *)
struct ShowReadingCardIntent: AppIntent {
    static var title: LocalizedStringResource = "Show today's reading"
    static var description = IntentDescription(
        "Shows your most recent reading as a card.",
        categoryName: "Readings",
        searchKeywords: ["kundli", "horoscope", "reading", "card"]
    )
    static var openAppWhenRun = false

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog & ShowsSnippetIntent {
        guard let reading = await IntentData.latestReading() else {
            throw SancharaIntentError.noReadingYet
        }
        let entity = DailyReadingEntity(reading)
        return .result(
            dialog: IntentDialog(stringLiteral: entity.title),
            snippetIntent: ReadingSnippetIntent(reading: entity)
        )
    }
}

// MARK: - A placement

@available(iOS 18.0, *)
struct ChartPositionIntent: AppIntent {
    static var title: LocalizedStringResource = "Where a planet sits"
    static var description = IntentDescription(
        "Looks up one planet's sign, degree, and house in your kundli.",
        categoryName: "Chart",
        searchKeywords: ["kundli", "planet", "house", "rashi", "graha"]
    )
    static var openAppWhenRun = false

    @Parameter(title: "Planet")
    var placement: PlacementEntity

    static var parameterSummary: some ParameterSummary {
        Summary("Where is \(\.$placement) in my kundli")
    }

    func perform() async throws -> some IntentResult & ReturnsValue<PlacementEntity> & ProvidesDialog {
        .result(value: placement, dialog: IntentDialog("\(placement.spoken)"))
    }
}

// MARK: - The current period

@available(iOS 18.0, *)
struct CurrentPeriodIntent: AppIntent {
    static var title: LocalizedStringResource = "Current dasha"
    static var description = IntentDescription(
        "Reads back the Vimshottari mahadasha and antardasha you are running.",
        categoryName: "Chart",
        searchKeywords: ["dasha", "mahadasha", "antardasha", "period"]
    )
    static var openAppWhenRun = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let dasha = IntentData.chart()?.dasha else {
            throw SancharaIntentError.noChartYet
        }
        let line = "You are in \(dasha.mahadasha) mahadasha until \(Self.spoken(dasha.mahadashaEnd)), "
            + "and \(dasha.antardasha) antardasha until \(Self.spoken(dasha.antardashaEnd))."
        return .result(dialog: IntentDialog(stringLiteral: line))
    }

    private static func spoken(_ iso: String) -> String {
        ChartFacts.calendarDay(iso, format: "MMMM yyyy")
    }
}

// MARK: - Ask a question

/// A free-form question, answered on the device when it is a lookup.
///
/// This is the intent that makes a Siri phrase worth having: it runs the same
/// router the chat does, so "ask Astrya what's in my seventh house" is
/// answered out loud in about a second, without a network call and without
/// spending anything. A question that turns out to need a real reading is
/// handed to the app rather than answered badly — Siri says so and opens it.
@available(iOS 26.0, *)
struct AskSancharaIntent: AppIntent {
    static var title: LocalizedStringResource = "Ask about my chart"
    static var description = IntentDescription(
        "Answers a question about your kundli on this device.",
        categoryName: "Chart",
        searchKeywords: ["kundli", "chart", "ask", "astrology"]
    )
    static var openAppWhenRun = false

    @Parameter(title: "Question", requestValueDialog: "What do you want to know?")
    var question: String

    static var parameterSummary: some ParameterSummary {
        Summary("Ask Astrya \(\.$question)")
    }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let chart = IntentData.chart() else {
            throw SancharaIntentError.noChartYet
        }
        switch await OnDeviceReasoner(chart: chart).route(question) {
        case .answered(let answer):
            return .result(dialog: IntentDialog(stringLiteral: answer))

        case .escalate:
            // Not a lookup. Answering it here would mean either a thin answer or
            // a paid call the person did not ask for and a wait Siri will not
            // sit through, so the question is queued instead and the app picks
            // it up on next launch. Saying so plainly beats doing either.
            DeepLink.shared.queue(question: question)
            return .result(dialog: IntentDialog(
                "That one needs a full reading. I've saved the question — open Astrya and it's ready to ask."
            ))
        }
    }
}

// MARK: - Errors

enum SancharaIntentError: Error, CustomLocalizedStringResourceConvertible {
    case noChartYet
    case noReadingYet

    /// `writing.md`: say what went wrong and what to do about it. Siri reads
    /// this aloud, so it is a sentence, not a code.
    var localizedStringResource: LocalizedStringResource {
        switch self {
        case .noChartYet:
            "Open Astrya and add your birth details first — there's no chart to read yet."
        case .noReadingYet:
            "There's no reading yet. Astrya writes one each morning and night."
        }
    }
}
