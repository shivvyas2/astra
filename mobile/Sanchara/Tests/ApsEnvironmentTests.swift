import XCTest
@testable import Sanchara

/// The one fact the server needs right about a device: which APNs host its
/// token belongs to. Read from the embedded provisioning profile, which is a
/// plist wrapped in a signed binary envelope.
final class ApsEnvironmentTests: XCTestCase {

    private func profile(entitlements: String) -> String {
        // Bytes that are not text on either side, as CMS wrapping produces.
        let junk = "0\u{82}\u{07}\u{9E}\u{06}\u{09}*\u{86}H\u{86}\u{F7}\u{0D}\u{01}\u{07}\u{02}\u{A0}"
        return junk + """
        <?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
        <plist version="1.0">
        <dict>
            <key>AppIDName</key>
            <string>Astrya</string>
            <key>Entitlements</key>
            <dict>
        \(entitlements)
                <key>application-identifier</key>
                <string>Z42YU5W6WY.com.shivvyas.astra</string>
            </dict>
            <key>TeamName</key>
            <string>Shiv Vyas</string>
        </dict>
        </plist>
        """ + junk + junk
    }

    func testDevelopmentProfileIsSandbox() {
        let text = profile(entitlements: "<key>aps-environment</key><string>development</string>")
        XCTAssertEqual(ApsEnvironment.parse(profileText: text), "sandbox")
    }

    func testProductionProfileIsProduction() {
        let text = profile(entitlements: "<key>aps-environment</key><string>production</string>")
        XCTAssertEqual(ApsEnvironment.parse(profileText: text), "production")
    }

    func testProfileWithoutThePushEntitlementIsSandbox() {
        let text = profile(entitlements: "<key>get-task-allow</key><true/>")
        XCTAssertEqual(ApsEnvironment.parse(profileText: text), "sandbox")
    }

    func testNoPlistAtAllIsSandbox() {
        XCTAssertEqual(ApsEnvironment.parse(profileText: ""), "sandbox")
        XCTAssertEqual(ApsEnvironment.parse(profileText: "<plist version=\"1.0\"><dict>"), "sandbox")
    }

    func testAnUnknownValueIsNotTrustedAsProduction() {
        let text = profile(entitlements: "<key>aps-environment</key><string>Production</string>")
        XCTAssertEqual(ApsEnvironment.parse(profileText: text), "sandbox")
    }

    func testSimulatorBuildReportsSandbox() {
        // The test bundle has no embedded profile, which is the simulator case.
        XCTAssertEqual(ApsEnvironment.current, "sandbox")
    }
}

final class PushDiagnosisTests: XCTestCase {
    private func device(_ attempts: [(String, Bool, String?)], delivered: Bool = false) -> PushTestReport.Device {
        PushTestReport.Device(
            tokenTail: "abcd1234",
            stored: "sandbox",
            registeredAt: "2026-10-22T00:00:00Z",
            attempts: attempts.map { .init(environment: $0.0, ok: $0.1, status: $0.1 ? 200 : 400, reason: $0.2) },
            delivered: delivered
        )
    }

    func testNamesTheFixForEachKindOfRefusal() {
        XCTAssertTrue(PushDiagnosis.explain(device([("production", true, nil)], delivered: true)).hasPrefix("Apple accepted it"))
        XCTAssertTrue(PushDiagnosis.explain(device([("production", false, "InvalidProviderToken")])).contains("server's key"))
        XCTAssertTrue(PushDiagnosis.explain(device([("production", false, "DeviceTokenNotForTopic")])).contains("APNS_BUNDLE_ID"))
        XCTAssertTrue(PushDiagnosis.explain(device([("sandbox", false, "BadDeviceToken"), ("production", false, "BadDeviceToken")])).contains("Sign out"))
    }
}

final class NotificationPromptTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 2_000_000_000)

    func testAsksWhenNeverAskedAndPointsToSettingsWhenDeclined() {
        XCTAssertEqual(NotificationPrompt.kind(for: .notDetermined, lastShown: nil, now: now), .ask)
        XCTAssertEqual(NotificationPrompt.kind(for: .denied, lastShown: nil, now: now), .openSettings)
    }

    func testStaysQuietWhenAllowed() {
        XCTAssertNil(NotificationPrompt.kind(for: .authorized, lastShown: nil, now: now))
        XCTAssertNil(NotificationPrompt.kind(for: .provisional, lastShown: nil, now: now))
    }

    func testComesBackAtMostEveryTwoWeeks() {
        let tenDays = now.addingTimeInterval(-10 * 24 * 3600)
        let fifteenDays = now.addingTimeInterval(-15 * 24 * 3600)
        XCTAssertNil(NotificationPrompt.kind(for: .denied, lastShown: tenDays, now: now))
        XCTAssertEqual(NotificationPrompt.kind(for: .denied, lastShown: fifteenDays, now: now), .openSettings)
    }
}
