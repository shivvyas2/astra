import Foundation

/// Which version of the AI consent notice the user has agreed to, and whether
/// that is enough to read for them. Pure, so it can be tested without a
/// network or a store.
///
/// The server (`GET /api/consent`) is the record once migration 0011 is
/// applied: consent withdrawn on the web is withdrawn here too. Until then,
/// or when the server cannot be reached, the device's own record stands.
enum ConsentPolicy {
    /// Keep in step with `CONSENT_VERSION` in lib/billing/consent.ts. Bumping
    /// it shows everyone the notice again.
    static let currentVersion = "2026-10-05"

    /// The server's answer, as decoded from `GET /api/consent`.
    struct ServerState: Decodable, Equatable {
        let accepted: Bool
        let version: String?
        let currentVersion: String
        /// False while the server cannot record consent (table missing).
        let stored: Bool
    }

    enum Decision: Equatable {
        /// Readings may go ahead.
        case accepted
        /// Show the notice.
        case needsConsent
        /// Agreed on this device but the server never heard (the POST
        /// failed): send it again, and carry on.
        case resync
    }

    /// - Parameters:
    ///   - localVersion: the version this device recorded agreement to.
    ///   - pendingSync: true when that agreement has not reached the server.
    ///   - server: nil when the server could not be asked.
    static func decide(localVersion: String?, pendingSync: Bool, server: ServerState?) -> Decision {
        if let server, server.stored {
            if server.accepted { return .accepted }
            if pendingSync, localVersion == server.currentVersion { return .resync }
            return .needsConsent
        }
        return localVersion == currentVersion ? .accepted : .needsConsent
    }

    /// Whether the device's record alone is enough to skip the loading screen
    /// while the server is asked.
    static func locallyAccepted(_ localVersion: String?) -> Bool {
        localVersion == currentVersion
    }

    /// True when a server error body is the chat route's consent refusal.
    static func isConsentRequired(_ body: String) -> Bool {
        guard let data = body.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return false }
        return object["error"] as? String == "consent_required"
    }
}
