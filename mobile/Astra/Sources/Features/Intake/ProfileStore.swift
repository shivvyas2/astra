import Foundation
import Supabase

/// The signed-in user's birth details, read directly from Supabase under the
/// owner-only RLS policy.
struct BirthProfileDetails: Decodable, Equatable {
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

    enum CodingKeys: String, CodingKey {
        case firstName = "first_name"
        case lastName = "last_name"
        case birthDate = "birth_date"
        case birthTime = "birth_time"
        case placeName = "place_name"
        case lat, lng, timezone
        case avatarUrl = "avatar_url"
    }

    var fullName: String { "\(firstName) \(lastName)".trimmingCharacters(in: .whitespaces) }
    /// `HH:mm`, the shape both the picker and `POST /api/profile` use.
    var birthTimeShort: String { String(birthTime.prefix(5)) }
}

/// Whether this account has a computed chart yet, and the details behind it.
///
/// `/api/chat` refuses to read for a user without a chart, and the web app
/// redirects to intake in the same case (`app/(app)/app/chat/page.tsx`). The
/// `chart` column is only filtered on, never selected, so the whole chart
/// payload never crosses the wire just to answer "is it there?".
@Observable
@MainActor
final class ProfileStore {
    enum State {
        case loading
        case needsIntake
        case ready
        case failed(String)
    }

    var state: State = .loading
    var details: BirthProfileDetails?

    func load() async {
        do {
            let rows: [BirthProfileDetails] = try await Supa.client
                .from("birth_profiles")
                .select("first_name, last_name, birth_date, birth_time, place_name, lat, lng, timezone, avatar_url")
                .not("chart", operator: .is, value: "null")
                .limit(1)
                .execute()
                .value
            details = rows.first
            state = rows.isEmpty ? .needsIntake : .ready
        } catch {
            state = .failed("Could not load your chart. Check your connection and try again.")
        }
    }
}
