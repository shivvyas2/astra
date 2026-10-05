import AppIntents

/// The phrases that work the moment the app is installed, with nothing set up.
///
/// An `AppShortcut` is the difference between "Siri can do this if you build a
/// shortcut first" and "Siri can do this". Every phrase has to contain
/// `\(.applicationName)`, which is why they all read a little formally — that
/// token is replaced by the app name and by whatever the person has renamed it
/// to, so "ask Astrya where Saturn is" keeps working for someone who calls it
/// something else.
///
/// Ten is the ceiling Apple sets, and fewer is better: these are the four
/// things worth being able to say without opening anything.
@available(iOS 18.0, *)
struct SancharaShortcuts: AppShortcutsProvider {
    /// Tints the shortcut tiles in the Shortcuts app.
    static var shortcutTileColor: ShortcutTileColor = .tangerine

    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: TodaysReadingIntent(),
            phrases: [
                "What's my reading in \(.applicationName)",
                "\(.applicationName) reading",
                "Read my \(.applicationName) reading",
                "What does \(.applicationName) say today",
            ],
            shortTitle: "Today's reading",
            systemImageName: "moon.stars"
        )

        AppShortcut(
            intent: CurrentPeriodIntent(),
            phrases: [
                "What dasha am I in on \(.applicationName)",
                "My \(.applicationName) dasha",
                "What period am I running in \(.applicationName)",
            ],
            shortTitle: "Current dasha",
            systemImageName: "hourglass"
        )

        AppShortcut(
            intent: ChartPositionIntent(),
            phrases: [
                "Where is my \(\.$placement) in \(.applicationName)",
                "\(.applicationName) \(\.$placement) placement",
            ],
            shortTitle: "Find a planet",
            systemImageName: "circle.hexagongrid"
        )

        AppShortcut(
            intent: OpenKundliIntent(),
            phrases: [
                "Open my \(.applicationName) kundli",
                "Show my chart in \(.applicationName)",
            ],
            shortTitle: "Open kundli",
            systemImageName: "square.on.square.dashed"
        )

        if #available(iOS 26.0, *) {
            AppShortcut(
                intent: ShowReadingCardIntent(),
                phrases: [
                    "Show my \(.applicationName) reading",
                    "Show me today's \(.applicationName) reading",
                ],
                shortTitle: "Show reading",
                systemImageName: "rectangle.portrait.and.arrow.forward"
            )
        }

        // Free-form questions need the on-device model, so this phrase only
        // exists where that model does.
        if #available(iOS 26.0, *) {
            AppShortcut(
                intent: AskSancharaIntent(),
                phrases: [
                    "Ask \(.applicationName) about my chart",
                    "Ask \(.applicationName)",
                ],
                shortTitle: "Ask about my chart",
                systemImageName: "sparkles"
            )
        }
    }
}
