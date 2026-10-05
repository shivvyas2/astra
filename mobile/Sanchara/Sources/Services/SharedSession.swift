import Foundation

/// The signed-in user's Supabase session, readable by the widget extension.
///
/// The app's Supabase client stores its session through `SharedAuthStorage`,
/// which puts it in a Keychain item shared with the widget through the App
/// Group. The widget reads it here, refreshes the access token itself when it
/// has expired, and writes the rotated tokens back to the *same* item.
///
/// Sharing one item, rather than mirroring a copy, is load-bearing: Supabase
/// rotates the refresh token on every refresh and, outside a short reuse
/// window, treats a second use of an old one as theft and revokes the whole
/// session. A widget refreshing from a private copy would sign the app out.
/// Because supabase-swift reads its storage on every `session` call, whatever
/// the widget writes is what the app uses next.
///
/// Only the user's own tokens are ever used — the anon key plus the user's JWT,
/// exactly what the app sends. Nothing here can see another user's rows.
///
/// Compiled into the widget, so no Supabase import: the token endpoint is one
/// POST and the session is handled as JSON.
enum SharedSession {
    /// A Keychain service distinct from supabase-swift's default
    /// (`supabase.gotrue.swift`), so the legacy item and the shared one never
    /// collide during migration.
    static let service = "com.shivvyas.astra.session"

    /// supabase-swift's default key for this project, `sb-<ref>-auth-token`.
    /// Passed to the client explicitly so the two cannot drift apart.
    static var storageKey: String {
        let ref = AppConfig.supabaseURL.host?.split(separator: ".").first.map(String.init) ?? "app"
        return "sb-\(ref)-auth-token"
    }

    static let keychain = SharedKeychain(service: service, accessGroup: ChartCache.appGroup)

    /// What a caller can do with the session right now.
    enum Access: Equatable, Sendable {
        /// A JWT valid for at least the next couple of minutes.
        case token(String)
        /// Nobody is signed in on this device.
        case signedOut
        /// The refresh token was rejected — revoked, or signed out elsewhere.
        /// Only the app can recover, by signing in again.
        case revoked
        /// The network or the Keychain failed. Try again later.
        case unavailable
    }

    /// One refresh at a time per process: the reading and alert widgets often
    /// rebuild together, and two refreshes with one token would race.
    private static let gate = RefreshGate()

    /// A usable access token, refreshing (and writing back) if it has expired.
    static func access(session: URLSession = .shared, now: Date = Date()) async -> Access {
        await gate.run { await resolve(session: session, now: now) }
    }

    private static func resolve(session: URLSession, now: Date) async -> Access {
        let stored: Data
        do {
            guard let data = try keychain.read(storageKey) else { return .signedOut }
            stored = data
        } catch {
            return .unavailable
        }
        guard let tokens = SessionBlob.tokens(from: stored) else { return .signedOut }
        if !TokenPolicy.needsRefresh(expiresAt: tokens.expiresAt, now: now) {
            return .token(tokens.accessToken)
        }

        var request = URLRequest(url: AppConfig.supabaseURL.appendingPathComponent("auth/v1/token"))
        request.url = request.url.flatMap {
            var parts = URLComponents(url: $0, resolvingAgainstBaseURL: false)
            parts?.queryItems = [URLQueryItem(name: "grant_type", value: "refresh_token")]
            return parts?.url
        }
        request.httpMethod = "POST"
        request.timeoutInterval = 12
        request.setValue(AppConfig.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["refresh_token": tokens.refreshToken])

        guard let (data, response) = try? await session.data(for: request),
              let http = response as? HTTPURLResponse else { return .unavailable }
        switch http.statusCode {
        case 200..<300:
            break
        case 400, 401, 403:
            return .revoked
        default:
            return .unavailable
        }
        guard let merged = SessionBlob.merging(refreshed: data, into: stored, now: now),
              let fresh = SessionBlob.tokens(from: merged) else { return .unavailable }
        do {
            // Update, never add: if the app deleted the item while this was in
            // flight, the user signed out, and the session must stay gone.
            guard try keychain.update(merged, at: storageKey) else { return .signedOut }
        } catch {
            return .unavailable
        }
        return .token(fresh.accessToken)
    }
}

/// The three fields of a stored session the widget needs.
struct SessionTokens: Equatable, Sendable {
    let accessToken: String
    let refreshToken: String
    /// Unix seconds.
    let expiresAt: TimeInterval
}

/// Reads and rewrites a stored session without knowing its full schema.
///
/// supabase-swift stores `Session` with a plain `JSONEncoder`, so its keys are
/// camelCase (`accessToken`) while the token endpoint answers in snake_case
/// (`access_token`). Both are accepted on read; a rewrite keeps whichever style
/// the stored blob already uses and leaves every other field — the user, its
/// dates in the encoder's own format — exactly as it was.
enum SessionBlob {
    private static let fields: [(camel: String, snake: String)] = [
        ("accessToken", "access_token"),
        ("refreshToken", "refresh_token"),
        ("expiresAt", "expires_at"),
        ("expiresIn", "expires_in"),
        ("tokenType", "token_type"),
    ]

    static func tokens(from data: Data) -> SessionTokens? {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        func value(_ camel: String, _ snake: String) -> Any? { object[camel] ?? object[snake] }
        guard let access = value("accessToken", "access_token") as? String, !access.isEmpty,
              let refresh = value("refreshToken", "refresh_token") as? String, !refresh.isEmpty,
              let expiresAt = (value("expiresAt", "expires_at") as? NSNumber)?.doubleValue
        else { return nil }
        return SessionTokens(accessToken: access, refreshToken: refresh, expiresAt: expiresAt)
    }

    /// The stored session with its tokens replaced by a refresh response's.
    static func merging(refreshed response: Data, into stored: Data, now: Date) -> Data? {
        guard var target = try? JSONSerialization.jsonObject(with: stored) as? [String: Any],
              let source = try? JSONSerialization.jsonObject(with: response) as? [String: Any],
              let access = source["access_token"] as? String,
              let refresh = source["refresh_token"] as? String
        else { return nil }

        let expiresIn = (source["expires_in"] as? NSNumber)?.doubleValue ?? 3600
        let expiresAt = (source["expires_at"] as? NSNumber)?.doubleValue
            ?? now.timeIntervalSince1970 + expiresIn
        let values: [String: Any] = [
            "access_token": access,
            "refresh_token": refresh,
            "expires_at": expiresAt,
            "expires_in": expiresIn,
            "token_type": source["token_type"] as? String ?? "bearer",
        ]
        let camel = target["accessToken"] != nil || target["access_token"] == nil
        for field in fields {
            target[camel ? field.camel : field.snake] = values[field.snake]
        }
        return try? JSONSerialization.data(withJSONObject: target)
    }
}

enum TokenPolicy {
    /// Refresh a little early: a token that expires mid-request is as bad as
    /// one that already has. supabase-swift itself uses thirty seconds; a
    /// widget's requests are slower to start, so two minutes.
    static let margin: TimeInterval = 120

    static func needsRefresh(expiresAt: TimeInterval, now: Date, margin: TimeInterval = margin) -> Bool {
        expiresAt - now.timeIntervalSince1970 < margin
    }
}

/// Serialises refreshes inside one process.
private actor RefreshGate {
    private var inFlight: Task<SharedSession.Access, Never>?

    func run(_ work: @escaping @Sendable () async -> SharedSession.Access) async -> SharedSession.Access {
        if let inFlight { return await inFlight.value }
        let task = Task { await work() }
        inFlight = task
        let result = await task.value
        inFlight = nil
        return result
    }
}
