import Foundation

/// `GET /api/compatibility?with=<id>` — Guna Milan, synastry, and the words
/// written from them. Mirrors `Compatibility` in `lib/compat/compatibility.ts`.
struct CompatibilityReport: Decodable, Equatable, Sendable {
    let guna: Guna
    let synastry: Synastry
    let summary: String
    let askPrompt: String
    let people: People

    struct Guna: Decodable, Equatable, Sendable {
        let total: Double
        let max: Double
        let kootas: [Koota]
        let doshas: [Dosha]
        let verdict: String
        /// "you" or "them": whose chart the classical tables read as the groom's.
        let groom: String
        let swappedTotal: Double
    }

    struct Koota: Decodable, Equatable, Identifiable, Sendable {
        let key: String
        let name: String
        let score: Double
        let max: Double
        let note: String
        let you: String
        let them: String
        var id: String { key }
    }

    struct Dosha: Decodable, Equatable, Identifiable, Sendable {
        let kind: String
        let present: Bool
        let exceptions: [String]
        let note: String
        var id: String { kind }

        var title: String {
            switch kind {
            case "nadi": "Nadi dosha"
            case "bhakoot": "Bhakoot dosha"
            default: "Mangal dosha"
            }
        }
    }

    struct Synastry: Decodable, Equatable, Sendable {
        let score0to100: Int
        let aspects: [Aspect]
        let elements: Elements
    }

    struct Aspect: Decodable, Equatable, Identifiable, Sendable {
        let a: String
        let b: String
        let aspect: String
        let orb: Double
        let tone: String
        let uncertain: Bool
        var id: String { "\(a)-\(b)-\(aspect)" }
    }

    struct Elements: Decodable, Equatable, Sendable {
        let a: [String: Int]
        let b: [String: Int]
        let pairs: [ElementPair]
    }

    struct ElementPair: Decodable, Equatable, Identifiable, Sendable {
        let label: String
        let a: String
        let b: String
        let relation: String
        var id: String { label }
    }

    struct People: Decodable, Equatable, Sendable {
        let you: Side
        let them: Side
    }

    struct Side: Decodable, Equatable, Sendable {
        let name: String
        let moonSign: String
        let nakshatra: String
        let pada: Int?
        let timeKnown: Bool
        let sunSign: String
    }
}

enum GunaFormat {
    /// "27", "27.5" — gunas come in halves.
    static func points(_ value: Double) -> String {
        value.rounded() == value ? String(Int(value)) : String(format: "%.1f", value)
    }

    /// A koota's category in the chosen script: Graha Maitri carries graha
    /// names and Bhakoot carries rashis; the rest are Sanskrit terms already.
    static func category(_ value: String, koota: String, script: NameScript) -> String {
        switch koota {
        case "maitri": ChartPlanet.name(english: value, in: script)
        case "bhakoot": Rashi(english: value)?.name(in: script) ?? value
        default: value
        }
    }
}
