import Foundation
import Supabase

/// Whether this account has agreed to the current AI consent notice.
///
/// Fast path: if this device recorded agreement to the current version, the
/// app opens straight away and the server is asked in the background — a
/// withdrawal made on the web then brings the notice back. With no local
/// record the server is asked first, so agreeing on the web is enough.
/// Agreeing never waits on the network: it is kept locally and re-sent until
/// the server has it.
@Observable
@MainActor
final class ConsentStore {
    static let shared = ConsentStore()

    enum State: Equatable {
        case checking
        case needed
        case accepted
    }

    private(set) var state: State = .checking
    private(set) var isSaving = false
    var errorMessage: String?

    private var userID: String?
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    private func versionKey(_ uid: String) -> String { "consent.ai.version.\(uid)" }
    private func pendingKey(_ uid: String) -> String { "consent.ai.pending.\(uid)" }

    private func currentUserID() async -> String? {
        (try? await Supa.client.auth.session.user.id.uuidString.lowercased())
    }

    func check() async {
        guard let uid = await currentUserID() else { state = .needed; return }
        if uid != userID {
            userID = uid
            state = .checking
        }
        let local = defaults.string(forKey: versionKey(uid))
        let pending = defaults.bool(forKey: pendingKey(uid))
        if ConsentPolicy.locallyAccepted(local) { state = .accepted }

        let server = try? await BillingAPI.consentStatus()
        guard uid == userID else { return }
        switch ConsentPolicy.decide(localVersion: local, pendingSync: pending, server: server) {
        case .accepted:
            if let server, server.stored, server.accepted {
                defaults.set(server.currentVersion, forKey: versionKey(uid))
                defaults.set(false, forKey: pendingKey(uid))
            }
            state = .accepted
        case .resync:
            state = .accepted
            await sync(uid: uid)
        case .needsConsent:
            defaults.removeObject(forKey: versionKey(uid))
            defaults.set(false, forKey: pendingKey(uid))
            state = .needed
        }
    }

    func agree() async {
        guard let uid = await currentUserID() else { return }
        userID = uid
        isSaving = true
        defer { isSaving = false }
        defaults.set(ConsentPolicy.currentVersion, forKey: versionKey(uid))
        defaults.set(true, forKey: pendingKey(uid))
        await sync(uid: uid)
        state = .accepted
    }

    /// Withdraws consent here and on the server. Readings stop until the
    /// notice is agreed to again.
    func withdraw() async -> Bool {
        guard let uid = await currentUserID() else { return false }
        isSaving = true
        defer { isSaving = false }
        do {
            try await BillingAPI.withdrawConsent()
        } catch {
            errorMessage = "Could not withdraw that. Check your connection and try again."
            return false
        }
        defaults.removeObject(forKey: versionKey(uid))
        defaults.set(false, forKey: pendingKey(uid))
        state = .needed
        return true
    }

    /// The server refused a reading with 403 consent_required: forget the
    /// local record and show the notice again.
    func requireAgain() {
        if let uid = userID {
            defaults.removeObject(forKey: versionKey(uid))
            defaults.set(false, forKey: pendingKey(uid))
        }
        state = .needed
    }

    private func sync(uid: String) async {
        do {
            try await BillingAPI.recordConsent(version: ConsentPolicy.currentVersion)
            defaults.set(false, forKey: pendingKey(uid))
        } catch {
            // Kept pending; sent again on the next check.
        }
    }

    // MARK: - Chat hook

    /// For `ChatStore`'s error handling: if the reading was refused for want
    /// of consent, bring the notice back and return a line for the
    /// transcript. Nil for any other error.
    static func handleChatError(_ error: Error) -> String? {
        guard case SancharaAPI.APIError.server(let body) = error, ConsentPolicy.isConsentRequired(body) else {
            return nil
        }
        shared.requireAgain()
        return "Readings need your OK to send your chart to Anthropic."
    }
}
