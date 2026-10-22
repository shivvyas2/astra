import Foundation

/// The language readings are written in. Mirrors `ReadingLanguage` in
/// lib/astrology/language.ts; the server stores it and every prompt that
/// writes for this person reads it, the morning and evening readings and the
/// alerts included. `.sanskrit` is English with the Sanskrit terms.
enum ReadingLanguage: String, CaseIterable, Identifiable, Codable, Sendable {
    case english, hindi, gujarati, sanskrit

    var id: String { rawValue }

    static let storageKey = "reading.language"

    /// Each option in its own script.
    var label: String {
        switch self {
        case .english: "English"
        case .hindi: "हिन्दी"
        case .gujarati: "ગુજરાતી"
        case .sanskrit: "Sanskrit terms"
        }
    }

    /// The kundli's names follow the reading language, so a Gujarati reading
    /// sits beside a chart in Gujarati script.
    var nameScript: NameScript {
        switch self {
        case .english: .english
        case .hindi: .hindi
        case .gujarati: .gujarati
        case .sanskrit: .sanskrit
        }
    }

    /// The reading's two structural headings in every language, so the reader
    /// splits a Gujarati or Hindi reading the way it splits an English one.
    /// Mirrors SIMPLE_TITLE and BASIS_TITLE in lib/astrology/language.ts.
    static let simpleTitles: Set<String> = ["in simple words", "सरल शब्दों में", "સરળ શબ્દોમાં"]
    static let basisTitles: Set<String> = ["chart basis", "कुंडली का आधार", "કુંડળીનો આધાર"]
}

extension SancharaAPI {
    /// `GET /api/profile/language`.
    static func readingLanguage() async throws -> ReadingLanguage {
        struct Payload: Decodable { let language: ReadingLanguage }
        let req = try await request("api/profile/language", method: "GET")
        let (data, response) = try await URLSession.shared.data(for: req)
        try check(response, data)
        return try JSONDecoder().decode(Payload.self, from: data).language
    }

    /// `PUT /api/profile/language`.
    static func setReadingLanguage(_ language: ReadingLanguage) async throws {
        var req = try await request("api/profile/language", method: "PUT")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(["language": language.rawValue])
        let (data, response) = try await URLSession.shared.data(for: req)
        try check(response, data)
    }
}
