import Foundation

/// The Astrya Plus products. Keep in step with `PLUS_PRODUCT_IDS` in
/// lib/billing/apple.ts, `Astrya.storekit`, and App Store Connect.
enum PlusProducts {
    static let monthly = "com.shivvyas.astra.plus.monthly"
    static let yearly = "com.shivvyas.astra.plus.yearly"
    /// Yearly first: it is the better price, and the paywall lists it first.
    static let all = [yearly, monthly]
    static let groupName = "Astrya Plus"

    static func isPlus(_ productID: String) -> Bool { all.contains(productID) }
}

/// The plan an account is on. Plus gates nothing today; it is shown as a
/// thank-you, and is what the owner may later attach benefits to.
enum SubscriptionPlan: String, Codable, Equatable {
    case free
    case plus
}

/// What StoreKit says about one entitlement, reduced to what decides the
/// plan, so the mapping can be tested without StoreKit.
struct EntitlementSnapshot: Equatable {
    let productID: String
    let expirationDate: Date?
    let revocationDate: Date?
    /// A transaction superseded by an upgrade inside the same group.
    var isUpgraded = false
}

enum PlanMapper {
    /// Plus when any Astrya Plus entitlement is unrevoked, not upgraded away,
    /// and unexpired. `Transaction.currentEntitlements` already includes the
    /// billing grace period, so a lapsed-but-in-grace subscription maps to Plus.
    static func plan(for entitlements: [EntitlementSnapshot], now: Date = .now) -> SubscriptionPlan {
        let active = entitlements.contains { e in
            PlusProducts.isPlus(e.productID)
                && e.revocationDate == nil
                && !e.isUpgraded
                && (e.expirationDate.map { $0 > now } ?? false)
        }
        return active ? .plus : .free
    }

    /// The entitlement to describe ("Yearly, renews 5 Oct 2027"): the one
    /// that runs longest.
    static func current(_ entitlements: [EntitlementSnapshot], now: Date = .now) -> EntitlementSnapshot? {
        entitlements
            .filter { PlusProducts.isPlus($0.productID) && $0.revocationDate == nil && !$0.isUpgraded && ($0.expirationDate ?? .distantPast) > now }
            .max { ($0.expirationDate ?? .distantPast) < ($1.expirationDate ?? .distantPast) }
    }
}

/// Price arithmetic for the paywall. The billed amount is always shown in
/// full; the per-month figure is the subordinate line under it, as Apple asks.
enum PlusPricing {
    /// "$4.17" for a $49.99 year: the yearly price over twelve, in the
    /// product's own currency format.
    static func perMonth(yearly price: Decimal, format: Decimal.FormatStyle.Currency) -> String {
        (price / 12).formatted(format)
    }

    /// Whole percent saved by paying yearly instead of twelve months, rounded
    /// down so it never overstates. 40 for $49.99 against $6.99. Nil when
    /// there is no saving.
    static func savingsPercent(monthly: Decimal, yearly: Decimal) -> Int? {
        let fullYear = monthly * 12
        guard fullYear > 0, yearly < fullYear else { return nil }
        let saved = NSDecimalNumber(decimal: (fullYear - yearly) / fullYear * 100).doubleValue
        let percent = Int(saved.rounded(.down))
        return percent > 0 ? percent : nil
    }
}
