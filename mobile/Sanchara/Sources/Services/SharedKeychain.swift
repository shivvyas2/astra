import Foundation
import Security

/// A generic-password Keychain item both the app and the widget extension can
/// reach.
///
/// On iOS an App Group identifier doubles as a Keychain access group, so the
/// `group.com.shivvyas.astra` entitlement both targets already carry is enough
/// — no separate `keychain-access-groups` entitlement is needed.
///
/// Items are written `AfterFirstUnlock`: a widget timeline is rebuilt while the
/// phone sits locked in a pocket, and an item that only opens while unlocked
/// would make every one of those refreshes fail.
///
/// Compiled into the widget extension, so it imports nothing but Security.
struct SharedKeychain: Sendable {
    let service: String
    let accessGroup: String?

    enum Failure: Error, Equatable {
        case status(OSStatus)
    }

    private func base(_ account: String) -> [String: Any] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        if let accessGroup { query[kSecAttrAccessGroup as String] = accessGroup }
        return query
    }

    /// The stored bytes, or nil when there is no item.
    func read(_ account: String) throws -> Data? {
        var query = base(account)
        query[kSecReturnData as String] = kCFBooleanTrue
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess else { throw Failure.status(status) }
        return result as? Data
    }

    /// Adds or replaces the item.
    func write(_ data: Data, to account: String) throws {
        if try update(data, at: account) { return }
        var add = base(account)
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        let status = SecItemAdd(add as CFDictionary, nil)
        if status == errSecDuplicateItem {
            _ = try update(data, at: account)
            return
        }
        guard status == errSecSuccess else { throw Failure.status(status) }
    }

    /// Replaces the item only if it still exists. Returns false when it does
    /// not — which is how the widget avoids resurrecting a session the app has
    /// just deleted on sign-out.
    @discardableResult
    func update(_ data: Data, at account: String) throws -> Bool {
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]
        let status = SecItemUpdate(base(account) as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound { return false }
        guard status == errSecSuccess else { throw Failure.status(status) }
        return true
    }

    func delete(_ account: String) throws {
        let status = SecItemDelete(base(account) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw Failure.status(status)
        }
    }
}
