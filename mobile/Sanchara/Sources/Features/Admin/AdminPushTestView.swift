import SwiftUI
import UserNotifications

/// `POST /api/admin/push-test`. Mirrors `PushTestReport` in `lib/push/test.ts`.
struct PushTestReport: Decodable, Equatable, Sendable {
    let configured: Bool
    let devices: [Device]

    struct Device: Decodable, Equatable, Identifiable, Sendable {
        let tokenTail: String
        let stored: String
        let registeredAt: String
        let attempts: [Attempt]
        let delivered: Bool
        var id: String { tokenTail }
    }

    struct Attempt: Decodable, Equatable, Sendable {
        let environment: String
        let ok: Bool
        let status: Int
        let reason: String?
    }
}

/// What is wrong, in a sentence, from what Apple answered. Pure, so it is tested.
enum PushDiagnosis {
    static func explain(_ device: PushTestReport.Device) -> String {
        if device.delivered {
            return "Apple accepted it. If no banner appeared, check Settings > Notifications > Astrya and any Focus that is on."
        }
        let reasons = device.attempts.compactMap(\.reason)
        if reasons.contains(where: { ["InvalidProviderToken", "ExpiredProviderToken", "MissingProviderToken"].contains($0) }) {
            return "Apple rejected the server's key. Check APNS_KEY_ID, APNS_TEAM_ID and APNS_PRIVATE_KEY on Vercel."
        }
        if reasons.contains(where: { ["TopicDisallowed", "BadTopic", "DeviceTokenNotForTopic"].contains($0) }) {
            return "The key is not allowed to send for this app. APNS_BUNDLE_ID must be com.shivvyas.astra, and the key must have push enabled."
        }
        if reasons.allSatisfy({ $0 == "BadDeviceToken" }) {
            return "Neither Apple server accepts this phone's token. Sign out and back in on the phone to register a fresh one."
        }
        if reasons.contains("Unregistered") {
            return "Apple says the app was removed from this phone. Reinstall or reopen the app to register again."
        }
        return "Apple refused it: \(reasons.joined(separator: ", ")). The server could not reach Apple if this says Timeout."
    }
}

/// Sends a test notification to this admin's own phones and shows, per phone,
/// what Apple answered and what to do about it. Also shows what this phone
/// knows about itself: permission, token, and the Apple server it reports.
struct AdminPushTestView: View {
    let api: AdminAPI

    @State private var permission = "Checking…"
    @State private var report: PushTestReport?
    @State private var errorMessage: String?
    @State private var isSending = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Push notifications")
                .font(.adminTitle(18))
                .foregroundStyle(AdminTheme.ink)
                .accessibilityAddTraits(.isHeader)

            VStack(alignment: .leading, spacing: 4) {
                line("Permission", permission)
                line("This phone's token", PushStore.shared.deviceToken.map { "…\($0.suffix(8))" } ?? "None yet")
                line("Apple server it reports", PushStore.environment)
            }

            Button {
                Task { await send() }
            } label: {
                HStack {
                    if isSending { ProgressView().tint(AdminTheme.ink) }
                    Text(isSending ? "Sending…" : "Send a test notification")
                        .font(.system(size: 15, weight: .semibold))
                }
                .foregroundStyle(AdminTheme.ink)
                .frame(maxWidth: .infinity, minHeight: 48)
                .background(Capsule().fill(AdminTheme.lime))
            }
            .buttonStyle(AdminPressStyle())
            .disabled(isSending)

            if let errorMessage {
                Text(errorMessage)
                    .font(.adminLabel)
                    .foregroundStyle(AdminTheme.warm)
            }

            if let report {
                if !report.configured {
                    Text("The server has no APNs key, so it sends nothing. Set the APNS_* variables on Vercel.")
                        .font(.adminLabel)
                        .foregroundStyle(AdminTheme.warm)
                } else if report.devices.isEmpty {
                    Text("No phone is registered for this account. Allow notifications when the app asks, or turn them on in Settings > Notifications > Astrya, then reopen the app.")
                        .font(.adminLabel)
                        .foregroundStyle(AdminTheme.warm)
                } else {
                    ForEach(report.devices) { device in
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Phone …\(device.tokenTail), registered \(AdminFormat.relative(device.registeredAt))")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(AdminTheme.ink)
                            ForEach(Array(device.attempts.enumerated()), id: \.offset) { _, a in
                                Text("\(a.environment): \(a.ok ? "accepted" : "\(a.status) \(a.reason ?? "")")")
                                    .font(.adminLabel)
                                    .foregroundStyle(a.ok ? AdminTheme.ink : AdminTheme.warm)
                            }
                            Text(PushDiagnosis.explain(device))
                                .font(.adminLabel)
                                .foregroundStyle(AdminTheme.muted)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(.top, 6)
                    }
                }
            }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: AdminTheme.panelRadius, style: .continuous).fill(AdminTheme.raised))
        .task { await refreshPermission() }
    }

    private func line(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).foregroundStyle(AdminTheme.muted)
            Spacer(minLength: 8)
            Text(value).foregroundStyle(AdminTheme.ink)
        }
        .font(.adminLabel)
    }

    private func refreshPermission() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        permission = switch settings.authorizationStatus {
        case .authorized: "Allowed"
        case .provisional: "Quiet (provisional)"
        case .ephemeral: "Temporary"
        case .denied: "Off in Settings"
        case .notDetermined: "Not asked yet"
        @unknown default: "Unknown"
        }
    }

    private func send() async {
        isSending = true
        defer { isSending = false }
        errorMessage = nil
        // Ask, register and report this phone first, so the test covers the
        // token it has right now.
        await PushStore.shared.requestAuthorization()
        await PushStore.shared.register()
        await refreshPermission()
        do {
            report = try await api.pushTest()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
