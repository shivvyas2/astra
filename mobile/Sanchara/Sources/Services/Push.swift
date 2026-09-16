import Foundation
import SwiftUI
import UIKit
import UserNotifications

/// Device registration and notification handling for dosha alerts.
///
/// The daily job on Vercel decides *when* to notify; the app's whole job here is
/// to hand APNs' device token to `/api/devices` and to open the right alert when
/// a notification is tapped.
/// What a tapped notification points at: a daily reading or a dosha alert.
struct TappedNotification: Equatable {
    enum Kind: String { case daily, alert }
    let id: String
    let kind: Kind
}

@Observable
@MainActor
final class PushStore {
    static let shared = PushStore()

    /// Set when a notification is tapped, and cleared once the UI has shown it.
    var pending: TappedNotification?
    private(set) var deviceToken: String?
    private(set) var isAuthorized = false

    /// Which APNs host the server must use for this device's token.
    ///
    /// Decided by the signing entitlement, not the build configuration: a
    /// Release build run from Xcode still carries `aps-environment:
    /// development` and mints a sandbox token. Reporting "production" for it
    /// made every push to that device fail silently. So the answer is read
    /// from the profile Xcode embedded, which is the same thing APNs reads.
    static var environment: String { ApsEnvironment.current }

    /// Asks once; iOS remembers the answer, so a later call is a no-op prompt.
    func requestAuthorization() async {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        switch settings.authorizationStatus {
        case .notDetermined:
            let granted = (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
            isAuthorized = granted
            if granted { UIApplication.shared.registerForRemoteNotifications() }
        case .authorized, .provisional, .ephemeral:
            isAuthorized = true
            UIApplication.shared.registerForRemoteNotifications()
        default:
            isAuthorized = false
        }
    }

    func received(deviceToken data: Data) {
        let token = data.map { String(format: "%02x", $0) }.joined()
        deviceToken = token
        Task { await register() }
    }

    /// Safe to call repeatedly — the route upserts on the token.
    func register() async {
        guard let deviceToken, await Supa.accessToken() != nil else { return }
        do {
            try await SancharaAPI.registerDevice(token: deviceToken, environment: Self.environment)
        } catch {
            // The next launch retries; a missed registration is not worth
            // interrupting the user over.
        }
    }

    /// Called before signing out, so the next person on this device does not
    /// receive the previous account's readings.
    func unregister() async {
        guard let deviceToken else { return }
        try? await SancharaAPI.unregisterDevice(token: deviceToken)
    }
}

/// SwiftUI has no hook for APNs callbacks, so the app keeps a small delegate.
final class SancharaAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        Task { @MainActor in PushStore.shared.received(deviceToken: deviceToken) }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        // Simulators and devices without a push entitlement land here. The app
        // works without alerts, so this is not surfaced.
    }

    /// An alert that arrives while the app is open still shows as a banner —
    /// these are infrequent and time-relevant.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .list]
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        let info = response.notification.request.content.userInfo
        guard let id = info["alert_id"] as? String else { return }
        let kind = TappedNotification.Kind(rawValue: info["kind"] as? String ?? "alert") ?? .alert
        await MainActor.run { PushStore.shared.pending = TappedNotification(id: id, kind: kind) }
    }
}

/// The `aps-environment` entitlement, read from the provisioning profile
/// embedded in the app bundle.
///
/// `embedded.mobileprovision` is a CMS-signed blob with a plist inside it. The
/// plist is plain text between `<plist` and `</plist>`, so the profile is
/// searched for that span rather than parsed as CMS, which Foundation cannot do
/// without Security framework work that is not worth it for one key.
enum ApsEnvironment {
    static let sandbox = "sandbox"
    static let production = "production"

    /// The environment for the running app. A simulator build has no profile
    /// and cannot receive pushes at all, so sandbox is the harmless answer.
    static var current: String {
        guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
              let data = try? Data(contentsOf: url) else { return sandbox }
        // Latin-1 maps every byte to a character, so the binary envelope
        // around the plist cannot make the decode fail.
        return parse(profileText: String(data: data, encoding: .isoLatin1) ?? "")
    }

    /// `production` only when the profile says so; anything else, including
    /// no plist and no entitlement, is `sandbox`.
    static func parse(profileText: String) -> String {
        guard let open = profileText.range(of: "<plist"),
              let close = profileText.range(of: "</plist>", range: open.upperBound..<profileText.endIndex)
        else { return sandbox }
        let plist = String(profileText[open.lowerBound..<close.upperBound])
        guard let data = plist.data(using: .utf8),
              let root = try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any],
              let entitlements = root["Entitlements"] as? [String: Any],
              let value = entitlements["aps-environment"] as? String
        else { return sandbox }
        return value == production ? production : sandbox
    }
}
