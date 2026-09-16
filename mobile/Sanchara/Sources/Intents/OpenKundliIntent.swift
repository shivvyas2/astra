import AppIntents

/// Opens the kundli.
///
/// Deliberately kept in a file of its own with no dependency beyond
/// `ChartCache`: this intent is compiled into the widget extension as well as
/// the app, because the Control Center button runs it from a process that has
/// no Supabase session and no access to anything else in the app. Anything it
/// imported, the widget would have to import too.
@available(iOS 17.0, *)
struct OpenKundliIntent: AppIntent {
    static var title: LocalizedStringResource = "Open my kundli"
    static var description = IntentDescription(
        "Opens your birth chart.",
        categoryName: "Chart"
    )

    /// The one intent that should open the app: a diagram is the answer, and
    /// Siri has nowhere to put one.
    static var openAppWhenRun = true

    func perform() async throws -> some IntentResult {
        // Written to the app group rather than to memory, because the control
        // that ran this may be in a different process from the app it is about
        // to launch.
        ChartCache.shared.setPendingDestination("kundli")
        return .result()
    }
}
