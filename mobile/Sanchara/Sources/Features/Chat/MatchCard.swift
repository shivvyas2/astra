import Foundation

/// The confirm card a reading can end with: someone's birth details as Astrya
/// understood them. Mirrors `MatchCard` in `lib/compat/matchCard.ts`, and
/// travels the same way: after the text, behind one U+001E.
struct MatchCard: Decodable, Equatable, Sendable {
    let name: String
    let relationship: Relationship
    /// `yyyy-MM-dd`.
    let birthDate: String?
    /// The other way to read an ambiguous date; they must choose.
    let altBirthDate: String?
    /// `HH:mm`.
    let birthTime: String?
    let timeKnown: Bool
    /// Best first. Empty on a card opened with nothing known.
    let places: [GeoResult]
    /// Nothing tells the first places apart; they must choose.
    let placeAmbiguous: Bool

    /// Nothing to confirm yet: the card asks for the details instead.
    var isEmpty: Bool { birthDate == nil || places.isEmpty }

    func draft(relationship: Relationship, birthDate: String, place: GeoResult) -> PersonDraft {
        var birth = BirthProfileInput()
        birth.firstName = name
        birth.birthDate = birthDate
        birth.birthTime = birthTime ?? "12:00"
        birth.birthTimeKnown = timeKnown && birthTime != nil
        birth.placeName = place.name
        birth.lat = place.lat
        birth.lng = place.lng
        birth.timezone = place.timezone
        return PersonDraft(label: name, relationship: relationship, birth: birth)
    }

    /// Whether a reply read someone's details back, so the answer to it must
    /// reach the server rather than the on-device reasoner.
    static func isReadBack(_ text: String) -> Bool {
        text.range(of: #"(?m)^> \*\*.+\*\* \(.+\) · "#, options: .regularExpression) != nil
    }
}

/// Splits a chat stream into its text and the card that may follow it.
struct CardSplitter {
    static let separator: Character = "\u{1E}"
    private var json: String?

    /// The part of `chunk` that is text, if any.
    mutating func text(from chunk: String) -> String? {
        if json != nil {
            json? += chunk
            return nil
        }
        guard let at = chunk.firstIndex(of: Self.separator) else { return chunk }
        json = String(chunk[chunk.index(after: at)...])
        let text = String(chunk[..<at])
        return text.isEmpty ? nil : text
    }

    /// The reply failed and can be asked again.
    var failed: Bool { json == #"{"type":"failed"}"# }

    /// The card, once the stream has ended. Nil when there was none or it was cut short.
    func card() -> MatchCard? {
        guard let json else { return nil }
        return try? JSONDecoder().decode(MatchCard.self, from: Data(json.utf8))
    }
}
