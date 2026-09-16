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
            <string>Sanchara</string>
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
