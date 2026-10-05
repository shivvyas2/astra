import Foundation
import Supabase

/// One dosha alert written by the daily job.
struct SancharaAlert: Decodable, Identifiable, Hashable {
    let id: String
    let severity: String
    let kinds: [String]
    let title: String
    let body: String
    let detail: String
    let createdAt: Date
    let readAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, severity, kinds, title, body, detail
        case createdAt = "created_at"
        case readAt = "read_at"
    }

    var isUnread: Bool { readAt == nil }
}

@Observable
@MainActor
final class AlertsStore {
    var alerts: [SancharaAlert] = []
    /// The alert being read, either from the list or from a tapped notification.
    var selected: SancharaAlert?

    var unreadCount: Int { alerts.filter(\.isUnread).count }

    func load() async {
        do {
            alerts = try await Supa.client
                .from("alerts")
                .select("id, severity, kinds, title, body, detail, created_at, read_at")
                .order("created_at", ascending: false)
                .limit(50)
                .execute()
                .value
            Self.cache(alerts)
        } catch {
            // The inbox is secondary to the reading; a failed refresh keeps
            // whatever was already loaded.
        }
    }

    /// Opens the alert a notification pointed at, fetching it if the list is
    /// stale (the push usually arrives before the app has reloaded).
    func open(id: String) async {
        if let known = alerts.first(where: { $0.id == id }) {
            selected = known
            await markRead(known)
            return
        }
        await load()
        if let found = alerts.first(where: { $0.id == id }) {
            selected = found
            await markRead(found)
        }
    }

    /// The alert widget draws from this; the newest few are enough for it.
    /// Reloaded only when something changed, since reloads are budgeted.
    private static func cache(_ alerts: [SancharaAlert]) {
        let mapped = alerts.prefix(10).map {
            ChartCache.CachedAlert(
                id: $0.id, severity: $0.severity, kinds: $0.kinds, title: $0.title,
                body: $0.body, createdAt: $0.createdAt, readAt: $0.readAt
            )
        }
        guard ChartCache.shared.loadAlerts() != Array(mapped) else { return }
        ChartCache.shared.save(alerts: Array(mapped))
        ChartCache.shared.flush()
        WidgetRefresh.reloadAlerts()
    }

    func markRead(_ alert: SancharaAlert) async {
        guard alert.isUnread else { return }
        // Off the widget straight away, whether or not the write below lands.
        ChartCache.shared.markAlertRead(id: alert.id)
        WidgetRefresh.reloadAlerts()
        do {
            try await Supa.client
                .from("alerts")
                .update(["read_at": ISO8601DateFormatter().string(from: Date())])
                .eq("id", value: alert.id)
                .execute()
            await load()
        } catch {
            // Worst case the badge stays until the next successful load.
        }
    }
}
