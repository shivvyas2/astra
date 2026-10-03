import Foundation

/// One Vimshottari mahadasha, with its sub-periods.
struct DashaBand: Identifiable, Hashable {
    let lord: String
    let start: String // ISO date
    let end: String
    let antardashas: [SubPeriod]
    let isCurrent: Bool
    let isPast: Bool
    let eventCount: Int
    /// One line in plain words, written by the server for this user. Nil until
    /// the explain call has run — the band still draws without it.
    let theme: String?
    /// A short paragraph on what this chapter is (or was) about.
    let meaning: String?
    /// True when the meaning was written before the moments in this period
    /// changed, so it is shown but is about to be replaced.
    let stale: Bool

    struct SubPeriod: Decodable, Hashable {
        let lord: String
        let start: String
        let end: String
    }

    init(
        lord: String, start: String, end: String, antardashas: [SubPeriod],
        isCurrent: Bool, isPast: Bool, eventCount: Int,
        theme: String? = nil, meaning: String? = nil, stale: Bool = false
    ) {
        self.lord = lord
        self.start = start
        self.end = end
        self.antardashas = antardashas
        self.isCurrent = isCurrent
        self.isPast = isPast
        self.eventCount = eventCount
        self.theme = theme
        self.meaning = meaning
        self.stale = stale
    }

    var id: String { "\(lord)-\(start)" }

    var startYear: String { String(start.prefix(4)) }
    var endYear: String { String(end.prefix(4)) }

    /// Whole years, rounded — the label is "20 years", never "19.98".
    var years: Int {
        guard let s = TimelineDate.parse(start), let e = TimelineDate.parse(end) else { return 0 }
        return Int((e.timeIntervalSince(s) / (365.25 * 86_400)).rounded())
    }

    /// How far through this period we are, 0–1. Only meaningful when current.
    func progress(today: String) -> Double {
        PeriodProgress.fraction(start: start, end: end, today: today)
    }
}

extension DashaBand: Decodable {
    private enum CodingKeys: String, CodingKey {
        case lord, start, end, antardashas, isCurrent, isPast, eventCount, theme, meaning, stale
    }

    /// Tolerant of a server that has not yet learned the explain fields, so an
    /// app update and an API deploy need not land in the same minute.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            lord: try c.decode(String.self, forKey: .lord),
            start: try c.decode(String.self, forKey: .start),
            end: try c.decode(String.self, forKey: .end),
            antardashas: try c.decode([SubPeriod].self, forKey: .antardashas),
            isCurrent: try c.decode(Bool.self, forKey: .isCurrent),
            isPast: try c.decode(Bool.self, forKey: .isPast),
            eventCount: try c.decode(Int.self, forKey: .eventCount),
            theme: try c.decodeIfPresent(String.self, forKey: .theme),
            meaning: try c.decodeIfPresent(String.self, forKey: .meaning),
            stale: try c.decodeIfPresent(Bool.self, forKey: .stale) ?? false
        )
    }
}

/// The mahadasha–antardasha pair running today, with the server's summary of
/// what it means for this person.
struct NowPeriod: Decodable, Hashable {
    let lord: String
    let antardasha: String
    let start: String
    let end: String
    let theme: String?
    let meaning: String?

    var pairLabel: String { "\(lord) – \(antardasha)" }
}

/// A moment the user pinned, placed in the period it fell in.
struct LifeEvent: Decodable, Identifiable, Hashable {
    let id: String
    let occurredOn: String
    let precision: String
    let title: String
    let note: String?
    let source: String
    let mahadasha: String?
    let antardasha: String?

    /// The dasha pair running when it happened — the line that does the work.
    var duringLabel: String? {
        guard let maha = mahadasha else { return nil }
        guard let antar = antardasha else { return "during \(maha)" }
        return "during \(maha)–\(antar)"
    }

    /// Rendered to the precision the user actually gave us, so a year-precision
    /// memory never claims a day it does not have.
    var dateLabel: String {
        guard let date = TimelineDate.parse(occurredOn) else { return occurredOn }
        switch precision {
        case "year": return TimelineDate.year.string(from: date)
        case "month": return TimelineDate.month.string(from: date)
        default: return TimelineDate.day.string(from: date)
        }
    }
}

/// A moment proposed from the user's own chat history, awaiting confirmation.
struct CandidateEvent: Identifiable, Hashable {
    /// Nil when the event was clear but could not be dated even to a year;
    /// the user supplies the year before it can be pinned.
    let occurredOn: String?
    let precision: String
    let title: String
    /// The user's own words the moment was read from, so they can check it.
    let evidence: String

    init(occurredOn: String?, precision: String, title: String, evidence: String = "") {
        self.occurredOn = occurredOn
        self.precision = precision
        self.title = title
        self.evidence = evidence
    }

    var id: String { "\(occurredOn ?? "?"):\(title)" }

    var isUndated: Bool { occurredOn == nil }

    /// Nil for an undated candidate — the row shows a year picker instead.
    var dateLabel: String? {
        guard let occurredOn else { return nil }
        return LifeEvent(
            id: id, occurredOn: occurredOn, precision: precision, title: title,
            note: nil, source: "extracted", mahadasha: nil, antardasha: nil
        ).dateLabel
    }
}

extension CandidateEvent: Decodable {
    private enum CodingKeys: String, CodingKey { case occurredOn, precision, title, evidence }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            occurredOn: try c.decodeIfPresent(String.self, forKey: .occurredOn),
            precision: try c.decode(String.self, forKey: .precision),
            title: try c.decode(String.self, forKey: .title),
            evidence: try c.decodeIfPresent(String.self, forKey: .evidence) ?? ""
        )
    }
}

/// Turns a confirmed candidate into what the server accepts.
///
/// Pure, so the rule that an undated moment needs a year — and becomes a
/// year-precision moment on January 1st, exactly as `AddMomentView` would store
/// it — is tested rather than trusted.
enum CandidateResolver {
    /// The year range an undated moment may be placed in: from birth to now.
    static func yearRange(birthDate: String, today: String) -> ClosedRange<Int> {
        let birth = Int(birthDate.prefix(4)) ?? 1900
        let now = Int(today.prefix(4)) ?? birth
        return birth <= now ? birth...now : now...now
    }

    /// Nil when the candidate cannot be pinned yet.
    static func resolve(_ candidate: CandidateEvent, year: Int?) -> NewLifeEvent? {
        if let occurredOn = candidate.occurredOn {
            return NewLifeEvent(
                occurredOn: occurredOn, precision: candidate.precision,
                title: candidate.title, note: nil, source: "extracted"
            )
        }
        guard let year else { return nil }
        return NewLifeEvent(
            occurredOn: String(format: "%04d-01-01", year), precision: "year",
            title: candidate.title, note: nil, source: "extracted"
        )
    }

    /// Whether the add button should be live: something is chosen, and every
    /// chosen undated moment has been given a year.
    static func canAdd(chosen: [CandidateEvent], years: [String: Int]) -> Bool {
        !chosen.isEmpty && chosen.allSatisfy { !$0.isUndated || years[$0.id] != nil }
    }
}

struct TimelinePayload: Decodable {
    let birthDate: String
    let today: String
    let periods: [DashaBand]
    let events: [LifeEvent]
    let scanned: Bool
    let now: NowPeriod?
    let needsExplaining: Bool
    let messagesSinceScan: Int

    private enum CodingKeys: String, CodingKey {
        case birthDate, today, periods, events, scanned, now, needsExplaining, messagesSinceScan
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        birthDate = try c.decode(String.self, forKey: .birthDate)
        today = try c.decode(String.self, forKey: .today)
        periods = try c.decode([DashaBand].self, forKey: .periods)
        events = try c.decode([LifeEvent].self, forKey: .events)
        scanned = try c.decodeIfPresent(Bool.self, forKey: .scanned) ?? false
        now = try c.decodeIfPresent(NowPeriod.self, forKey: .now)
        needsExplaining = try c.decodeIfPresent(Bool.self, forKey: .needsExplaining) ?? false
        messagesSinceScan = try c.decodeIfPresent(Int.self, forKey: .messagesSinceScan) ?? 0
    }
}

/// Date handling for the timeline.
///
/// Everything crossing the API is a UTC calendar date with no time, so the
/// formatters are pinned to UTC. Parsing in the device's zone would slide a
/// morning event onto the previous day west of Greenwich.
enum TimelineDate {
    private static let utc = TimeZone(secondsFromGMT: 0) ?? .current

    private static let iso: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = utc
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func parse(_ value: String) -> Date? { iso.date(from: value) }
    static func format(_ date: Date) -> String { iso.string(from: date) }

    private static func display(_ format: String) -> DateFormatter {
        let f = DateFormatter()
        f.timeZone = utc
        f.setLocalizedDateFormatFromTemplate(format)
        return f
    }

    static let day = display("dMMMy")
    static let month = display("MMMy")
    static let year = display("y")
}

@Observable
@MainActor
final class TimelineStore {
    enum State: Equatable {
        case loading
        case ready
        case needsProfile
        case failed(String)
    }

    /// How many new messages make a re-scan worth offering. Fewer and the scan
    /// mostly finds nothing; the offer would become noise.
    static let rescanThreshold = 10

    var state: State = .loading
    var periods: [DashaBand] = []
    var events: [LifeEvent] = []
    var now: NowPeriod?
    var today: String = ""
    var birthDate: String = ""
    /// True once we have mined the chat history at least once.
    var scanned = false
    /// User messages written since the last scan.
    var messagesSinceScan = 0
    /// True while the server is writing meanings in the background.
    var isExplaining = false

    var candidates: [CandidateEvent] = []
    var isScanning = false
    var isSaving = false

    /// The offer to mine conversations: once before any scan, and again only
    /// after the user has said enough new things for it to find something.
    var canOfferScan: Bool { !scanned || messagesSinceScan >= Self.rescanThreshold }

    /// Whether this is a re-scan, which changes the copy on the offer.
    var isRescan: Bool { scanned }

    var currentBand: DashaBand? { periods.first(where: \.isCurrent) }

    func eventsIn(_ band: DashaBand) -> [LifeEvent] {
        events.filter { $0.occurredOn >= band.start && $0.occurredOn < band.end }
    }

    func load() async {
        do {
            let payload = try await SancharaAPI.timeline()
            apply(payload)
            state = .ready
            if payload.needsExplaining { Task { await explain() } }
        } catch SancharaAPI.APIError.server(let message) where message.contains("birth details") {
            state = .needsProfile
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    /// Asks the server to write (or rewrite) the meanings. The bands are
    /// already on screen; this fills them in when it returns. A failure is
    /// silent — the timeline without meanings is still the timeline.
    func explain() async {
        guard !isExplaining else { return }
        isExplaining = true
        defer { isExplaining = false }
        if let payload = try? await SancharaAPI.explainTimeline() {
            apply(payload)
        }
    }

    private func apply(_ payload: TimelinePayload) {
        periods = payload.periods
        events = payload.events
        now = payload.now
        today = payload.today
        birthDate = payload.birthDate
        scanned = payload.scanned
        messagesSinceScan = payload.messagesSinceScan
        Self.cache(payload)
    }

    /// Fetches the timeline for the widget's sake, without a screen to show it
    /// on. Called once per launch; any failure is the widget's empty state.
    static func warmCache() async {
        guard let payload = try? await SancharaAPI.timeline() else { return }
        cache(payload)
    }

    /// What the current-period widget draws from. Written whenever a fresh
    /// timeline arrives, so a meaning generated in the background reaches the
    /// Home Screen on its next refresh.
    private static func cache(_ payload: TimelinePayload) {
        guard let band = payload.periods.first(where: \.isCurrent) else { return }
        let sub = band.antardashas.first { $0.start <= payload.today && payload.today < $0.end }
        ChartCache.shared.save(period: ChartCache.CachedPeriod(
            lord: band.lord,
            antardasha: sub?.lord ?? payload.now?.antardasha ?? "",
            start: band.start,
            end: band.end,
            antardashaStart: sub?.start ?? payload.now?.start ?? band.start,
            antardashaEnd: sub?.end ?? payload.now?.end ?? band.end,
            theme: band.theme,
            nowMeaning: payload.now?.meaning,
            savedAt: Date()
        ))
        WidgetRefresh.reloadPeriod()
    }

    /// Mines past conversations for moments. Nothing is saved until the user
    /// confirms — see `POST /api/timeline/scan`.
    func scan() async {
        isScanning = true
        defer { isScanning = false }
        do {
            candidates = try await SancharaAPI.scanLifeEvents()
            scanned = true
            messagesSinceScan = 0
            // A scan that found nothing still counts as asked-and-answered, so
            // the offer does not reappear on the next open.
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    /// Pins the chosen candidates. `years` supplies the year for any undated
    /// one; a chosen undated candidate without a year is skipped, which the
    /// confirmation screen prevents by keeping its button disabled.
    func confirm(_ chosen: [CandidateEvent], years: [String: Int] = [:]) async {
        let events = chosen.compactMap { CandidateResolver.resolve($0, year: years[$0.id]) }
        guard !events.isEmpty else {
            candidates = []
            return
        }
        isSaving = true
        defer { isSaving = false }
        do {
            try await SancharaAPI.addLifeEvents(events)
            candidates = []
            await load()
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    func add(_ event: NewLifeEvent) async {
        isSaving = true
        defer { isSaving = false }
        do {
            try await SancharaAPI.addLifeEvents([event])
            await load()
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    func remove(_ event: LifeEvent) async {
        // Optimistic: the row disappears under the user's finger, and a failed
        // delete is corrected by the reload.
        events.removeAll { $0.id == event.id }
        do {
            try await SancharaAPI.deleteLifeEvent(id: event.id)
        } catch {
            // Fall through to the reload, which restores it if it survived.
        }
        await load()
    }
}

/// A moment on its way to the server.
struct NewLifeEvent: Encodable, Equatable {
    let occurredOn: String
    let precision: String
    let title: String
    let note: String?
    let source: String
}
