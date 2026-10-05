import SwiftUI

/// The Profile entry for AI consent: opens the notice, with a way to
/// withdraw. Styled like the other Profile blocks (eyebrow, rule, row).
///
/// Place in ProfileView's stack, e.g. right after `memoryBlock`:
///
///     PrivacyConsentRow()
struct PrivacyConsentRow: View {
    @State private var showNotice = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("AI and your data").eyebrow()
                .padding(.bottom, 4)
            BrutDivider()
            Button {
                showNotice = true
            } label: {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("What's shared with Anthropic")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(Theme.fg)
                        Text("What readings send, what's kept, and how to withdraw.")
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
        .sheet(isPresented: $showNotice) {
            ConsentReviewSheet()
        }
    }
}

/// The notice opened from Profile, with "Withdraw consent" at its foot.
struct ConsentReviewSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var consent = ConsentStore.shared
    @State private var confirmWithdraw = false

    var body: some View {
        ConsentView(mode: .review)
            .safeAreaInset(edge: .top) {
                HStack {
                    Spacer()
                    CircleButton(systemImage: "xmark", label: "Close", size: 38) { dismiss() }
                }
                .padding(.horizontal, 20)
                .padding(.top, 12)
            }
            .safeAreaInset(edge: .bottom) {
                VStack(spacing: 10) {
                    if let error = consent.errorMessage { BrutNotice(text: error) }
                    SancharaPrimaryButton(title: "Withdraw consent", isLoading: consent.isSaving, kind: .secondary) {
                        confirmWithdraw = true
                    }
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 12)
                .background(Theme.bg.opacity(0.92).ignoresSafeArea())
            }
            .presentationBackground(Theme.bg)
            .alert("Withdraw consent?", isPresented: $confirmWithdraw) {
                Button("Cancel", role: .cancel) {}
                Button("Withdraw", role: .destructive) {
                    Task {
                        if await consent.withdraw() { dismiss() }
                    }
                }
            } message: {
                Text("Readings pause until you agree again. Nothing already stored is deleted; use What Astrya knows or Delete account for that.")
            }
    }
}
