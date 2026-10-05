import Foundation
import WidgetKit

/// What the reading and alert widgets draw, read from the app group cache.
struct WidgetSnapshot {
    let reading: ChartCache.CachedReading?
    /// Nil when alerts have never been fetched on this device.
    let alerts: [ChartCache.CachedAlert]?
    /// The newest unread alert worth showing, if any.
    let alert: ChartCache.CachedAlert?
    let unreadCount: Int
    /// The session could not be refreshed; only opening the app fixes it.
    let needsSignIn: Bool

    static func load(now: Date = Date()) -> WidgetSnapshot {
        let cache = ChartCache.shared
        let alerts = cache.loadAlerts()
        let fresh = AlertPick.fresh(alerts ?? [], now: now)
        return WidgetSnapshot(
            reading: cache.loadReading(),
            alerts: alerts,
            alert: fresh.first,
            unreadCount: fresh.count,
            needsSignIn: cache.sessionRevoked
        )
    }

    static let preview = WidgetSnapshot(
        reading: ChartCache.CachedReading(
            id: "preview", slot: "morning", title: "A steady start",
            body: "The Moon holds your fourth house today — the day rewards finishing what is already open rather than beginning something new.",
            forDate: "2026-10-05", savedAt: Date()
        ),
        alerts: [previewAlert],
        alert: previewAlert,
        unreadCount: 1,
        needsSignIn: false
    )

    static let previewAlert = ChartCache.CachedAlert(
        id: "preview-alert", severity: "warning", kinds: ["sade_sati"],
        title: "Sade Sati begins", body: "Saturn enters the sign before your Moon — a long, slow test of patience starts now.",
        createdAt: Date().addingTimeInterval(-7200), readAt: nil
    )
}

/// The refresh both timeline providers run before drawing: fetch if it is time
/// (sharing one fetch between widgets), then tell the *other* widgets if
/// something changed so they do not wait for their own turn.
enum WidgetTimeline {
    static func refresh(from kind: String) async {
        let outcome = await WidgetSync.refresh(token: WidgetSync.widgetToken)
        guard outcome.changed else { return }
        for other in [WidgetRefresh.Kind.reading, WidgetRefresh.Kind.alerts] where other != kind {
            WidgetCenter.shared.reloadTimelines(ofKind: other)
        }
    }

    /// When to ask again.
    static func policy(now: Date = Date()) -> TimelineReloadPolicy {
        .after(RefreshSchedule.next(after: now))
    }
}

extension ChartCache.CachedReading {
    var slotLabel: String { slot == "morning" ? "Morning" : "Night" }
    var isMorning: Bool { slot == "morning" }

    /// "5 Oct", from the reading's own `yyyy-MM-dd`.
    var dayLabel: String {
        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.dateFormat = "yyyy-MM-dd"
        guard let day = parser.date(from: forDate) else { return forDate }
        if Calendar.current.isDateInToday(day) { return "Today" }
        if Calendar.current.isDateInYesterday(day) { return "Yesterday" }
        let pretty = DateFormatter()
        pretty.setLocalizedDateFormatFromTemplate("d MMM")
        return pretty.string(from: day)
    }
}
