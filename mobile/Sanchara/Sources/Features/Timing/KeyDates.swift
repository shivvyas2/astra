import EventKit
import SwiftUI

/// One dated window from the timing engine (lib/timing/engine.ts): a sign
/// change, a station, or a sub-period, read against the user's chart.
struct TimingEvent: Identifiable, Hashable, Decodable {
    enum Tone: String, Decodable { case supportive, challenging, mixed }
    enum Kind: String, Decodable { case ingress, station, dasha }

    let id: String
    let date: String
    let end: String?
    let kind: Kind
    let body: String
    let title: String
    let detail: String
    let topics: [String]
    let tone: Tone

    private enum CodingKeys: String, CodingKey { case id, date, end, kind, body, title, detail, topics, tone }

    init(id: String, date: String, end: String?, kind: Kind, body: String, title: String, detail: String, topics: [String], tone: Tone) {
        (self.id, self.date, self.end, self.kind, self.body, self.title, self.detail, self.topics, self.tone) =
            (id, date, end, kind, body, title, detail, topics, tone)
    }

    /// Unknown kinds and tones read as a plain transit, so a server ahead of the app still lists.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        date = try c.decode(String.self, forKey: .date)
        end = try c.decodeIfPresent(String.self, forKey: .end)
        kind = Kind(rawValue: try c.decodeIfPresent(String.self, forKey: .kind) ?? "") ?? .ingress
        body = try c.decodeIfPresent(String.self, forKey: .body) ?? ""
        title = try c.decode(String.self, forKey: .title)
        detail = try c.decodeIfPresent(String.self, forKey: .detail) ?? ""
        topics = try c.decodeIfPresent([String].self, forKey: .topics) ?? []
        tone = Tone(rawValue: try c.decodeIfPresent(String.self, forKey: .tone) ?? "") ?? .mixed
    }

    var day: Date? { KeyDates.isoDay.date(from: date) }
}

struct TimingPayload: Decodable {
    let today: String
    let horizonEnd: String
    let events: [TimingEvent]
}

enum KeyDates {
    static let isoDay: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    /// Events grouped by month, in date order: ("2026-10", [...]).
    static func byMonth(_ events: [TimingEvent]) -> [(month: String, events: [TimingEvent])] {
        var order: [String] = []
        var groups: [String: [TimingEvent]] = [:]
        for e in events.sorted(by: { $0.date < $1.date }) {
            let m = String(e.date.prefix(7))
            if groups[m] == nil { order.append(m) }
            groups[m, default: []].append(e)
        }
        return order.map { ($0, groups[$0]!) }
    }

    static func monthTitle(_ month: String) -> String {
        guard let d = isoDay.date(from: month + "-01") else { return month }
        let f = DateFormatter()
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "LLLL yyyy"
        return f.string(from: d)
    }

    static func dayNumber(_ iso: String) -> String { String(iso.suffix(2)) }

    /// Writes the dates to the user's calendar as all-day events on the day
    /// each window opens. Write-only access: Astrya never reads the calendar.
    /// Returns how many were added; ones already added (same title and day) are skipped.
    static func addToCalendar(_ events: [TimingEvent]) async throws -> Int {
        let store = EKEventStore()
        guard try await store.requestWriteOnlyAccessToEvents() else { throw CalendarError.denied }
        var added = 0
        var seen = UserDefaults.standard.stringArray(forKey: addedKey) ?? []
        for e in events where !seen.contains(e.id) {
            guard let start = e.day else { continue }
            let event = EKEvent(eventStore: store)
            event.title = e.title
            event.notes = e.detail + (e.end.map { " Window closes \($0)." } ?? "") + " Computed by Astrya from your chart."
            event.isAllDay = true
            event.startDate = start
            event.endDate = start
            event.availability = .free
            event.calendar = store.defaultCalendarForNewEvents
            try store.save(event, span: .thisEvent, commit: false)
            seen.append(e.id)
            added += 1
        }
        try store.commit()
        UserDefaults.standard.set(seen, forKey: addedKey)
        return added
    }

    /// Ids already written, so tapping again adds only what is new.
    static let addedKey = "sanchara.keyDatesAdded"

    enum CalendarError: LocalizedError {
        case denied
        var errorDescription: String? { "Astrya needs permission to add events. Turn it on in Settings, Astrya, Calendars." }
    }
}

/// Key dates: the year ahead to the day, from the timing engine. Opened from
/// the Life tab. The web draws the same list (components/KeyDates.tsx).
struct KeyDatesView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var events: [TimingEvent] = []
    @State private var state: LoadState = .loading
    @State private var notice: String?
    @State private var adding = false

    enum LoadState: Equatable { case loading, ready, failed(String) }

    var body: some View {
        NavigationStack {
            ZStack {
                Atmosphere(mood: .violet)
                ScrollView {
                    VStack(alignment: .leading, spacing: 28) {
                        ScreenHeader(
                            eyebrow: "Key dates",
                            title: "The year ahead, to the day",
                            blurb: "Every sign change, station and sub-period in the next twelve months, computed from the ephemeris and read against your chart. Readings quote these dates.",
                            trailingArrow: true
                        )
                        content
                    }
                    .padding(.horizontal, 24)
                    .padding(.vertical, 24)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") { dismiss() }
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(Theme.fg)
                }
            }
            .toolbarBackground(Theme.bg, for: .navigationBar)
        }
        .presentationBackground(Theme.bg)
        .task { await load() }
    }

    @ViewBuilder private var content: some View {
        switch state {
        case .loading:
            ProgressView().tint(Theme.muted).frame(maxWidth: .infinity).padding(.top, 24)
        case .failed(let message):
            VStack(alignment: .leading, spacing: 12) {
                BrutNotice(text: message)
                SancharaPrimaryButton(title: "Try again", kind: .secondary) { Task { await load() } }
            }
        case .ready:
            if events.isEmpty {
                BrutEmptyState(title: "A quiet year", message: "Nothing changes in your sky in the next twelve months.")
            } else {
                SancharaPrimaryButton(title: "Add to calendar", isLoading: adding, kind: .accent) {
                    Task { await addAll() }
                }
                if let notice { BrutNotice(text: notice, tone: .info) }
                if let next = events.first { nextCard(next) }
                CompareDatesSection()
                ForEach(KeyDates.byMonth(events), id: \.month) { group in
                    VStack(alignment: .leading, spacing: 0) {
                        Text(KeyDates.monthTitle(group.month)).eyebrow().padding(.bottom, 6)
                        BrutDivider()
                        ForEach(group.events) { row($0) }
                    }
                }
                Text("Supportive and challenging follow classical gochara, counted from your Moon. Computed, not predicted: a reading says what a date is likely to mean for you.")
                    .font(.brutBody(12))
                    .foregroundStyle(Theme.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func nextCard(_ e: TimingEvent) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Next").eyebrow()
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(KeyDates.dayNumber(e.date)).font(.brutNumeral(64)).foregroundStyle(Theme.accent)
                Text(KeyDates.monthTitle(String(e.date.prefix(7)))).font(.brutTitle(18)).foregroundStyle(Theme.fg)
            }
            Text(e.title).font(.brutTitle(20)).foregroundStyle(Theme.fg).fixedSize(horizontal: false, vertical: true)
            Text(e.detail).font(.brutBody(14)).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .brutCard()
    }

    private func row(_ e: TimingEvent) -> some View {
        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: 16) {
                Text(KeyDates.dayNumber(e.date))
                    .font(.brutNumeral(30))
                    .foregroundStyle(Theme.fg)
                    .frame(width: 44, alignment: .leading)
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 8) {
                        BrutTag(text: toneLabel(e.tone), fill: toneColor(e.tone), textColor: Theme.ink)
                        Text(kindLabel(e.kind)).eyebrow()
                    }
                    Text(e.title).font(.system(size: 15, weight: .semibold)).foregroundStyle(Theme.fg)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(e.detail).font(.brutBody(13)).foregroundStyle(Theme.muted)
                        .fixedSize(horizontal: false, vertical: true)
                    if !e.topics.isEmpty {
                        Text(e.topics.map { $0.capitalized }.joined(separator: " · "))
                            .font(.brutBody(12)).foregroundStyle(Theme.muted)
                    }
                }
            }
            .padding(.vertical, 14)
            BrutDivider()
        }
        .accessibilityElement(children: .combine)
    }

    private func toneLabel(_ t: TimingEvent.Tone) -> String {
        switch t { case .supportive: "Supportive"; case .challenging: "Challenging"; case .mixed: "Mixed" }
    }
    private func toneColor(_ t: TimingEvent.Tone) -> Color {
        switch t { case .supportive: Theme.accent; case .challenging: Theme.ember; case .mixed: Theme.fg.opacity(0.8) }
    }
    private func kindLabel(_ k: TimingEvent.Kind) -> String {
        switch k { case .ingress: "Transit"; case .station: "Station"; case .dasha: "Period" }
    }

    private func load() async {
        state = .loading
        do {
            events = try await SancharaAPI.timing().events
            state = .ready
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    private func addAll() async {
        adding = true
        defer { adding = false }
        do {
            let n = try await KeyDates.addToCalendar(events)
            notice = n == 0 ? "Your key dates are already in your calendar." : "Added \(n) dates to your calendar."
        } catch {
            notice = error.localizedDescription
        }
    }
}
