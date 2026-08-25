import Foundation
import Supabase

/// The app's single Supabase client.
///
/// supabase-swift persists the session in the Keychain by default on Apple
/// platforms, which is what the spec requires — never UserDefaults.
enum Supa {
    static let client = SupabaseClient(
        supabaseURL: AppConfig.supabaseURL,
        supabaseKey: AppConfig.supabaseAnonKey
    )

    /// The current access token, for `Authorization: Bearer` against the
    /// Astra API on Vercel. Returns nil when signed out.
    static func accessToken() async -> String? {
        try? await client.auth.session.accessToken
    }
}
