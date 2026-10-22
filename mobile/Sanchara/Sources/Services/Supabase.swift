import Foundation
import Supabase

/// The app's single Supabase client.
///
/// The session is persisted in the Keychain, never UserDefaults — in an item
/// shared with the widget extension through the App Group, so the widget can
/// refresh on its own (`SharedAuthStorage`, `SharedSession`).
enum Supa {
    static let client = SupabaseClient(
        supabaseURL: AppConfig.supabaseURL,
        supabaseKey: AppConfig.supabaseAnonKey,
        options: SupabaseClientOptions(
            // The library's next major behaviour, opted into now: the stored
            // session is emitted as-is at launch. AuthStore never reads that
            // event; it asks `auth.session`, which refreshes an expired one.
            auth: .init(
                storage: SharedAuthStorage(),
                storageKey: SharedSession.storageKey,
                emitLocalSessionAsInitialSession: true
            )
        )
    )

    /// The current access token, for `Authorization: Bearer` against the
    /// Astrya API on Vercel. Returns nil when signed out.
    static func accessToken() async -> String? {
        try? await client.auth.session.accessToken
    }
}
