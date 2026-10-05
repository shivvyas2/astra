import Foundation

/// The consent and billing endpoints. Kept apart from `SancharaAPI` so these
/// features stay in their own files; the request shape is the same (bearer
/// token, JSON, the API base URL).
enum BillingAPI {
    struct Failure: LocalizedError {
        let status: Int
        let body: String
        var errorDescription: String? {
            status == 401 ? "Your session expired. Please sign in again." : "Something went wrong. Please try again."
        }
    }

    private static func request(_ path: String, method: String, json: [String: Any]? = nil) async throws -> URLRequest {
        var req = URLRequest(url: AppConfig.apiBaseURL.appendingPathComponent(path))
        req.httpMethod = method
        req.timeoutInterval = 20
        guard let token = await Supa.accessToken() else { throw Failure(status: 401, body: "") }
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let json {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: json)
        }
        return req
    }

    private static func send(_ req: URLRequest) async throws -> Data {
        let (data, response) = try await URLSession.shared.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            throw Failure(status: status, body: String(data: data, encoding: .utf8) ?? "")
        }
        return data
    }

    // MARK: Consent

    /// `GET /api/consent`.
    static func consentStatus() async throws -> ConsentPolicy.ServerState {
        let data = try await send(try await request("api/consent", method: "GET"))
        return try JSONDecoder().decode(ConsentPolicy.ServerState.self, from: data)
    }

    /// `POST /api/consent`.
    static func recordConsent(version: String) async throws {
        _ = try await send(try await request("api/consent", method: "POST", json: ["version": version, "platform": "ios"]))
    }

    /// `DELETE /api/consent`.
    static func withdrawConsent() async throws {
        _ = try await send(try await request("api/consent", method: "DELETE"))
    }

    // MARK: Billing

    struct PlanStatus: Decodable {
        let plan: SubscriptionPlan
        let status: String?
        let expiresAt: String?
    }

    /// `POST /api/billing/apple` with one StoreKit 2 transaction's JWS. The
    /// server verifies Apple's signature before it records anything.
    @discardableResult
    static func postTransaction(jws: String) async throws -> PlanStatus {
        let data = try await send(try await request("api/billing/apple", method: "POST", json: ["signedTransaction": jws]))
        return try JSONDecoder().decode(PlanStatus.self, from: data)
    }
}
