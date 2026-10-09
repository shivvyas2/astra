import XCTest
@testable import Sanchara

/// The pure parts of AI consent and Astrya Plus: the consent decision, the
/// entitlement-to-plan mapping, and the paywall's price arithmetic.
final class BillingConsentTests: XCTestCase {

    // MARK: Consent

    private func server(accepted: Bool, stored: Bool = true, version: String? = nil) -> ConsentPolicy.ServerState {
        ConsentPolicy.ServerState(
            accepted: accepted,
            version: version ?? (accepted ? ConsentPolicy.currentVersion : nil),
            currentVersion: ConsentPolicy.currentVersion,
            stored: stored
        )
    }

    func testServerAgreementIsEnoughEvenWithNothingOnThisDevice() {
        XCTAssertEqual(ConsentPolicy.decide(localVersion: nil, pendingSync: false, server: server(accepted: true)), .accepted)
    }

    func testWithdrawalElsewhereOverridesTheLocalRecord() {
        let d = ConsentPolicy.decide(localVersion: ConsentPolicy.currentVersion, pendingSync: false, server: server(accepted: false))
        XCTAssertEqual(d, .needsConsent)
    }

    func testAnAgreementTheServerNeverReceivedIsResent() {
        let d = ConsentPolicy.decide(localVersion: ConsentPolicy.currentVersion, pendingSync: true, server: server(accepted: false))
        XCTAssertEqual(d, .resync)
    }

    func testOfflineOrNoTableFallsBackToTheDevice() {
        XCTAssertEqual(ConsentPolicy.decide(localVersion: ConsentPolicy.currentVersion, pendingSync: false, server: nil), .accepted)
        XCTAssertEqual(ConsentPolicy.decide(localVersion: nil, pendingSync: false, server: nil), .needsConsent)
        XCTAssertEqual(
            ConsentPolicy.decide(localVersion: ConsentPolicy.currentVersion, pendingSync: true, server: server(accepted: false, stored: false)),
            .accepted
        )
    }

    func testAnOlderNoticeVersionAsksAgain() {
        XCTAssertEqual(ConsentPolicy.decide(localVersion: "2025-01-01", pendingSync: false, server: nil), .needsConsent)
        XCTAssertFalse(ConsentPolicy.locallyAccepted("2025-01-01"))
        XCTAssertTrue(ConsentPolicy.locallyAccepted(ConsentPolicy.currentVersion))
    }

    func testRecognisesTheChatRouteConsentRefusal() {
        XCTAssertTrue(ConsentPolicy.isConsentRequired(#"{"error":"consent_required","currentVersion":"2026-10-05"}"#))
        XCTAssertFalse(ConsentPolicy.isConsentRequired(#"{"error":"something_else"}"#))
        XCTAssertFalse(ConsentPolicy.isConsentRequired("No chart. Complete intake first."))
    }

    func testServerStateDecodesTheRouteShape() throws {
        let json = #"{"accepted":false,"version":null,"currentVersion":"2026-10-05","stored":true}"#
        let state = try JSONDecoder().decode(ConsentPolicy.ServerState.self, from: Data(json.utf8))
        XCTAssertEqual(state, server(accepted: false))
    }

    func testAppAndServerAgreeOnTheNoticeVersion() throws {
        // lib/billing/consent.ts is the server's copy; a bump must touch both.
        let here = URL(fileURLWithPath: #filePath)
        let ts = here.deletingLastPathComponent().appendingPathComponent("../../../lib/billing/consent.ts").standardized
        guard let source = try? String(contentsOf: ts, encoding: .utf8) else { throw XCTSkip("server source not reachable") }
        XCTAssertTrue(source.contains(#"CONSENT_VERSION = "\#(ConsentPolicy.currentVersion)""#))
    }

    // MARK: Plan

    private let now = Date(timeIntervalSince1970: 1_790_000_000)

    func testAnUnexpiredPlusEntitlementIsPlus() {
        let e = EntitlementSnapshot(productID: PlusProducts.yearly, expirationDate: now.addingTimeInterval(86_400), revocationDate: nil)
        XCTAssertEqual(PlanMapper.plan(for: [e], now: now), .plus)
        XCTAssertEqual(PlanMapper.current([e], now: now), e)
    }

    func testExpiredRevokedUpgradedOrForeignEntitlementsAreFree() {
        let cases = [
            EntitlementSnapshot(productID: PlusProducts.monthly, expirationDate: now.addingTimeInterval(-1), revocationDate: nil),
            EntitlementSnapshot(productID: PlusProducts.monthly, expirationDate: now.addingTimeInterval(86_400), revocationDate: now),
            EntitlementSnapshot(productID: PlusProducts.monthly, expirationDate: now.addingTimeInterval(86_400), revocationDate: nil, isUpgraded: true),
            EntitlementSnapshot(productID: "com.example.other", expirationDate: now.addingTimeInterval(86_400), revocationDate: nil),
            EntitlementSnapshot(productID: PlusProducts.monthly, expirationDate: nil, revocationDate: nil),
        ]
        for e in cases { XCTAssertEqual(PlanMapper.plan(for: [e], now: now), .free, "\(e)") }
        XCTAssertEqual(PlanMapper.plan(for: [], now: now), .free)
    }

    func testTheLongestRunningEntitlementIsDescribed() {
        let monthly = EntitlementSnapshot(productID: PlusProducts.monthly, expirationDate: now.addingTimeInterval(86_400), revocationDate: nil)
        let yearly = EntitlementSnapshot(productID: PlusProducts.yearly, expirationDate: now.addingTimeInterval(86_400 * 300), revocationDate: nil)
        XCTAssertEqual(PlanMapper.current([monthly, yearly], now: now)?.productID, PlusProducts.yearly)
    }

    // MARK: Prices

    private let usd = Decimal.FormatStyle.Currency(code: "USD", locale: Locale(identifier: "en_US"))

    func testYearlyPerMonthEquivalent() {
        XCTAssertEqual(PlusPricing.perMonth(yearly: Decimal(string: "49.99")!, format: usd), "$4.17")
        XCTAssertEqual(PlusPricing.perMonth(yearly: 120, format: usd), "$10.00")
    }

    func testPerMonthUsesTheProductCurrency() {
        let inr = Decimal.FormatStyle.Currency(code: "INR", locale: Locale(identifier: "en_IN"))
        XCTAssertEqual(PlusPricing.perMonth(yearly: 4_800, format: inr), "₹400.00")
    }

    func testSavingsNeverOverstate() {
        XCTAssertEqual(PlusPricing.savingsPercent(monthly: Decimal(string: "6.99")!, yearly: Decimal(string: "49.99")!), 40)
        XCTAssertNil(PlusPricing.savingsPercent(monthly: 5, yearly: 60))
        XCTAssertNil(PlusPricing.savingsPercent(monthly: 5, yearly: 70))
    }

    func testProductIDsMatchTheStoreKitConfiguration() throws {
        let here = URL(fileURLWithPath: #filePath)
        let config = here.deletingLastPathComponent().appendingPathComponent("../Astrya.storekit").standardized
        guard let text = try? String(contentsOf: config, encoding: .utf8) else { throw XCTSkip("storekit file not reachable") }
        for id in PlusProducts.all { XCTAssertTrue(text.contains("\"\(id)\""), id) }
    }

    /// The alternates must match ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES
    /// in project.yml, or `setAlternateIconName` fails at runtime.
    func testAppIconChoicesMatchTheBuiltAlternates() {
        let built = Bundle.main.object(forInfoDictionaryKey: "CFBundleIcons") as? [String: Any]
        let alternates = (built?["CFBundleAlternateIcons"] as? [String: Any]).map { Set($0.keys) } ?? []
        let offered = Set(AppIconChoice.allCases.compactMap(\.iconName))
        XCTAssertEqual(offered, ["AppIcon-Lime", "AppIcon-Violet", "AppIcon-Bone"])
        XCTAssertEqual(alternates, offered)
        XCTAssertFalse(AppIconChoice.ember.needsPlus)
        XCTAssertTrue(AppIconChoice.allCases.filter { $0 != .ember }.allSatisfy(\.needsPlus))
        XCTAssertEqual(AppIconChoice(iconName: nil), .ember)
        XCTAssertEqual(AppIconChoice(iconName: "AppIcon-Bone"), .bone)
    }
}
