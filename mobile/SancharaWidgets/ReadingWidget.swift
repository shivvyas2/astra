import SwiftUI
import WidgetKit

/// Today's reading, on the Home and Lock Screens — with the latest unread
/// alert underneath it on the medium and large sizes.
///
/// The widget draws from the app group cache, so it is instant and works with
/// no signal. Before drawing, though, the provider refreshes that cache itself
/// (`WidgetSync`, using the session the app shares through the Keychain), so a
/// new reading reaches the Home Screen without the app being opened. If that
/// fetch fails for any reason, the cache answers as before.
///
/// The cadence is set by the content: the provider asks to be rebuilt shortly
/// after each reading is written, and at least every couple of hours for
/// alerts (`RefreshSchedule`).
struct ReadingProvider: TimelineProvider {
    func placeholder(in context: Context) -> ReadingEntry {
        ReadingEntry(date: Date(), snapshot: .preview)
    }

    func getSnapshot(in context: Context, completion: @escaping (ReadingEntry) -> Void) {
        let snapshot = WidgetSnapshot.load()
        let useful = snapshot.reading != nil || !context.isPreview
        completion(ReadingEntry(date: Date(), snapshot: useful ? snapshot : .preview))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ReadingEntry>) -> Void) {
        Task {
            await WidgetTimeline.refresh(from: WidgetRefresh.Kind.reading)
            let now = Date()
            let entry = ReadingEntry(date: now, snapshot: WidgetSnapshot.load(now: now))
            completion(Timeline(entries: [entry], policy: WidgetTimeline.policy(now: now)))
        }
    }
}

struct ReadingEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot
}

struct ReadingWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: ReadingEntry

    private var snapshot: WidgetSnapshot { entry.snapshot }

    var body: some View {
        Group {
            if let reading = snapshot.reading {
                switch family {
                case .accessoryRectangular:
                    lockScreen(reading)
                case .systemSmall:
                    small(reading)
                case .systemLarge:
                    large(reading)
                default:
                    medium(reading)
                }
            } else if family == .accessoryRectangular {
                VStack(alignment: .leading, spacing: 2) {
                    Text("ASTRYA").font(.system(size: 10, weight: .semibold)).widgetAccentable()
                    Text(snapshot.needsSignIn ? "Sign in again" : "No reading yet")
                        .font(.system(size: 13, weight: .medium))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                WidgetEmpty(
                    eyebrow: "Today",
                    headline: snapshot.needsSignIn ? "Sign in again" : "Your first reading",
                    message: snapshot.needsSignIn
                        ? "Open Astrya to keep this widget current."
                        : "It arrives with the next morning or night run."
                )
            }
        }
        .widgetURL(snapshot.reading.flatMap { WidgetLink.reading($0.id) })
        .containerBackground(for: .widget) {
            if family.isAccessory {
                Color.clear
            } else {
                WidgetGround(tint: snapshot.reading?.isMorning == false ? Theme.violet : Theme.ember)
            }
        }
    }

    // MARK: - Families

    /// The Lock Screen tints everything to one colour, so hierarchy is all
    /// this family can carry.
    private func lockScreen(_ reading: ChartCache.CachedReading) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(snapshot.alert == nil ? reading.slotLabel.uppercased() : "\(reading.slotLabel.uppercased()) · ALERT")
                .font(.system(size: 10, weight: .semibold))
                .widgetAccentable()
            Text(reading.title)
                .font(.system(size: 13, weight: .medium))
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private func small(_ reading: ChartCache.CachedReading) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            header(reading)
            Spacer(minLength: 0)
            WidgetDisplay(text: reading.title, size: 21, lines: 4)
            footer(reading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(reading.slotLabel) reading. \(reading.title)")
    }

    private func medium(_ reading: ChartCache.CachedReading) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            header(reading)
            WidgetDisplay(text: reading.title, size: 22, lines: snapshot.alert == nil ? 2 : 1)
                .padding(.top, 2)
            Text(reading.body)
                .font(.system(size: 12))
                .foregroundStyle(Theme.muted)
                .lineLimit(snapshot.alert == nil ? 3 : 2)
            Spacer(minLength: 0)
            if let alert = snapshot.alert {
                WidgetRule()
                alertLine(alert)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func large(_ reading: ChartCache.CachedReading) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            header(reading)
            WidgetDisplay(text: reading.title, size: 30, lines: 3)
                .padding(.top, 4)
            Text(reading.body)
                .font(.system(size: 14))
                .foregroundStyle(Theme.fg.opacity(0.78))
                .lineLimit(7)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            WidgetRule()
            alertSection
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    // MARK: - Pieces

    private func header(_ reading: ChartCache.CachedReading) -> some View {
        WidgetHeader(
            // The small size has no room for the day beside the slot.
            eyebrow: family == .systemSmall ? reading.slotLabel : "\(reading.slotLabel) · \(reading.dayLabel)",
            dot: snapshot.alert.map { AlertTone.color(for: $0.severity) }
        )
    }

    private func footer(_ reading: ChartCache.CachedReading) -> some View {
        Text(snapshot.needsSignIn ? "Open to refresh" : (snapshot.alert == nil ? "Tap to read" : alertCountLabel))
            .font(.brutMono(10))
            .foregroundStyle(snapshot.alert.map { AlertTone.color(for: $0.severity) } ?? Theme.muted)
            .lineLimit(1)
    }

    private var alertCountLabel: String {
        snapshot.unreadCount == 1 ? "1 alert" : "\(snapshot.unreadCount) alerts"
    }

    /// One line, linking straight to the alert.
    @ViewBuilder
    private func alertLine(_ alert: ChartCache.CachedAlert) -> some View {
        let line = HStack(spacing: 8) {
            Circle()
                .fill(AlertTone.color(for: alert.severity))
                .frame(width: 6, height: 6)
            Text(alert.title)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Theme.fg)
                .lineLimit(1)
            Spacer(minLength: 4)
            WidgetEyebrow(text: AlertTone.label(for: alert.severity), color: AlertTone.color(for: alert.severity))
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(AlertTone.label(for: alert.severity)) alert: \(alert.title)")

        if let url = WidgetLink.alert(alert.id) {
            Link(destination: url) { line }
        } else {
            line
        }
    }

    @ViewBuilder
    private var alertSection: some View {
        if let alert = snapshot.alert {
            let tone = AlertTone.color(for: alert.severity)
            let section = VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 6) {
                    Circle().fill(tone).frame(width: 6, height: 6)
                    WidgetEyebrow(text: "Alert · \(AlertTone.label(for: alert.severity))", color: tone)
                    Spacer(minLength: 4)
                    Text(WidgetTime.ago(alert.createdAt, now: entry.date))
                        .font(.brutMono(10))
                        .foregroundStyle(Theme.muted)
                }
                WidgetDisplay(text: alert.title, size: 18, lines: 2)
                Text(alert.body)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.muted)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)

            if let url = WidgetLink.alert(alert.id) {
                Link(destination: url) { section }
            } else {
                section
            }
        } else {
            HStack(spacing: 6) {
                WidgetEyebrow(text: "Alerts")
                Spacer(minLength: 4)
                Text(snapshot.alerts == nil ? "Not loaded yet" : "All clear")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Theme.fg.opacity(0.8))
            }
        }
    }
}

struct ReadingWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: WidgetRefresh.Kind.reading, provider: ReadingProvider()) { entry in
            ReadingWidgetView(entry: entry)
        }
        .configurationDisplayName("Today's reading")
        .description("The reading Astrya wrote for you this morning or tonight, and any new alert.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular])
    }
}
