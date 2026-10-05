import Foundation

/// Who a saved person is to the user. Mirrors `RELATIONSHIPS` in
/// `lib/profiles/types.ts`; anything unrecognised decodes as `.other`.
enum Relationship: String, CaseIterable, Identifiable, Codable, Sendable {
    case partner, spouse, crush, friend, parent, child, sibling, colleague, other

    var id: String { rawValue }

    var label: String {
        switch self {
        case .partner: "Partner"
        case .spouse: "Spouse"
        case .crush: "Crush"
        case .friend: "Friend"
        case .parent: "Parent"
        case .child: "Child"
        case .sibling: "Sibling"
        case .colleague: "Colleague"
        case .other: "Other"
        }
    }

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = Relationship(rawValue: raw) ?? .other
    }
}

/// A saved person, from `GET /api/profiles` (no chart, with the two signs)
/// or `GET /api/profiles/:id` (with the chart).
struct Person: Decodable, Identifiable, Hashable, Sendable {
    let id: String
    let label: String
    let relationship: Relationship
    let firstName: String
    let lastName: String
    /// `yyyy-MM-dd`.
    let birthDate: String
    /// `HH:mm:ss` — the real time, or the stand-in when it is unknown.
    let birthTime: String
    let birthTimeKnown: Bool
    let placeName: String
    let lat: Double
    let lng: Double
    let timezone: String
    let updatedAt: String?
    /// List rows only.
    let moonSign: String?
    let sunSign: String?
    /// Detail only.
    let chart: ChartBundle?

    enum CodingKeys: String, CodingKey {
        case id, label, relationship, lat, lng, timezone, chart, moonSign, sunSign
        case firstName = "first_name"
        case lastName = "last_name"
        case birthDate = "birth_date"
        case birthTime = "birth_time"
        case birthTimeKnown = "birth_time_known"
        case placeName = "place_name"
        case updatedAt = "updated_at"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        firstName = try c.decode(String.self, forKey: .firstName)
        label = (try c.decodeIfPresent(String.self, forKey: .label)).flatMap { $0.isEmpty ? nil : $0 } ?? firstName
        relationship = (try? c.decode(Relationship.self, forKey: .relationship)) ?? .other
        lastName = try c.decodeIfPresent(String.self, forKey: .lastName) ?? ""
        birthDate = try c.decode(String.self, forKey: .birthDate)
        birthTime = try c.decodeIfPresent(String.self, forKey: .birthTime) ?? "12:00:00"
        birthTimeKnown = try c.decodeIfPresent(Bool.self, forKey: .birthTimeKnown) ?? true
        placeName = try c.decodeIfPresent(String.self, forKey: .placeName) ?? ""
        lat = try c.decodeIfPresent(Double.self, forKey: .lat) ?? 0
        lng = try c.decodeIfPresent(Double.self, forKey: .lng) ?? 0
        timezone = try c.decodeIfPresent(String.self, forKey: .timezone) ?? "UTC"
        updatedAt = try c.decodeIfPresent(String.self, forKey: .updatedAt)
        moonSign = try c.decodeIfPresent(String.self, forKey: .moonSign)
        sunSign = try c.decodeIfPresent(String.self, forKey: .sunSign)
        chart = try? c.decodeIfPresent(ChartBundle.self, forKey: .chart)
    }

    /// For previews and tests.
    init(
        id: String, label: String, relationship: Relationship, firstName: String, lastName: String = "",
        birthDate: String, birthTime: String = "12:00:00", birthTimeKnown: Bool = true, placeName: String,
        lat: Double = 0, lng: Double = 0, timezone: String = "Asia/Kolkata",
        moonSign: String? = nil, sunSign: String? = nil, chart: ChartBundle? = nil
    ) {
        self.id = id; self.label = label; self.relationship = relationship
        self.firstName = firstName; self.lastName = lastName
        self.birthDate = birthDate; self.birthTime = birthTime; self.birthTimeKnown = birthTimeKnown
        self.placeName = placeName; self.lat = lat; self.lng = lng; self.timezone = timezone
        self.updatedAt = nil; self.moonSign = moonSign ?? chart?.vedic.moonSign
        self.sunSign = sunSign ?? chart?.vedic.sunSign; self.chart = chart
    }

    static func == (a: Person, b: Person) -> Bool { a.id == b.id && a.updatedAt == b.updatedAt && a.label == b.label }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    /// "PR", "M" — what the avatar circle shows.
    var initials: String {
        let letters = [label.first, lastName.first].compactMap { $0 }.map { String($0) }.joined()
        return letters.isEmpty ? "?" : letters.uppercased()
    }

    /// The details as `IntakeStore.prefill` reads them, so the shared birth
    /// fields can edit a person.
    var asBirthDetails: BirthProfileDetails {
        var d = BirthProfileDetails(
            firstName: firstName, lastName: lastName, birthDate: birthDate, birthTime: birthTime,
            placeName: placeName, lat: lat, lng: lng, timezone: timezone, avatarUrl: nil
        )
        d.birthTimeKnown = birthTimeKnown
        return d
    }
}

/// What the add/edit sheet sends: the shared birth fields plus who they are.
struct PersonDraft {
    var label: String
    var relationship: Relationship
    var birth: BirthProfileInput

    /// The JSON body `POST /api/profiles` and `PATCH /api/profiles/:id` read.
    var json: [String: Any] {
        var body: [String: Any] = [
            "label": label,
            "relationship": relationship.rawValue,
            "first_name": birth.firstName,
            "last_name": birth.lastName,
            "birth_date": birth.birthDate,
            "birth_time": birth.birthTime,
            "birth_time_known": birth.birthTimeKnown,
            "place_name": birth.placeName,
            "lat": birth.lat,
            "lng": birth.lng,
            "timezone": birth.timezone,
        ]
        body["birth_time_approx"] = birth.birthTimeKnown ? "" : (birth.birthTimeApprox ?? "")
        return body
    }
}

/// `/api/profiles` and `/api/compatibility`. Kept beside the feature rather
/// than in `SancharaAPI` so the shared client stays small.
enum PeopleAPI {
    struct ListPayload: Decodable {
        let people: [Person]
        let available: Bool
    }

    static func list() async throws -> ListPayload {
        try JSONDecoder().decode(ListPayload.self, from: await send("api/profiles", method: "GET"))
    }

    static func person(id: String) async throws -> Person {
        struct Payload: Decodable { let person: Person }
        return try JSONDecoder().decode(Payload.self, from: await send("api/profiles/\(id)", method: "GET")).person
    }

    static func create(_ draft: PersonDraft) async throws -> Person {
        struct Payload: Decodable { let person: Person }
        let body = try JSONSerialization.data(withJSONObject: draft.json)
        return try JSONDecoder().decode(Payload.self, from: await send("api/profiles", method: "POST", body: body)).person
    }

    static func update(id: String, _ draft: PersonDraft) async throws -> Person {
        struct Payload: Decodable { let person: Person }
        let body = try JSONSerialization.data(withJSONObject: draft.json)
        return try JSONDecoder().decode(Payload.self, from: await send("api/profiles/\(id)", method: "PATCH", body: body)).person
    }

    static func delete(id: String) async throws {
        _ = try await send("api/profiles/\(id)", method: "DELETE")
    }

    /// `groomIsThem` reads their chart as the groom's in the classical tables.
    static func compatibility(with id: String, groomIsThem: Bool = false) async throws -> CompatibilityReport {
        var query = [URLQueryItem(name: "with", value: id)]
        if groomIsThem { query.append(URLQueryItem(name: "groom", value: "them")) }
        let data = try await send("api/compatibility", method: "GET", query: query)
        return try JSONDecoder().decode(CompatibilityReport.self, from: data)
    }

    private static func send(_ path: String, method: String, body: Data? = nil, query: [URLQueryItem] = []) async throws -> Data {
        var components = URLComponents(url: AppConfig.apiBaseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)
        if !query.isEmpty { components?.queryItems = query }
        guard let url = components?.url else { throw SancharaAPI.APIError.badURL }
        var req = URLRequest(url: url)
        req.httpMethod = method
        guard let token = await Supa.accessToken() else { throw SancharaAPI.APIError.unauthorized }
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = body
        }
        // A new person's chart is computed before the response.
        req.timeoutInterval = 60
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else { return data }
        switch http.statusCode {
        case 200..<300: return data
        case 401: throw SancharaAPI.APIError.unauthorized
        default: throw SancharaAPI.APIError.server(serverMessage(data))
        }
    }

    /// The `error` sentence the API writes for people, or a plain fallback.
    static func serverMessage(_ data: Data) -> String {
        struct Payload: Decodable { let error: String }
        if let message = try? JSONDecoder().decode(Payload.self, from: data).error, !message.isEmpty { return message }
        let text = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return text.isEmpty || text.hasPrefix("{") ? "Something went wrong. Please try again." : text
    }
}
