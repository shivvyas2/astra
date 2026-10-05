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
            auth: .init(storage: SharedAuthStorage(), storageKey: SharedSession.storageKey)
        )
    )

    /// The current access token, for `Authorization: Bearer` against the
    /// Astrya API on Vercel. Returns nil when signed out.
    static func accessToken() async -> String? {
        try? await client.auth.session.accessToken
    }
}
