import Foundation
#if canImport(WidgetKit)
import WidgetKit
#endif

/// Tells the widget its cache has changed.
///
/// WidgetKit's timeline would eventually pick up a new reading on its own — the
/// provider asks to be rebuilt at the next six o'clock — but "eventually" is
/// wrong when someone has just read the thing in the app. This nudges it.
///
/// Reloads are rate-limited by the system, so this is called when a reading
/// actually changes, never on every load.
enum WidgetRefresh {
    static func reload() {
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadTimelines(ofKind: "SancharaReading")
        #endif
    }

    /// The current-period widget. Its content changes once a year or so on its
    /// own; this is for the moment a meaning arrives from the server.
    static func reloadPeriod() {
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadTimelines(ofKind: "SancharaPeriod")
        #endif
    }
}
