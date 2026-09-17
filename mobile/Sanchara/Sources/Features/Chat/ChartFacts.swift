import Foundation

/// The chart, restated as flat records.
///
/// This type exists to keep one job separate from the model that consumes it:
/// turning positions into sentences. It has no dependency on FoundationModels,
/// so it is testable on any machine, and the on-device tool is reduced to a
/// lookup over these strings.
///
/// The wording is deliberately bare. Every sentence here is handed to Apple's
/// on-device model, which refuses anything it reads as fortune telling — a
/// result found by testing, recorded in `OnDeviceSuggestions.swift`, and the
/// reason nothing below names a tradition, a practice, or a meaning. These are
/// positions; the reading is written elsewhere.
struct ChartFacts: Sendable {
    let chart: NatalChart

    /// The nine entries the table can be asked about, lower-cased for matching.
    static let bodyNames = [
        "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Rahu", "Ketu",
    ]

    /// One body's row.
    func body(named query: String) -> String? {
        let wanted = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        // Two characters minimum. `hasPrefix("")` is true of every row, so an
        // empty or one-letter argument from the model would otherwise come back
        // as whichever body happened to be first — a wrong answer delivered with
        // complete confidence.
        guard wanted.count >= 2 else { return nil }
        guard let planet = chart.planets.first(where: { $0.name.lowercased() == wanted })
                ?? chart.planets.first(where: { $0.name.lowercased().hasPrefix(wanted) })
        else { return nil }
        var line = "\(planet.name): position \(planet.sign) \(planet.degreeText), section \(planet.house)"
        if let nakshatra = planet.nakshatra { line += ", segment \(nakshatra)" }
        if planet.retrograde { line += ", marked retrograde" }
        let tail = extras(for: planet.name)
        return tail.isEmpty ? line + "." : line + ". " + tail.joined(separator: ". ") + "."
    }

    /// The derived facts, stated without a single word the on-device model
    /// reads as fortune telling. See the note at the top of this file: framing
    /// is what decides whether the model answers or refuses. A chart with no
    /// `derived` block (cached before Task 12 shipped) yields no extras here,
    /// and `body(named:)` falls back to the position line it always printed.
    private static func strengthWord(_ dignity: String) -> String {
        switch dignity {
        case "exalted": "highest"
        case "debilitated": "lowest"
        case "moolatrikona", "own": "high"
        default: "standard"
        }
    }

    private func extras(for name: String) -> [String] {
        guard let d = chart.derived?.planet(named: name) else { return [] }
        var parts: [String] = []
        if !d.rules.isEmpty {
            parts.append("Controls sections \(d.rules.map(String.init).joined(separator: ", "))")
        }
        parts.append("Strength rating: \(Self.strengthWord(d.dignity))")
        if d.combust, let gap = d.fromSun {
            parts.append("Within \(String(format: "%.0f", gap)) degrees of Sun")
        }
        if !d.aspects.isEmpty {
            parts.append("Linked to sections \(d.aspects.map(String.init).joined(separator: ", "))")
        }
        if !d.conjunct.isEmpty {
            parts.append("Filed alongside \(d.conjunct.joined(separator: ", "))")
        }
        return parts
    }

    /// Everything filed under one section number.
    func section(_ number: Int) -> String? {
        guard let house = chart.house(number) else { return nil }
        var head = "Section \(number) holds \(house.rashi.english) (\(house.rashi.sanskrit)), position \(house.rashi.number) of 12."
        if let d = chart.derived?.house(number) {
            head += " It is controlled by \(d.lord), which is filed in section \(d.lordHouse)."
        }
        guard !house.planets.isEmpty else { return head + " No entries are filed under it." }
        let entries = house.planets
            .map { "\($0.name) at \($0.degreeText)\($0.retrograde ? ", retrograde" : "")" }
            .joined(separator: "; ")
        return head + " Entries: \(entries)."
    }

    /// The current period rows.
    func currentPeriod() -> String? {
        guard let dasha = chart.dasha else { return nil }
        var text = """
            Current major period: \(dasha.mahadasha), running \(Self.day(dasha.mahadashaStart)) to \
            \(Self.day(dasha.mahadashaEnd)). Current minor period inside it: \(dasha.antardasha), \
            running \(Self.day(dasha.antardashaStart)) to \(Self.day(dasha.antardashaEnd)).
            """
        for period in chart.derived?.dasha ?? [] {
            guard let placement = period.placement else { continue }
            var line = " Entry \(period.lord) is filed in section \(placement.house)"
            if !placement.rules.isEmpty {
                line += ", controlling sections \(placement.rules.map(String.init).joined(separator: ", "))"
            }
            text += line + "."
        }
        return text
    }

    /// The header rows — the three values the table is indexed by.
    func header() -> String {
        var lines = [
            "Reference point: \(chart.ascendant.sign) \(chart.ascendantDegreeText), which sets section 1.",
            "Entry A (Sun) falls in \(chart.sunSign). Entry B (Moon) falls in \(chart.moonSign).",
        ]
        if let ayanamsa = chart.ayanamsa {
            lines.append("Offset applied: \(String(format: "%.2f", ayanamsa)) degrees.")
        }
        return lines.joined(separator: " ")
    }

    /// The whole table, for the rare question that spans it.
    func everything() -> String {
        var lines = [header()]
        lines.append(contentsOf: chart.planets.compactMap { body(named: $0.name) })
        if let period = currentPeriod() { lines.append(period) }
        return lines.joined(separator: "\n")
    }

    /// A section number mentioned in plain language: "7th", "house 7", "seventh".
    static func sectionNumber(in text: String) -> Int? {
        let lower = text.lowercased()
        let words = [
            "first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5, "sixth": 6,
            "seventh": 7, "eighth": 8, "ninth": 9, "tenth": 10, "eleventh": 11, "twelfth": 12,
        ]
        for (word, number) in words where lower.contains(word) { return number }
        // "7th house", "house 7", "12th"
        let pattern = /(?:house\s+(\d{1,2}))|(?:(\d{1,2})(?:st|nd|rd|th)\s*house)|(?:(\d{1,2})(?:st|nd|rd|th))/
        if let match = lower.firstMatch(of: pattern) {
            for group in [match.1, match.2, match.3] {
                if let group, let value = Int(group), (1...12).contains(value) { return value }
            }
        }
        return nil
    }

    private static func day(_ iso: String) -> String {
        Self.calendarDay(iso, format: "d MMMM yyyy")
    }

    /// Renders a `yyyy-MM-dd` date without letting the device's timezone move it.
    ///
    /// `ISO8601DateFormatter` reads a bare date as UTC midnight. Formatting that
    /// anywhere west of Greenwich hands back the day before — a dasha ending on
    /// 1 April reads as 31 March, which is the kind of wrong that nobody
    /// reports and everybody notices.
    static func calendarDay(_ iso: String, format: String) -> String {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withFullDate]
        parser.timeZone = TimeZone(secondsFromGMT: 0)
        guard let date = parser.date(from: String(iso.prefix(10))) else { return iso }
        let pretty = DateFormatter()
        pretty.locale = Locale(identifier: "en_US_POSIX")
        pretty.timeZone = TimeZone(secondsFromGMT: 0)
        pretty.dateFormat = format
        return pretty.string(from: date)
    }
}
