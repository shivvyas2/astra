import AppIntents
import CoreSpotlight
import Foundation

/// The things Siri, Shortcuts, and Spotlight are allowed to know about.
///
/// An `AppEntity` is the unit the whole App Intents surface trades in: it is
/// what an intent returns, what Siri offers as a follow-up, and — through
/// `IndexedEntity` — what Spotlight can find. Two are worth exposing here and
/// no more. A reading, because it is the thing people come back for. A
/// placement, because "where's my Saturn" is the question the app is asked most
/// and it has a single correct answer.
///
/// Nothing interpretive is an entity. A prediction is not a record and should
/// not be searchable as though it were one.

// MARK: - A reading

@available(iOS 18.0, *)
struct DailyReadingEntity: AppEntity, IndexedEntity, Identifiable {
    let id: String
    let title: String
    let body: String
    let slot: String
    let forDate: String

    static var typeDisplayRepresentation: TypeDisplayRepresentation {
        TypeDisplayRepresentation(name: "Reading", numericFormat: "\(placeholder: .int) readings")
    }

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(
            title: "\(title)",
            subtitle: "\(slotLabel) · \(prettyDate)",
            image: .init(systemName: "moon.stars")
        )
    }

    /// What Spotlight indexes. The body goes in `contentDescription` so a
    /// half-remembered phrase from a reading finds it again, which is the only
    /// reason to index these at all.
    var attributeSet: CSSearchableItemAttributeSet {
        let set = defaultAttributeSet
        set.title = title
        set.contentDescription = body
        set.displayName = title
        set.keywords = ["kundli", "reading", "sanchara", slotLabel.lowercased()]
        return set
    }

    var slotLabel: String { slot == "morning" ? "Morning" : "Night" }

    var prettyDate: String {
        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.dateFormat = "yyyy-MM-dd"
        guard let day = parser.date(from: forDate) else { return forDate }
        if Calendar.current.isDateInToday(day) { return "Today" }
        if Calendar.current.isDateInYesterday(day) { return "Yesterday" }
        let pretty = DateFormatter()
        pretty.dateStyle = .medium
        return pretty.string(from: day)
    }

    static var defaultQuery = DailyReadingQuery()
}

@available(iOS 18.0, *)
struct DailyReadingQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [DailyReadingEntity] {
        let all = await IntentData.recentReadings()
        return all.filter { identifiers.contains($0.id) }
    }

    /// What Shortcuts offers in a picker, and what Siri can disambiguate
    /// against. Today's two readings are almost always what is meant.
    func suggestedEntities() async throws -> [DailyReadingEntity] {
        Array(await IntentData.recentReadings().prefix(8))
    }
}

// MARK: - A placement

/// One body's position. The nine of these are fixed at birth, so unlike a
/// reading they never go stale and never need the network.
@available(iOS 18.0, *)
struct PlacementEntity: AppEntity, IndexedEntity, Identifiable {
    let id: String
    let planet: String
    let sign: String
    let sanskritSign: String
    let house: Int
    let degree: String
    let nakshatra: String?
    let retrograde: Bool

    static var typeDisplayRepresentation: TypeDisplayRepresentation {
        TypeDisplayRepresentation(name: "Placement", numericFormat: "\(placeholder: .int) placements")
    }

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(
            title: "\(planet) in \(sanskritSign)",
            subtitle: "\(degree) · house \(house)\(retrograde ? " · retrograde" : "")",
            image: .init(systemName: "circle.hexagongrid")
        )
    }

    var attributeSet: CSSearchableItemAttributeSet {
        let set = defaultAttributeSet
        set.title = "\(planet) in \(sanskritSign)"
        set.contentDescription = spoken
        set.keywords = [planet, sign, sanskritSign, "kundli", "chart", "house \(house)"]
        return set
    }

    /// The sentence Siri reads back.
    var spoken: String {
        var line = "\(planet) is in \(sanskritSign), \(sign), at \(degree), in house \(house)"
        if let nakshatra { line += ", nakshatra \(nakshatra)" }
        if retrograde { line += ". It is retrograde" }
        return line + "."
    }

    init(_ planet: ChartPlanet) {
        id = planet.name
        self.planet = planet.name
        sign = planet.sign
        sanskritSign = Rashi(english: planet.sign)?.sanskrit ?? planet.sign
        house = planet.house
        degree = planet.degreeText
        nakshatra = planet.nakshatra
        retrograde = planet.retrograde
    }

    static var defaultQuery = PlacementQuery()
}

@available(iOS 18.0, *)
struct PlacementQuery: EntityStringQuery {
    func entities(for identifiers: [String]) async throws -> [PlacementEntity] {
        allPlacements().filter { identifiers.contains($0.id) }
    }

    /// Lets someone say "Saturn" rather than pick from a list.
    func entities(matching string: String) async throws -> [PlacementEntity] {
        let wanted = string.lowercased()
        return allPlacements().filter {
            $0.planet.lowercased().contains(wanted) || $0.sanskritSign.lowercased().contains(wanted)
        }
    }

    func suggestedEntities() async throws -> [PlacementEntity] { allPlacements() }

    private func allPlacements() -> [PlacementEntity] {
        (ChartCache.shared.load()?.planets ?? []).map(PlacementEntity.init)
    }
}
