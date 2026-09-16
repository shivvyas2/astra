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

    func markRead(_ alert: SancharaAlert) async {
        guard alert.isUnread else { return }
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
