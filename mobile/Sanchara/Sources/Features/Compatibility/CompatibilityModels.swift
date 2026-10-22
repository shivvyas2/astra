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
            case "nadi": L10n.string("Nadi dosha")
            case "bhakoot": L10n.string("Bhakoot dosha")
            default: L10n.string("Mangal dosha")
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

    /// The script the server's English planet and sign names are shown in on
    /// the match screens: the app's own language when it is Hindi or
    /// Gujarati, so a Gujarati reader never meets "Moon in Taurus". Nil in
    /// English, which keeps the names as the server wrote them.
    static var script: NameScript? {
        switch AppLanguage.shared.code {
        case "hi": .hindi
        case "gu": .gujarati
        default: nil
        }
    }

    /// `category(_:koota:script:)` in the app's language, unchanged in English.
    static func category(_ value: String, koota: String) -> String {
        guard let script else { return value }
        return category(value, koota: koota, script: script)
    }

    static func planet(_ english: String) -> String {
        guard let script else { return english }
        return ChartPlanet.name(english: english, in: script)
    }

    static func sign(_ english: String) -> String {
        guard let script, let rashi = Rashi(english: english) else { return english }
        return rashi.name(in: script)
    }

    /// A synastry aspect's name (`AspectName` in lib/compat/synastry.ts).
    static func aspect(_ name: String) -> String {
        switch name {
        case "conjunction": L10n.string("conjunct")
        case "sextile": L10n.string("sextile")
        case "square": L10n.string("square")
        case "trine": L10n.string("trine")
        case "opposition": L10n.string("opposite")
        default: name
        }
    }

    /// A synastry aspect's tone (`Tone` in lib/compat/synastry.ts).
    static func tone(_ tone: String) -> String {
        switch tone {
        case "harmonious": L10n.string("Harmonious")
        case "challenging": L10n.string("Challenging")
        case "intense": L10n.string("Intense")
        default: tone.capitalized
        }
    }
}
