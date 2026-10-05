import SwiftUI

/// The You tab's entry to Astrya Plus: "Support Astrya", or a thank-you for
/// subscribers. Opens the paywall sheet. Styled like the Profile blocks.
///
/// Place in ProfileView's stack, e.g. before `accountBlock`:
///
///     PlanRow()
struct PlanRow: View {
    @State private var store = PlusStore.shared
    @State private var showPaywall = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(PlusCopy.eyebrow).eyebrow()
                .padding(.bottom, 4)
            BrutDivider()
            Button {
                showPaywall = true
            } label: {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(spacing: 8) {
                            Text(store.plan == .plus ? "Plus member" : PlusCopy.title)
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(Theme.fg)
                            if store.plan == .plus { PlusBadge() }
                        }
                        Text(store.plan == .plus
                             ? "Thank you for supporting Astrya. Manage or cancel here."
                             : "Readings stay free and unlimited. Plus helps pay for them.")
                            .font(.brutBody(13))
                            .foregroundStyle(Theme.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 8)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.muted)
                        .accessibilityHidden(true)
                }
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .padding(.vertical, 12)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            BrutDivider()
        }
        .task { store.start() }
        .sheet(isPresented: $showPaywall) {
            PaywallView()
        }
    }
}

/// The thank-you mark: a small lime "PLUS" tag. Shown beside the name on the
/// You screen for subscribers (`if PlusStore.shared.plan == .plus { PlusBadge() }`).
struct PlusBadge: View {
    var body: some View {
        BrutTag(text: "Plus", fill: Theme.accent, textColor: Theme.ink)
            .accessibilityLabel("Astrya Plus member")
    }
}
