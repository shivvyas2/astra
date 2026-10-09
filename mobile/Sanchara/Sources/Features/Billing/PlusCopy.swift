import Foundation

/// The words on the Plus paywall.
///
/// Every line must be true on the day it ships. Plus never gates or caps
/// readings — they are unlimited for everyone and Deep readings are open to
/// all — so what it offers is support and cosmetic extras (alternate app
/// icons, the badge). Do not add "more readings" or "unlock" lines. Mirror edits in lib/billing/copy.ts
/// (`PLUS_BENEFITS`).
enum PlusCopy {
    struct Benefit: Identifiable {
        let title: String
        let detail: String
        var id: String { title }
    }

    static let benefits: [Benefit] = [
        Benefit(
            title: "Keep Astrya independent",
            detail: "Plus pays for the model calls and the ephemeris behind every reading. No ads, no data sales."
        ),
        Benefit(
            title: "Three more app icons",
            detail: "The Astrya mark in lime, violet or bone on your home screen. Change it any time under You → App icon."
        ),
        Benefit(
            title: "A thank-you mark",
            detail: "A Plus badge on your profile. Every reading stays free and unlimited for everyone."
        ),
    ]

    static let eyebrow = "Astrya Plus"
    static let title = "Support Astrya"
    static let blurb = "Every reading is free and unlimited, Deep readings included. Plus is a way to keep it that way."

    /// Shown before StoreKit has answered, and in previews. The real prices
    /// come from the App Store in the buyer's currency.
    static let fallbackMonthly = "$6.99"
    static let fallbackYearly = "$49.99"

    /// Apple's standard licence agreement, used as the Terms of Use.
    static let termsURL = URL(string: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/")!
    static let privacyURL = AppConfig.apiBaseURL.appendingPathComponent("privacy")

    /// The auto-renewal disclosure Apple requires next to the purchase button.
    static func renewalDisclosure(period: String) -> String {
        "Payment is charged to your Apple ID when you confirm. Plus renews automatically every \(period) at the same price unless you cancel at least 24 hours before the period ends. Cancel any time in Settings, under your name, then Subscriptions."
    }
}
