import AppIntents
import SwiftUI
import WidgetKit

/// Today's reading, on the Home and Lock Screens.
///
/// The widget never fetches. It reads the app group cache the app writes after
/// every successful load, which is what makes it instant and what lets it work
/// with no signal — and it is the reason `ChartCache` exists at all. A widget
/// that waits on a network call to draw is a widget that shows a placeholder at
/// exactly the moment someone glanced at it.
///
/// The refresh cadence is set by the content, not by a timer: readings are
/// written morning and night, so the timeline holds one entry and asks to be
/// rebuilt at the next boundary.
struct ReadingProvider: TimelineProvider {
    func placeholder(in context: Context) -> ReadingEntry {
        ReadingEntry(date: Date(), reading: .preview)
    }

    func getSnapshot(in context: Context, completion: @escaping (ReadingEntry) -> Void) {
        completion(ReadingEntry(date: Date(), reading: current()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ReadingEntry>) -> Void) {
        let entry = ReadingEntry(date: Date(), reading: current())
        completion(Timeline(entries: [entry], policy: .after(Self.nextBoundary())))
    }

    private func current() -> ReadingEntry.Reading? {
        guard let cached = ChartCache.shared.loadReading() else { return nil }
        return ReadingEntry.Reading(
            eyebrow: (cached.slot == "morning" ? "Morning" : "Night"),
            title: cached.title,
            body: cached.body
        )
    }

    /// The next 6am or 6pm. Asking to refresh twice a day, rather than every
    /// fifteen minutes, is what keeps the widget inside its energy budget while
    /// still being right whenever anyone looks.
    static func nextBoundary() -> Date {
        let calendar = Calendar.current
        let now = Date()
        for hour in [6, 18] {
            if let candidate = calendar.date(bySettingHour: hour, minute: 0, second: 0, of: now),
               candidate > now {
                return candidate
            }
        }
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: now) ?? now.addingTimeInterval(86_400)
        return calendar.date(bySettingHour: 6, minute: 0, second: 0, of: tomorrow)
            ?? now.addingTimeInterval(43_200)
    }
}

struct ReadingEntry: TimelineEntry {
    struct Reading {
        let eyebrow: String
        let title: String
        let body: String

        static let preview = Reading(
            eyebrow: "Morning",
            title: "A steady start",
            body: "The Moon holds your fourth house today — the day rewards finishing what is already open rather than beginning something new."
        )
    }

    let date: Date
    let reading: Reading?
}

struct ReadingWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: ReadingEntry

    var body: some View {
        Group {
            if let reading = entry.reading {
                switch family {
                case .accessoryRectangular:
                    // The Lock Screen tints everything to one colour, so the
                    // card's palette would be thrown away here. Two lines of
                    // hierarchy is all this family can carry.
                    VStack(alignment: .leading, spacing: 2) {
                        Text(reading.eyebrow.uppercased())
                            .font(.system(size: 10, weight: .semibold))
                            .widgetAccentable()
                        Text(reading.title)
                            .font(.system(size: 13, weight: .medium))
                            .lineLimit(2)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                default:
                    ReadingCard(
                        eyebrow: reading.eyebrow,
                        title: reading.title,
                        text: reading.body,
                        bodyLineLimit: family == .systemSmall ? 3 : 5
                    )
                }
            } else {
                empty
            }
        }
        .containerBackground(for: .widget) {
            family == .accessoryRectangular ? AnyView(Color.clear) : AnyView(Theme.bg)
        }
    }

    /// `loading.md` and `writing.md`: an empty state names the next action
    /// instead of apologising for having nothing.
    private var empty: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("SANCHARA")
                .font(.system(size: 10, weight: .regular))
                .tracking(2)
                .foregroundStyle(Theme.muted)
            Text("Open Sanchara to get your first reading.")
                .font(.system(size: 13))
                .foregroundStyle(Theme.fg)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct ReadingWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "SancharaReading", provider: ReadingProvider()) { entry in
            ReadingWidgetView(entry: entry)
        }
        .configurationDisplayName("Today's reading")
        .description("The reading Sanchara wrote for you this morning or tonight.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}
