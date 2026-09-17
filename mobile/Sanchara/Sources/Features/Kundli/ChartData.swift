import Foundation

/// The computed chart, decoded from the `birth_profiles.chart` jsonb column.
///
/// This mirrors `lib/astrology/types.ts` field for field. The column holds both
/// traditions — `{ vedic, western }` — written by `saveBirthProfile`; the app
/// reads it under the same owner-only RLS policy that already guards the birth
/// details, so nothing new has to be exposed on the API to get it here.
///
/// Having the chart on the device is what lets the kundli draw without a round
/// trip, and what gives the on-device model something factual to answer from.
struct ChartBundle: Decodable, Equatable, Sendable {
    let vedic: NatalChart
    let western: NatalChart?
}

struct NatalChart: Codable, Equatable, Sendable {
    let tradition: String
    let ascendant: Ascendant
    let planets: [ChartPlanet]
    let moonSign: String
    let sunSign: String
    let ayanamsa: Double?
    let dasha: DashaInfo?
    let derived: DerivedFacts?

    struct Ascendant: Codable, Equatable, Sendable {
        let sign: String
        let degree: Double
    }
}

/// The classical readings the server derives from the positions.
///
/// Mirrors `lib/astrology/derived.ts` field for field, the same way
/// `NatalChart` mirrors `types.ts`. Everything is optional at the top level:
/// a chart cached in the app group before this shipped decodes with `derived`
/// nil, and every consumer falls back to what it printed before. A widget or a
/// Siri intent must never fail to decode a chart it has already stored.
///
/// Conditions are deliberately not carried. They are interpretive, and the
/// on-device model is only allowed to restate records.
struct DerivedFacts: Codable, Equatable, Sendable {
    let planets: [DerivedPlanet]
    let houses: [DerivedHouse]
    let dasha: [DerivedPeriod]

    func planet(named name: String) -> DerivedPlanet? {
        planets.first { $0.name.caseInsensitiveCompare(name) == .orderedSame }
    }

    func house(_ number: Int) -> DerivedHouse? {
        houses.first { $0.number == number }
    }
}

struct DerivedPlanet: Codable, Equatable, Sendable {
    let name: String
    let house: Int
    let rules: [Int]
    let dignity: String
    let combust: Bool
    let fromSun: Double?
    let aspects: [Int]
    let conjunct: [String]
}

struct DerivedHouse: Codable, Equatable, Sendable {
    let number: Int
    let sign: String
    let lord: String
    let lordHouse: Int
    let occupants: [String]
}

struct DerivedPeriod: Codable, Equatable, Sendable {
    let level: String
    let lord: String
    let placement: DerivedPlanet?
}

struct ChartPlanet: Codable, Equatable, Identifiable, Sendable {
    let name: String
    let sign: String
    let degree: Double
    let house: Int
    let retrograde: Bool
    let nakshatra: String?

    var id: String { name }

    /// The astronomical glyph. Rahu and Ketu have no Unicode astronomy symbol
    /// with wide font coverage, so the nodes borrow the ascending and
    /// descending node signs, which is what printed panchangas use.
    ///
    /// The Moon is U+263D (first quarter) rather than the U+263E (last quarter)
    /// that reads more naturally in a table of waning symbols. The reason is
    /// rendering, not astronomy: on iOS, U+263E resolves to the emoji font and
    /// draws a solid white crescent, conspicuously heavier than the eight
    /// line-art glyphs beside it. U+263D resolves to the text font and matches
    /// them. The text-presentation selector, U+FE0E, does not change this —
    /// that was tried first and made no difference to either codepoint.
    var glyph: String {
        switch name {
        case "Sun": "☉"
        case "Moon": "☽"
        case "Mercury": "☿"
        case "Venus": "♀"
        case "Mars": "♂"
        case "Jupiter": "♃"
        case "Saturn": "♄"
        case "Rahu": "☊"
        case "Ketu": "☋"
        default: String(name.prefix(2))
        }
    }

    /// `14°32'` — the form every printed kundli uses, and far more useful than
    /// a rounded whole degree when two planets share a sign.
    var degreeText: String {
        let whole = Int(degree)
        let minutes = Int((degree - Double(whole)) * 60)
        return "\(whole)°\(String(format: "%02d", minutes))'"
    }

    /// What VoiceOver reads for this planet, and what the on-device model is
    /// handed as a fact. One sentence, no abbreviations.
    var spokenDescription: String {
        var parts = ["\(name) in \(sign) at \(degreeText), house \(house)"]
        if let nakshatra { parts.append("nakshatra \(nakshatra)") }
        if retrograde { parts.append("retrograde") }
        return parts.joined(separator: ", ")
    }
}

struct DashaInfo: Codable, Equatable, Sendable {
    let mahadasha: String
    let mahadashaStart: String
    let mahadashaEnd: String
    let antardasha: String
    let antardashaStart: String
    let antardashaEnd: String
}

// MARK: - Period progress

/// How far through a dasha period a given day is.
///
/// Lives here rather than in the timeline feature because the period widget
/// needs it too, and this file is one of the few compiled into both targets.
/// Dates are ISO calendar days parsed in UTC — the API's convention — so the
/// answer is the same on every device regardless of its zone.
enum PeriodProgress {
    private static let iso: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func parse(_ value: String) -> Date? { iso.date(from: value) }

    /// 0 before the period, 1 after it, and 0 for a period with no length.
    static func fraction(start: String, end: String, today: String) -> Double {
        guard let s = parse(start), let e = parse(end), let t = parse(today) else { return 0 }
        let span = e.timeIntervalSince(s)
        guard span > 0 else { return 0 }
        return min(max(t.timeIntervalSince(s) / span, 0), 1)
    }

    /// Whole years left, rounded down, never negative. "3 years left" is the
    /// number a person wants; "2.7" is not.
    static func yearsRemaining(end: String, today: String) -> Int {
        guard let e = parse(end), let t = parse(today) else { return 0 }
        return max(Int(e.timeIntervalSince(t) / (365.25 * 86_400)), 0)
    }
}

// MARK: - Rashis

/// The twelve rashis in zodiacal order, with the Sanskrit names a kundli is
/// normally labelled with.
///
/// The chart stores Western sign names because the ephemeris returns them, but
/// a North Indian chart that says "Scorpio" where it should say "Vrishchika"
/// reads as a translation of someone else's diagram. Both are carried: the
/// Sanskrit for the chart, the English wherever it has to match the reading
/// text the API writes.
enum Rashi: Int, CaseIterable, Sendable {
    case mesha = 0, vrishabha, mithuna, karka, simha, kanya
    case tula, vrishchika, dhanu, makara, kumbha, meena

    static let englishNames = [
        "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
        "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
    ]

    static let sanskritNames = [
        "Mesha", "Vrishabha", "Mithuna", "Karka", "Simha", "Kanya",
        "Tula", "Vrishchika", "Dhanu", "Makara", "Kumbha", "Meena",
    ]

    init?(english: String) {
        guard let index = Self.englishNames.firstIndex(of: english) else { return nil }
        self.init(rawValue: index)
    }

    var english: String { Self.englishNames[rawValue] }
    var sanskrit: String { Self.sanskritNames[rawValue] }
    /// 1...12, the numeral printed in each house of a North Indian chart.
    var number: Int { rawValue + 1 }
}

// MARK: - Houses

/// One house of the kundli, resolved for drawing and for reading aloud.
struct KundliHouse: Identifiable, Sendable {
    /// 1...12, counted from the lagna.
    let number: Int
    let rashi: Rashi
    let planets: [ChartPlanet]

    var id: Int { number }
    var isLagna: Bool { number == 1 }

    /// The significations people actually look a house up for. Kept short and
    /// concrete — this is a legend, not a reading.
    var domain: String {
        switch number {
        case 1: "Self, body, how you begin"
        case 2: "Money, speech, family"
        case 3: "Courage, siblings, effort"
        case 4: "Home, mother, peace of mind"
        case 5: "Children, learning, creativity"
        case 6: "Work, health, obstacles"
        case 7: "Partnership, marriage, others"
        case 8: "Change, inheritance, the hidden"
        case 9: "Fortune, father, belief"
        case 10: "Career, standing, action"
        case 11: "Gains, networks, hopes"
        default: "Loss, release, what is spent"
        }
    }

    var accessibilityLabel: String {
        let place = "House \(number), \(rashi.sanskrit), \(rashi.english)"
        guard !planets.isEmpty else { return "\(place). Empty." }
        return "\(place). \(planets.map(\.spokenDescription).joined(separator: ". "))"
    }
}

extension NatalChart {
    var ascendantRashi: Rashi { Rashi(english: ascendant.sign) ?? .mesha }

    /// The twelve houses in order, each carrying the rashi that falls in it.
    ///
    /// In a North Indian chart the houses are fixed on the page and the rashis
    /// rotate: house 1 always holds the lagna's rashi, and each house after it
    /// takes the next sign. That is the one rule the whole diagram rests on.
    var houses: [KundliHouse] {
        let ascIndex = ascendantRashi.rawValue
        return (1...12).map { number in
            let rashi = Rashi(rawValue: (ascIndex + number - 1) % 12) ?? .mesha
            return KundliHouse(
                number: number,
                rashi: rashi,
                planets: planets.filter { $0.house == number }
            )
        }
    }

    func house(_ number: Int) -> KundliHouse? {
        houses.first { $0.number == number }
    }

    func planet(named name: String) -> ChartPlanet? {
        planets.first { $0.name.caseInsensitiveCompare(name) == .orderedSame }
    }

    /// `14°32'` for the lagna, matching how planets are printed.
    var ascendantDegreeText: String {
        let whole = Int(ascendant.degree)
        let minutes = Int((ascendant.degree - Double(whole)) * 60)
        return "\(whole)°\(String(format: "%02d", minutes))'"
    }
}
