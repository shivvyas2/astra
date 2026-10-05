import SwiftUI
import WidgetKit

/// The newest unread dosha or hard-transit alert, on the Home and Lock Screens.
///
/// Same data path as the reading widget: the provider refreshes the shared
/// cache itself, then draws from it. An alert drops off the moment it is read
/// in the app; one older than three weeks drops off on its own
/// (`AlertPick.maxAge`). A tap opens that alert in the app.
struct AlertsProvider: TimelineProvider {
    func placeholder(in context: Context) -> AlertsEntry {
        AlertsEntry(date: Date(), snapshot: .preview)
    }

    func getSnapshot(in context: Context, completion: @escaping (AlertsEntry) -> Void) {
        let snapshot = WidgetSnapshot.load()
        let useful = snapshot.alert != nil || !context.isPreview
        completion(AlertsEntry(date: Date(), snapshot: useful ? snapshot : .preview))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<AlertsEntry>) -> Void) {
        Task {
            await WidgetTimeline.refresh(from: WidgetRefresh.Kind.alerts)
            let now = Date()
            let entry = AlertsEntry(date: now, snapshot: WidgetSnapshot.load(now: now))
            completion(Timeline(entries: [entry], policy: WidgetTimeline.policy(now: now)))
        }
    }
}

struct AlertsEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot
}

struct AlertsWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: AlertsEntry

    private var snapshot: WidgetSnapshot { entry.snapshot }

    var body: some View {
        Group {
            switch family {
            case .accessoryRectangular:
                lockScreen
            default:
                if let alert = snapshot.alert {
                    family == .systemSmall ? AnyView(small(alert)) : AnyView(medium(alert))
                } else {
                    clear
                }
            }
        }
        .widgetURL(snapshot.alert.flatMap { WidgetLink.alert($0.id) })
        .containerBackground(for: .widget) {
            if family.isAccessory {
                Color.clear
            } else {
                WidgetGround(tint: tint)
            }
        }
    }

    /// The wash takes the alert's colour; a muted alert or none at all gets
    /// the cool field.
    private var tint: Color {
        switch snapshot.alert?.severity {
        case "warning": Theme.ember
        case "caution": Theme.accent
        default: Theme.violet
        }
    }

    // MARK: - Families

    private var lockScreen: some View {
        VStack(alignment: .leading, spacing: 2) {
            if let alert = snapshot.alert {
                Text("ALERT · \(AlertTone.label(for: alert.severity).uppercased())")
                    .font(.system(size: 10, weight: .semibold))
                    .widgetAccentable()
                Text(alert.title)
                    .font(.system(size: 13, weight: .medium))
                    .lineLimit(2)
            } else {
                Text("ALERTS")
                    .font(.system(size: 10, weight: .semibold))
                    .widgetAccentable()
                Text(snapshot.needsSignIn ? "Sign in again" : "All clear")
                    .font(.system(size: 13, weight: .medium))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private func small(_ alert: ChartCache.CachedAlert) -> some View {
        let tone = AlertTone.color(for: alert.severity)
        return VStack(alignment: .leading, spacing: 6) {
            WidgetHeader(eyebrow: AlertTone.label(for: alert.severity), dot: tone)
            Spacer(minLength: 0)
            WidgetDisplay(text: alert.title, size: 19, lines: 3)
            Text(footer(alert))
                .font(.brutMono(10))
                .foregroundStyle(Theme.muted)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(AlertTone.label(for: alert.severity)) alert. \(alert.title)")
    }

    private func medium(_ alert: ChartCache.CachedAlert) -> some View {
        let tone = AlertTone.color(for: alert.severity)
        return VStack(alignment: .leading, spacing: 6) {
            WidgetHeader(eyebrow: "Alert · \(AlertTone.label(for: alert.severity))", dot: tone)
            WidgetDisplay(text: alert.title, size: 22, lines: 2)
                .padding(.top, 2)
            Text(alert.body)
                .font(.system(size: 12))
                .foregroundStyle(Theme.muted)
                .lineLimit(2)
            Spacer(minLength: 0)
            WidgetRule()
            HStack {
                WidgetEyebrow(
                    text: snapshot.unreadCount == 1 ? "1 unread" : "\(snapshot.unreadCount) unread",
                    color: tone
                )
                Spacer(minLength: 4)
                Text(WidgetTime.ago(alert.createdAt, now: entry.date))
                    .font(.brutMono(10))
                    .foregroundStyle(Theme.muted)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .accessibilityElement(children: .combine)
    }

    private var clear: some View {
        let message: String
        if snapshot.needsSignIn {
            message = "Open Astrya to sign in again."
        } else if snapshot.alerts == nil {
            message = "Alerts appear here once Astrya has loaded them."
        } else {
            message = "No dosha or hard transit is starting or ending."
        }
        return WidgetEmpty(
            eyebrow: "Alerts",
            headline: snapshot.needsSignIn ? "Sign in again" : "All clear",
            message: message
        )
    }

    private func footer(_ alert: ChartCache.CachedAlert) -> String {
        let ago = WidgetTime.ago(alert.createdAt, now: entry.date)
        return snapshot.unreadCount > 1 ? "\(ago) · +\(snapshot.unreadCount - 1)" : ago
    }
}

struct AlertsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: WidgetRefresh.Kind.alerts, provider: AlertsProvider()) { entry in
            AlertsWidgetView(entry: entry)
        }
        .configurationDisplayName("Alerts")
        .description("The newest dosha or hard transit starting or ending in your chart.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}
