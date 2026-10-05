import Foundation
import StoreKit
import Supabase

/// Astrya Plus through StoreKit 2.
///
/// Loads the two products, buys and restores, listens to
/// `Transaction.updates` (renewals, refunds, Ask to Buy approvals, purchases
/// made on another device), and works out the plan from
/// `Transaction.currentEntitlements`. Every verified transaction's JWS is
/// posted to `POST /api/billing/apple`, which checks Apple's signature itself
/// before it records anything — StoreKit's on-device verification decides
/// what the phone shows, the server's decides what the account is on.
///
/// Plus gates nothing; nothing in the app reads `plan` except the paywall,
/// `PlanRow`, and the thank-you badge.
@Observable
@MainActor
final class PlusStore {
    static let shared = PlusStore()

    enum LoadState: Equatable { case idle, loading, loaded, failed }

    private(set) var products: [Product] = []
    private(set) var loadState: LoadState = .idle
    private(set) var plan: SubscriptionPlan = .free
    private(set) var current: EntitlementSnapshot?
    private(set) var isPurchasing = false
    private(set) var isRestoring = false
    var message: String?

    private var updates: Task<Void, Never>?
    private var postedLaunchEntitlements = false

    var monthly: Product? { products.first { $0.id == PlusProducts.monthly } }
    var yearly: Product? { products.first { $0.id == PlusProducts.yearly } }

    /// Call once at launch (or when the paywall first opens). Idempotent.
    func start() {
        guard updates == nil else { return }
        updates = Task { [weak self] in
            for await result in Transaction.updates {
                await self?.handle(result)
            }
        }
        Task {
            await refreshEntitlements(post: true)
            await loadProducts()
        }
    }

    func loadProducts() async {
        guard loadState != .loading else { return }
        loadState = .loading
        do {
            let found = try await Product.products(for: PlusProducts.all)
            products = found.sorted { PlusProducts.all.firstIndex(of: $0.id) ?? 0 < PlusProducts.all.firstIndex(of: $1.id) ?? 0 }
            loadState = found.isEmpty ? .failed : .loaded
        } catch {
            loadState = .failed
        }
    }

    func purchase(_ product: Product) async {
        guard !isPurchasing else { return }
        isPurchasing = true
        message = nil
        defer { isPurchasing = false }
        var options: Set<Product.PurchaseOption> = []
        // Ties the purchase to this Astrya account, so the server can refuse
        // the same receipt being claimed by another account.
        if let uid = try? await Supa.client.auth.session.user.id {
            options.insert(.appAccountToken(uid))
        }
        do {
            switch try await product.purchase(options: options) {
            case .success(let verification):
                await handle(verification)
                if plan == .plus { message = "Thank you. You're on Plus." }
            case .pending:
                message = "Waiting for approval. Plus starts once it's approved."
            case .userCancelled:
                break
            @unknown default:
                break
            }
        } catch {
            message = "The purchase didn't go through. You haven't been charged."
        }
    }

    /// "Restore purchases": asks the App Store for this Apple ID's
    /// transactions, then re-posts the current entitlement.
    func restore() async {
        guard !isRestoring else { return }
        isRestoring = true
        message = nil
        defer { isRestoring = false }
        do {
            try await AppStore.sync()
        } catch {
            // Cancelled sign-in prompt, or offline: fall through to what is
            // already on the device.
        }
        await refreshEntitlements(post: true)
        message = plan == .plus ? "Plus restored. Thank you." : "No Astrya Plus subscription was found for this Apple ID."
    }

    func refreshEntitlements(post: Bool = false) async {
        var snapshots: [EntitlementSnapshot] = []
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result, PlusProducts.isPlus(transaction.productID) else { continue }
            snapshots.append(Self.snapshot(transaction))
            if post || !postedLaunchEntitlements {
                await send(result.jwsRepresentation)
            }
        }
        postedLaunchEntitlements = true
        plan = PlanMapper.plan(for: snapshots)
        current = PlanMapper.current(snapshots)
    }

    private func handle(_ result: VerificationResult<Transaction>) async {
        // An unverified transaction is not acted on and not finished; StoreKit
        // offers it again.
        guard case .verified(let transaction) = result else { return }
        if PlusProducts.isPlus(transaction.productID) {
            await send(result.jwsRepresentation)
        }
        await transaction.finish()
        await refreshEntitlements()
    }

    private func send(_ jws: String) async {
        // Signed out, offline, or Xcode's local StoreKit testing (which the
        // server rightly refuses): the phone's own verification still shows
        // the plan, and the next launch posts again.
        try? await BillingAPI.postTransaction(jws: jws)
    }

    static func snapshot(_ t: Transaction) -> EntitlementSnapshot {
        EntitlementSnapshot(
            productID: t.productID,
            expirationDate: t.expirationDate,
            revocationDate: t.revocationDate,
            isUpgraded: t.isUpgraded
        )
    }
}
