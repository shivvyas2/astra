import Foundation
import Supabase

/// Where the Supabase client keeps its session: a Keychain item the widget
/// extension can also open, so the widget can fetch fresh readings and alerts
/// without the app being launched. See `SharedSession` for why it is one shared
/// item rather than a copy.
///
/// Every write supabase-swift makes — sign-in, each token refresh — lands here,
/// and sign-out removes it, so the widget's view of the session is never behind
/// the app's.
///
/// Sessions from before this existed live in supabase-swift's default Keychain
/// item. The first read moves them across, so nobody is signed out by the
/// update. And if the shared item cannot be used at all (a build signed without
/// the App Group), it falls back to the default item: the app keeps working and
/// only the widget's own refresh is lost.
struct SharedAuthStorage: AuthLocalStorage {
    private let shared = SharedSession.keychain
    private let legacy = KeychainLocalStorage()

    func store(key: String, value: Data) throws {
        do {
            try shared.write(value, to: key)
            try? legacy.remove(key: key)
        } catch {
            try legacy.store(key: key, value: value)
        }
    }

    func retrieve(key: String) throws -> Data? {
        if let data = try? shared.read(key) { return data }
        guard let old = try? legacy.retrieve(key: key) else { return nil }
        if (try? shared.write(old, to: key)) != nil {
            try? legacy.remove(key: key)
        }
        return old
    }

    func remove(key: String) throws {
        try? shared.delete(key)
        try? legacy.remove(key: key)
    }
}
