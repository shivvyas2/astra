import Foundation

/// Calls the Astra API on Vercel, which holds everything that cannot ship in a
/// client binary: the Anthropic key, the Swiss Ephemeris, and PDF generation.
enum AstraAPI {

    enum APIError: LocalizedError {
        case unauthorized
        case server(String)

        var errorDescription: String? {
            switch self {
            case .unauthorized: "Your session expired. Please sign in again."
            case .server(let message): message
            }
        }
    }

    private static func request(_ path: String, method: String) async throws -> URLRequest {
        var req = URLRequest(url: AppConfig.apiBaseURL.appendingPathComponent(path))
        req.httpMethod = method
        guard let token = await Supa.accessToken() else { throw APIError.unauthorized }
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return req
    }

    /// Saves birth details and computes the chart. Mirrors `POST /api/profile`.
    static func saveProfile(_ profile: BirthProfileInput) async throws {
        var req = try await request("api/profile", method: "POST")
        let boundary = "astra-\(UUID().uuidString)"
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        req.httpBody = profile.multipartBody(boundary: boundary)

        let (data, response) = try await URLSession.shared.data(for: req)
        try check(response, data)
    }

    /// Downloads the kundli PDF. Mirrors `GET /api/kundli`.
    static func kundliPDF() async throws -> Data {
        let req = try await request("api/kundli", method: "GET")
        let (data, response) = try await URLSession.shared.data(for: req)
        try check(response, data)
        return data
    }

    /// Permanently deletes the account. Required by App Store guideline 5.1.1(v).
    static func deleteAccount() async throws {
        let req = try await request("api/account", method: "DELETE")
        let (data, response) = try await URLSession.shared.data(for: req)
        try check(response, data)
    }

    private static func check(_ response: URLResponse, _ data: Data) throws {
        guard let http = response as? HTTPURLResponse else { return }
        switch http.statusCode {
        case 200..<300: return
        case 401: throw APIError.unauthorized
        default:
            let message = String(data: data, encoding: .utf8) ?? "Something went wrong."
            throw APIError.server(message)
        }
    }
}

struct BirthProfileInput {
    var firstName = ""
    var lastName = ""
    /// `yyyy-MM-dd`, matching the `birth_date` column.
    var birthDate = ""
    /// `HH:mm`, matching the `birth_time` column.
    var birthTime = ""
    var placeName = ""
    var lat: Double = 0
    var lng: Double = 0
    var timezone = ""

    func multipartBody(boundary: String) -> Data {
        var body = Data()
        let fields: [(String, String)] = [
            ("first_name", firstName),
            ("last_name", lastName),
            ("birth_date", birthDate),
            ("birth_time", birthTime),
            ("place_name", placeName),
            ("lat", String(lat)),
            ("lng", String(lng)),
            ("timezone", timezone),
        ]
        for (name, value) in fields {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(value)\r\n".data(using: .utf8)!)
        }
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        return body
    }
}
