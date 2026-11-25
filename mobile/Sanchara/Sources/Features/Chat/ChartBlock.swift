import Foundation

/// A chart drawn in a reading. It arrives, and is stored, as a few plain lines
/// in the reply. Mirrors `lib/lookups/chartBlock.ts`:
///
///     **Chart D9 (Asha)**
///     - 1 Taurus: Moon, Jupiter (R)
///     - 2 Gemini: -
struct ChartBlock: Equatable, Sendable {
    struct House: Equatable, Sendable {
        let rashi: Rashi
        let items: [String]
    }

    struct Period: Equatable, Sendable {
        let lord: String
        let start: String
        let end: String
    }

    enum Content: Equatable, Sendable {
        case houses([House])
        case dasha([Period])
    }

    let id: String
    let name: String
    let content: Content

    /// The charts in a reply, and the reply without them. A block that is
    /// still arriving is in neither; lines that only look like one are prose.
    static func split(_ text: String) -> (charts: [ChartBlock], prose: String) {
        guard text.contains("**Chart ") else { return ([], text) }
        let lines = text.components(separatedBy: "\n")
        var charts: [ChartBlock] = []
        var prose: [String] = []
        var i = 0
        while i < lines.count {
            guard let (id, name) = head(lines[i]) else {
                prose.append(lines[i])
                i += 1
                continue
            }
            let rows = lines[(i + 1)...].prefix { $0.hasPrefix("- ") }
            if let content = id == "Dasha" ? periods(rows) : houses(rows) {
                charts.append(ChartBlock(id: id, name: name, content: content))
                i += 1 + rows.count
            } else if lines[(i + 1 + rows.count)...].allSatisfy({ $0.isEmpty || $0 == "-" }) {
                break
            } else {
                prose.append(lines[i])
                i += 1
            }
        }
        return (charts, prose.joined(separator: "\n"))
    }

    private static func head(_ line: String) -> (String, String)? {
        guard let m = line.wholeMatch(of: /\*\*Chart (D\d{1,2}|Moon|SAV|Dasha) \(([^*()]*)\)\*\*/) else { return nil }
        return (String(m.1), String(m.2))
    }

    private static func houses(_ rows: ArraySlice<String>) -> Content? {
        guard rows.count == 12 else { return nil }
        var out: [House] = []
        for row in rows {
            guard let m = row.wholeMatch(of: /- (\d{1,2}) ([A-Z][a-z]+): (.+)/),
                  Int(m.1) == out.count + 1, let rashi = Rashi(english: String(m.2)) else { return nil }
            out.append(House(rashi: rashi, items: m.3 == "-" ? [] : m.3.components(separatedBy: ", ")))
        }
        return .houses(out)
    }

    private static func periods(_ rows: ArraySlice<String>) -> Content? {
        guard rows.count >= 2 else { return nil }
        var out: [Period] = []
        for row in rows {
            guard let m = row.wholeMatch(of: /- ([A-Z][a-z]+): (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})/) else { return nil }
            out.append(Period(lord: String(m.1), start: String(m.2), end: String(m.3)))
        }
        return .dasha(out)
    }

    /// The houses as the kundli drawing takes them; nil for anything else. The
    /// degrees only spread planets along the sky the drawing opens with: a
    /// divisional chart has none, and nothing prints them.
    var natal: NatalChart? {
        guard id != "SAV", case .houses(let houses) = content, let first = houses.first else { return nil }
        var planets: [ChartPlanet] = []
        for (index, house) in houses.enumerated() {
            for (k, item) in house.items.enumerated() {
                planets.append(ChartPlanet(
                    name: item.replacingOccurrences(of: " (R)", with: ""),
                    sign: house.rashi.english,
                    degree: Double(k + 1) * 30 / Double(house.items.count + 1),
                    house: index + 1,
                    retrograde: item.hasSuffix("(R)"),
                    nakshatra: nil
                ))
            }
        }
        let sign = { (name: String) in planets.first { $0.name == name }?.sign ?? first.rashi.english }
        return NatalChart(
            tradition: "vedic",
            ascendant: .init(sign: first.rashi.english, degree: 0),
            planets: planets,
            moonSign: sign("Moon"),
            sunSign: sign("Sun"),
            ayanamsa: nil,
            dasha: nil,
            derived: nil
        )
    }
}
