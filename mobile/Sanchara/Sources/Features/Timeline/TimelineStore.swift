import Foundation

/// One Vimshottari mahadasha, with its sub-periods.
struct DashaBand: Decodable, Identifiable, Hashable {
    let lord: String
    let start: String // ISO date
    let end: String
    let antardashas: [SubPeriod]
    let isCurrent: Bool
    let isPast: Bool
    let eventCount: Int

    struct SubPeriod: Decodable, Hashable {
        let lord: String
        let start: String
        let end: String
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
        guard let s = TimelineDate.parse(start),
              let e = TimelineDate.parse(end),
              let t = TimelineDate.parse(today) else { return 0 }
        let span = e.timeIntervalSince(s)
        guard span > 0 else { return 0 }
        return min(max(t.timeIntervalSince(s) / span, 0), 1)
    }
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
struct CandidateEvent: Decodable, Identifiable, Hashable {
    let occurredOn: String
    let precision: String
    let title: String

    var id: String { "\(occurredOn):\(title)" }

    var dateLabel: String {
        LifeEvent(
            id: id, occurredOn: occurredOn, precision: precision, title: title,
            note: nil, source: "extracted", mahadasha: nil, antardasha: nil
        ).dateLabel
    }
}

struct TimelinePayload: Decodable {
    let birthDate: String
    let today: String
    let periods: [DashaBand]
    let events: [LifeEvent]
    let scanned: Bool
}

/// Date handling for the timeline.
///
/// Everything crossing the API is a UTC calendar date with no time, so the
/// formatters are pinned to UTC. Parsing in the device's zone would slide a
/// morning event onto the previous day west of Greenwich.
enum TimelineDate {
    private static let utc = TimeZone(identifier: "UTC")!

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

    var state: State = .loading
    var periods: [DashaBand] = []
    var events: [LifeEvent] = []
    var today: String = ""
    var birthDate: String = ""
    /// True once we have mined the chat history, so the offer shows only once.
    var scanned = false

    var candidates: [CandidateEvent] = []
    var isScanning = false
    var isSaving = false

    /// The offer to seed the timeline is worth making only when there is
    /// nothing on it yet and we have not already looked.
    var canOfferScan: Bool { !scanned && events.isEmpty }

    var currentBand: DashaBand? { periods.first(where: \.isCurrent) }

    func eventsIn(_ band: DashaBand) -> [LifeEvent] {
        events.filter { $0.occurredOn >= band.start && $0.occurredOn < band.end }
    }

    func load() async {
        do {
            let payload = try await SancharaAPI.timeline()
            periods = payload.periods
            events = payload.events
            today = payload.today
            birthDate = payload.birthDate
            scanned = payload.scanned
            state = .ready
        } catch SancharaAPI.APIError.server(let message) where message.contains("birth details") {
            state = .needsProfile
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    /// Mines past conversations for moments. Nothing is saved until the user
    /// confirms — see `POST /api/timeline/scan`.
    func scan() async {
        isScanning = true
        defer { isScanning = false }
        do {
            candidates = try await SancharaAPI.scanLifeEvents()
            scanned = true
            // A scan that found nothing still counts as asked-and-answered, so
            // the offer does not reappear on the next open.
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    func confirm(_ chosen: [CandidateEvent]) async {
        guard !chosen.isEmpty else {
            candidates = []
            return
        }
        isSaving = true
        defer { isSaving = false }
        do {
            try await SancharaAPI.addLifeEvents(
                chosen.map {
                    NewLifeEvent(
                        occurredOn: $0.occurredOn, precision: $0.precision,
                        title: $0.title, note: nil, source: "extracted"
                    )
                }
            )
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
struct NewLifeEvent: Encodable {
    let occurredOn: String
    let precision: String
    let title: String
    let note: String?
    let source: String
}
