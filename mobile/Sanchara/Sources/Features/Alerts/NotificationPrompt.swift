import SwiftUI
import UserNotifications

/// When to ask about notifications, and how.
///
/// iOS shows its own Allow / Don't Allow alert once per install. So the app
/// asks first in its own words, and only a person who taps Turn on sees
/// Apple's alert; a "Not now" here leaves that one chance unspent. Someone
/// who already said Don't Allow can only change it in Settings, so they get
/// the same screen pointing there. Either way it comes back at most every
/// two weeks, never on every launch.
enum NotificationPrompt {
    enum Kind: Equatable {
        /// Never asked: Turn on shows Apple's alert.
        case ask
        /// Declined before: only Settings can change it.
        case openSettings
    }

    static let lastShownKey = "sanchara.notificationPromptShown"
    static let spacing: TimeInterval = 14 * 24 * 60 * 60

    /// Pure, so the rule is tested.
    static func kind(for status: UNAuthorizationStatus, lastShown: Date?, now: Date = Date()) -> Kind? {
        if let lastShown, now.timeIntervalSince(lastShown) < spacing { return nil }
        switch status {
        case .notDetermined: return .ask
        case .denied: return .openSettings
        default: return nil
        }
    }

    static var lastShown: Date? {
        UserDefaults.standard.object(forKey: lastShownKey) as? Date
    }

    static func markShown(_ date: Date = Date()) {
        UserDefaults.standard.set(date, forKey: lastShownKey)
    }

    /// What to show now, if anything. Never in a unit-test run.
    @MainActor
    static func due() async -> Kind? {
        if NSClassFromString("XCTestCase") != nil { return nil }
        let status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        return kind(for: status, lastShown: lastShown)
    }
}

/// `sheet(item:)` wants an Identifiable; the kind is the identity.
struct PromptItem: Identifiable {
    let kind: NotificationPrompt.Kind
    var id: String { kind == .ask ? "ask" : "settings" }
}

/// The ask itself: what Astrya will send, how often, and one button that
/// either shows Apple's alert or opens Settings.
struct NotificationPromptView: View {
    let kind: NotificationPrompt.Kind
    let onDone: () -> Void

    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Image(systemName: "bell.badge")
                .font(.scaled(size: 26, weight: .medium))
                .foregroundStyle(Theme.accent)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 10) {
                Text(kind == .ask ? "Get your readings on time" : "Notifications are off")
                    .brutHeading(30)
                    .fixedSize(horizontal: false, vertical: true)
                Text(kind == .ask
                    ? "A short reading each morning and evening, and a heads-up when a dosha or a hard transit begins. Never more than a few a day."
                    : "Your readings and alerts are waiting in the app, but your phone won't tell you about them. You can turn notifications on in Settings.")
                    .font(.brutBody(15))
                    .foregroundStyle(Theme.muted)
                    .lineSpacing(2)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)

            VStack(spacing: 8) {
                SancharaPrimaryButton(title: kind == .ask ? L10n.string("Turn on notifications") : L10n.string("Open Settings"), kind: .accent) {
                    Task { await primary() }
                }
                Button("Not now") { onDone() }
                    .font(.scaled(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.fg)
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
        }
        .padding(24)
        .padding(.top, 8)
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
        .presentationBackground(Theme.bg)
        .onAppear { NotificationPrompt.markShown() }
    }

    private func primary() async {
        switch kind {
        case .ask:
            await PushStore.shared.requestAuthorization()
            await PushStore.shared.register()
        case .openSettings:
            if let url = URL(string: UIApplication.openNotificationSettingsURLString) { openURL(url) }
        }
        onDone()
    }
}
