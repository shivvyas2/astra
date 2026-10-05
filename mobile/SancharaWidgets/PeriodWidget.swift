import SwiftUI
import WidgetKit

/// The dasha period the user is in, on the Home and Lock Screens.
///
/// It does not fetch: the app writes the current period and its one-line theme
/// to the app group after every timeline load (and on each background
/// refresh), and this only reads. The dates alone are also in the cached chart, so the widget can
/// draw a period before the server has written a meaning for it — the theme is
/// the part that arrives later, and the layout leaves room for it either way.
///
/// A mahadasha is years long, so the content changes on its own about once a
/// year. The provider still asks to be rebuilt after midnight, because the
/// progress bar should move by a day when a day has passed.
struct PeriodProvider: TimelineProvider {
    func placeholder(in context: Context) -> PeriodEntry {
        PeriodEntry(date: Date(), period: .preview)
    }

    func getSnapshot(in context: Context, completion: @escaping (PeriodEntry) -> Void) {
        completion(PeriodEntry(date: Date(), period: current()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<PeriodEntry>) -> Void) {
        let entry = PeriodEntry(date: Date(), period: current())
        completion(Timeline(entries: [entry], policy: .after(Self.nextMidnight())))
    }

    private func current() -> PeriodEntry.Period? {
        let today = Self.todayISO()
        if let cached = ChartCache.shared.loadPeriod() {
            return PeriodEntry.Period(
                lord: cached.lord,
                antardasha: cached.antardasha,
                startYear: String(cached.start.prefix(4)),
                endYear: String(cached.end.prefix(4)),
                progress: PeriodProgress.fraction(start: cached.start, end: cached.end, today: today),
                yearsLeft: PeriodProgress.yearsRemaining(end: cached.end, today: today),
                theme: cached.theme
            )
        }
        // No timeline fetched yet, but the chart carries the same pair. Shown
        // without a theme rather than as an empty state — the dates are true.
        if let dasha = ChartCache.shared.load()?.dasha {
            return PeriodEntry.Period(
                lord: dasha.mahadasha,
                antardasha: dasha.antardasha,
                startYear: String(dasha.mahadashaStart.prefix(4)),
                endYear: String(dasha.mahadashaEnd.prefix(4)),
                progress: PeriodProgress.fraction(start: dasha.mahadashaStart, end: dasha.mahadashaEnd, today: today),
                yearsLeft: PeriodProgress.yearsRemaining(end: dasha.mahadashaEnd, today: today),
                theme: nil
            )
        }
        return nil
    }

    /// Today as the API writes dates: a UTC calendar day. The bar cannot be
    /// wrong by more than a day either way, and the API's convention wins.
    private static func todayISO() -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: Date())
    }

    static func nextMidnight() -> Date {
        let calendar = Calendar.current
        let start = calendar.startOfDay(for: Date())
        return calendar.date(byAdding: .day, value: 1, to: start) ?? Date().addingTimeInterval(86_400)
    }
}

struct PeriodEntry: TimelineEntry {
    struct Period {
        let lord: String
        let antardasha: String
        let startYear: String
        let endYear: String
        let progress: Double
        let yearsLeft: Int
        let theme: String?

        var pairLabel: String { "\(lord) – \(antardasha)" }
        var yearsLabel: String { "\(startYear) – \(endYear)" }
        var leftLabel: String {
            yearsLeft == 1 ? "1 year left" : "\(yearsLeft) years left"
        }

        static let preview = Period(
            lord: "Saturn", antardasha: "Mercury",
            startYear: "2019", endYear: "2038",
            progress: 0.38, yearsLeft: 12,
            theme: "Building slowly, then being tested"
        )
    }

    let date: Date
    let period: Period?
}

struct PeriodWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: PeriodEntry

    var body: some View {
        Group {
            if let period = entry.period {
                switch family {
                case .accessoryInline:
                    // One line, tinted by the system. The pair is the fact
                    // worth a glance at the top of the Lock Screen.
                    Text("\(period.pairLabel) · \(period.leftLabel)")
                case .accessoryRectangular:
                    VStack(alignment: .leading, spacing: 2) {
                        Text("YOUR PERIOD")
                            .font(.system(size: 10, weight: .semibold))
                            .widgetAccentable()
                        Text(period.pairLabel)
                            .font(.system(size: 13, weight: .medium))
                        ProgressView(value: period.progress)
                            .progressViewStyle(.linear)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                case .systemSmall:
                    small(period)
                default:
                    medium(period)
                }
            } else if family.isAccessory {
                Text("Astrya")
            } else {
                WidgetEmpty(
                    eyebrow: "Your period",
                    headline: "Your periods",
                    message: "Open Astrya to map the chapters of your life."
                )
            }
        }
        .widgetURL(WidgetLink.timeline)
        .containerBackground(for: .widget) {
            if family.isAccessory {
                Color.clear
            } else {
                WidgetGround(tint: Theme.violet)
            }
        }
    }

    /// The lord, very large; the sub-period beneath; how far through.
    private func small(_ period: PeriodEntry.Period) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            WidgetHeader(eyebrow: "Your period")
            Spacer(minLength: 0)
            WidgetDisplay(text: period.lord, size: 32, lines: 1)
            Text(period.antardasha.isEmpty ? period.yearsLabel : "with \(period.antardasha)")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Theme.muted)
                .lineLimit(1)
            WidgetProgress(value: period.progress)
                .padding(.top, 4)
            Text(period.leftLabel)
                .font(.brutMono(10))
                .foregroundStyle(Theme.muted)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibility(period))
    }

    private func medium(_ period: PeriodEntry.Period) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            WidgetHeader(eyebrow: "Your period · \(period.yearsLabel)")
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(period.lord)
                    .font(.system(size: 30, weight: .medium))
                    .tracking(-30 * 0.035)
                    .foregroundStyle(Theme.fg)
                    .lineLimit(1)
                Text(period.antardasha.isEmpty ? "" : "with \(period.antardasha)")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
            }
            .minimumScaleFactor(0.8)
            if let theme = period.theme {
                Text(theme)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.fg.opacity(0.78))
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
            WidgetProgress(value: period.progress)
            HStack {
                Text("\(Int((period.progress * 100).rounded()))% through")
                Spacer(minLength: 4)
                Text(period.leftLabel)
            }
            .font(.brutMono(10))
            .foregroundStyle(Theme.muted)
            .lineLimit(1)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibility(period))
    }

    private func accessibility(_ period: PeriodEntry.Period) -> String {
        "\(period.pairLabel), \(period.yearsLabel), \(Int(period.progress * 100)) percent through. \(period.theme ?? "")"
    }
}

struct PeriodWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: WidgetRefresh.Kind.period, provider: PeriodProvider()) { entry in
            PeriodWidgetView(entry: entry)
        }
        .configurationDisplayName("Your period")
        .description("The chapter of your life you are in now, and how far through it you are.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline])
    }
}
