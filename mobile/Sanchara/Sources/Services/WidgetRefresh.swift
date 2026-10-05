import Foundation
#if canImport(WidgetKit)
import WidgetKit
#endif

/// Tells the widgets their cache has changed.
///
/// Each widget also refreshes itself on a schedule (`WidgetSync`), but a
/// schedule is wrong when someone has just read the thing in the app. This
/// nudges it.
///
/// Reloads are rate-limited by the system when the app is in the background,
/// so this is called when content actually changes, never on every load.
/// Compiled into the widget extension too, which uses the kinds.
enum WidgetRefresh {
    enum Kind {
        static let reading = "SancharaReading"
        static let period = "SancharaPeriod"
        static let alerts = "SancharaAlerts"
    }

    static func reload() {
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadTimelines(ofKind: Kind.reading)
        #endif
    }

    /// The current-period widget. Its content changes once a year or so on its
    /// own; this is for the moment a meaning arrives from the server.
    static func reloadPeriod() {
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadTimelines(ofKind: Kind.period)
        #endif
    }

    /// The alert widget, and the reading widget's alert line.
    static func reloadAlerts() {
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadTimelines(ofKind: Kind.alerts)
        WidgetCenter.shared.reloadTimelines(ofKind: Kind.reading)
        #endif
    }

    /// After a background refresh, a push, or sign-out.
    static func reloadAll() {
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadAllTimelines()
        #endif
    }
}
