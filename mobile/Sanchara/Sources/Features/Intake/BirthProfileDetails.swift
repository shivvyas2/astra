import Foundation

/// The signed-in user's birth details, read directly from Supabase under the
/// owner-only RLS policy.
struct BirthProfileDetails: Codable, Equatable {
    let firstName: String
    let lastName: String
    /// `yyyy-MM-dd`.
    let birthDate: String
    /// Postgres `time` arrives as `HH:mm:ss`.
    let birthTime: String
    let placeName: String
    let lat: Double
    let lng: Double
    let timezone: String
    let avatarUrl: String?
    /// Migration 0012. Not selected from the table (production may not have
    /// the column yet); `ProfileStore` fills it from the chart's own flag.
    /// Nil means known.
    var birthTimeKnown: Bool? = nil

    enum CodingKeys: String, CodingKey {
        case firstName = "first_name"
        case lastName = "last_name"
        case birthDate = "birth_date"
        case birthTime = "birth_time"
        case placeName = "place_name"
        case lat, lng, timezone
        case avatarUrl = "avatar_url"
        case birthTimeKnown = "birth_time_known"
    }

    var fullName: String { "\(firstName) \(lastName)".trimmingCharacters(in: .whitespaces) }
    /// `HH:mm`, the shape both the picker and `POST /api/profile` use.
    var birthTimeShort: String { String(birthTime.prefix(5)) }
    /// True unless the birth time is known to be unknown.
    var isTimeKnown: Bool { birthTimeKnown != false }
}
