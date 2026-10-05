import StoreKit
import SwiftUI

/// The Astrya Plus sheet: what Plus is (honestly: support), both prices with
/// the yearly per-month figure beneath, the renewal terms Apple requires,
/// Restore purchases, Terms and Privacy, and for subscribers "Manage
/// subscription". Opened only from a voluntary entry (`PlanRow`); nothing in
/// the app is gated behind it.
struct PaywallView: View {
    @State var store: PlusStore = .shared
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var selected = PlusProducts.yearly
    @State private var showManage = false

    var body: some View {
        ZStack(alignment: .top) {
            Atmosphere(mood: .lime)
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    ScreenHeader(
                        eyebrow: PlusCopy.eyebrow,
                        title: store.plan == .plus ? "Thank you" : PlusCopy.title,
                        blurb: store.plan == .plus
                            ? "You're on Plus. Every reading is the same for everyone; your support keeps it that way."
                            : PlusCopy.blurb,
                        titleSize: 44
                    )
                    benefits
                    if store.plan == .plus {
                        memberCard
                    } else {
                        options
                    }
                    if let message = store.message {
                        BrutNotice(text: message, tone: .info)
                    }
                    footerLinks
                }
                .padding(.horizontal, 24)
                .padding(.top, 72)
                .padding(.bottom, 24)
                .frame(maxWidth: 520)
                .frame(maxWidth: .infinity)
            }
            .scrollIndicators(.hidden)
            .safeAreaInset(edge: .bottom) {
                if store.plan != .plus { purchaseBar }
            }

            HStack {
                Spacer()
                CircleButton(systemImage: "xmark", label: "Close", size: 38) { dismiss() }
            }
            .padding(.horizontal, 20)
            .padding(.top, 14)
        }
        .presentationBackground(Theme.bg)
        .manageSubscriptionsSheet(isPresented: $showManage)
        .task {
            store.start()
            if store.loadState == .idle || store.loadState == .failed { await store.loadProducts() }
        }
    }

    // MARK: Benefits

    private var benefits: some View {
        VStack(spacing: 0) {
            BrutDivider()
            ForEach(Array(PlusCopy.benefits.enumerated()), id: \.element.id) { index, benefit in
                HStack(alignment: .firstTextBaseline, spacing: 14) {
                    Text(String(format: "%02d.", index + 1))
                        .font(.brutMono(13, weight: .semibold))
                        .foregroundStyle(Theme.accent)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(benefit.title)
                            .font(.brutTitle(17))
                            .foregroundStyle(Theme.fg)
                        Text(benefit.detail)
                            .font(.brutBody(14))
                            .foregroundStyle(Theme.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                }
                .padding(.vertical, 16)
                .accessibilityElement(children: .combine)
                BrutDivider()
            }
        }
    }

    // MARK: Options

    private struct Option: Identifiable {
        let id: String
        let label: String
        let price: String
        let per: String
        let note: String?
    }

    private var optionList: [Option] {
        let yearly = store.yearly
        let monthly = store.monthly
        var yearlyNote: String?
        if let yearly {
            let perMonth = PlusPricing.perMonth(yearly: yearly.price, format: yearly.priceFormatStyle)
            let saving = monthly.flatMap { PlusPricing.savingsPercent(monthly: $0.price, yearly: yearly.price) }
            yearlyNote = "\(perMonth) a month" + (saving.map { " · save \($0)%" } ?? "")
        } else {
            yearlyNote = "$4.17 a month · save 40%"
        }
        return [
            Option(id: PlusProducts.yearly, label: "Yearly", price: yearly?.displayPrice ?? PlusCopy.fallbackYearly, per: "year", note: yearlyNote),
            Option(id: PlusProducts.monthly, label: "Monthly", price: monthly?.displayPrice ?? PlusCopy.fallbackMonthly, per: "month", note: nil),
        ]
    }

    private var options: some View {
        VStack(spacing: 12) {
            ForEach(optionList) { option in
                let active = option.id == selected
                Button {
                    withAnimation(Theme.snap) { selected = option.id }
                } label: {
                    HStack(alignment: .center, spacing: 14) {
                        ZStack {
                            Circle().strokeBorder(active ? Theme.accent : Theme.line, lineWidth: active ? 2 : 1)
                            if active { Circle().fill(Theme.accent).padding(5) }
                        }
                        .frame(width: 22, height: 22)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(option.label)
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(Theme.fg)
                            if let note = option.note {
                                Text(note)
                                    .font(.brutMono(12))
                                    .foregroundStyle(Theme.muted)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                        Spacer(minLength: 8)
                        HStack(alignment: .lastTextBaseline, spacing: 4) {
                            Text(option.price)
                                .font(.brutDisplay(26))
                                .tracking(-0.8)
                                .foregroundStyle(Theme.fg)
                                .lineLimit(1)
                                .fixedSize()
                            Text("/\(option.per)")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundStyle(Theme.muted)
                                .fixedSize()
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.vertical, 16)
                    .frame(maxWidth: .infinity)
                    .brutBordered(
                        fill: active ? Theme.accent.opacity(0.08) : Theme.fg.opacity(0.04),
                        line: active ? Theme.accent : Theme.line,
                        radius: Theme.cornerRadius + 4,
                        lineWidth: active ? 2 : 1
                    )
                    .contentShape(Rectangle())
                }
                .buttonStyle(DipButtonStyle())
                .accessibilityLabel("\(option.label), \(option.price) per \(option.per)\(option.note.map { ", \($0)" } ?? "")")
                .accessibilityAddTraits(active ? .isSelected : [])
            }
            if store.loadState == .failed {
                BrutNotice(text: "Prices couldn't be loaded from the App Store. Check your connection.", tone: .info)
            }
        }
    }

    private var selectedProduct: Product? { store.products.first { $0.id == selected } }
    private var selectedPeriod: String { selected == PlusProducts.yearly ? "year" : "month" }

    private var purchaseBar: some View {
        VStack(spacing: 10) {
            SancharaPrimaryButton(
                title: selectedProduct.map { "Subscribe for \($0.displayPrice)/\(selectedPeriod)" }
                    ?? (store.loadState == .failed ? "Prices unavailable" : "Loading prices…"),
                isLoading: store.isPurchasing,
                kind: .accent
            ) {
                if let product = selectedProduct { Task { await store.purchase(product) } }
            }
            .disabled(selectedProduct == nil)
            .opacity(selectedProduct == nil ? 0.6 : 1)
            Text(PlusCopy.renewalDisclosure(period: selectedPeriod))
                .font(.system(size: 11))
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 24)
        .padding(.top, 14)
        .padding(.bottom, 6)
        .frame(maxWidth: 520)
        .frame(maxWidth: .infinity)
        .background {
            LinearGradient(
                stops: [.init(color: Theme.bg.opacity(0), location: 0), .init(color: Theme.bg, location: 0.25)],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()
        }
    }

    // MARK: Subscriber

    private var memberCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            DataRow(label: "Plan", value: store.current?.productID == PlusProducts.monthly ? "Monthly" : "Yearly", valueSize: 22)
            if let date = store.current?.expirationDate {
                DataRow(label: "Renews or ends", value: date.formatted(date: .abbreviated, time: .omitted), valueSize: 22)
            }
            SancharaPrimaryButton(title: "Manage subscription", kind: .secondary) { showManage = true }
                .padding(.top, 16)
        }
    }

    // MARK: Links

    private var footerLinks: some View {
        VStack(spacing: 4) {
            Button {
                Task { await store.restore() }
            } label: {
                HStack(spacing: 8) {
                    if store.isRestoring { ProgressView().tint(Theme.fg) }
                    Text("Restore purchases")
                }
            }
            .buttonStyle(BrutButtonStyle(kind: .quiet, fullWidth: false))
            .disabled(store.isRestoring)
            HStack(spacing: 18) {
                Button("Terms of Use") { openURL(PlusCopy.termsURL) }
                Button("Privacy Policy") { openURL(PlusCopy.privacyURL) }
            }
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(Theme.muted)
            .frame(minHeight: 36)
        }
        .frame(maxWidth: .infinity)
    }
}
