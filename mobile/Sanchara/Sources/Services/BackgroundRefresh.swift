import BackgroundTasks
import Foundation

/// The app's part in keeping the widgets current while it is not open.
///
/// The widget already refreshes itself (`WidgetSync` from its own timeline
/// provider). This adds two more ways in, each of which iOS grants or withholds
/// on its own terms:
///
/// - a `BGAppRefreshTask`, which iOS runs at a time it chooses — more often for
///   apps that are opened often, never for one the user force-quit;
/// - a push, when APNs is configured on the server: the alert and reading
///   pushes carry `content-available`, which wakes the app long enough to
///   fetch and reload the widgets before anyone taps the notification.
///
/// Neither is required. With no push and no background time, the widget's own
/// refresh still runs.
enum BackgroundRefresh {
    /// Also listed under `BGTaskSchedulerPermittedIdentifiers` in `project.yml`.
    static let identifier = "com.shivvyas.astra.refresh"

    /// The app's token source: supabase-swift refreshes and stores the
    /// session itself, in the Keychain item the widget shares.
    static let appToken: WidgetSync.TokenSource = {
        if let token = await Supa.accessToken() { return .token(token) }
        return .unavailable
    }

    /// Asks iOS for the next background refresh, timed to when the next
    /// reading is written. Submitting again replaces the pending request.
    static func schedule(now: Date = Date()) {
        let request = BGAppRefreshTaskRequest(identifier: identifier)
        request.earliestBeginDate = RefreshSchedule.next(after: now)
        try? BGTaskScheduler.shared.submit(request)
    }

    /// Fetches the reading, the alerts and the current period, then reloads
    /// every widget. Returns whether anything new arrived.
    @discardableResult
    static func run(force: Bool = true) async -> Bool {
        let outcome = await WidgetSync.refresh(token: appToken, force: force)
        await TimelineStore.warmCache()
        WidgetRefresh.reloadAll()
        return outcome.changed
    }
}
