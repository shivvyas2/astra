import SwiftUI

/// The AI consent screen: what is sent, to whom, what is kept, and the
/// user's choices — then "Agree and continue" or "Not now". "Not now" is
/// never a dead end: it explains why readings need this and offers the
/// notice again (or signing out).
///
/// `mode: .review` is the same notice opened from Profile, with no decision
/// to make.
struct ConsentView: View {
    enum Mode { case decide, review }

    var mode: Mode = .decide
    var isSaving = false
    var errorMessage: String? = nil
    var onAgree: () -> Void = {}
    var onSignOut: () -> Void = {}

    @State private var declined = false
    @Environment(\.openURL) private var openURL

    var body: some View {
        ZStack {
            Atmosphere(mood: .dusk)
            if declined {
                declinedBody
                    .transition(.opacity)
            } else {
                notice
                    .transition(.opacity)
            }
        }
        .animation(Theme.ease, value: declined)
    }

    // MARK: Notice

    private var notice: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                ScreenHeader(
                    eyebrow: ConsentCopy.eyebrow,
                    title: ConsentCopy.title,
                    blurb: ConsentCopy.intro,
                    titleSize: 40
                )

                VStack(spacing: 0) {
                    BrutDivider()
                    ForEach(ConsentCopy.sections) { section in
                        sectionRow(section)
                        BrutDivider()
                    }
                }

                Button {
                    openURL(ConsentCopy.privacyURL)
                } label: {
                    HStack(spacing: 6) {
                        Text("Read the full privacy policy")
                        Image(systemName: "arrow.up.right").font(.system(size: 11, weight: .semibold))
                    }
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.fg)
                    .frame(minHeight: 44)
                }
                .buttonStyle(DipButtonStyle())
            }
            .padding(.horizontal, 24)
            .padding(.top, 24)
            .padding(.bottom, 16)
            .frame(maxWidth: 520)
            .frame(maxWidth: .infinity)
        }
        .scrollIndicators(.hidden)
        .safeAreaInset(edge: .bottom) {
            if mode == .decide { decisionBar }
        }
    }

    private func sectionRow(_ section: ConsentCopy.Section) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 16) {
            Text(section.label)
                .font(.brutMono(11, weight: .bold))
                .textCase(.uppercase)
                .tracking(1.3)
                .foregroundStyle(Theme.accent)
                .frame(width: 52, alignment: .leading)
            VStack(alignment: .leading, spacing: 10) {
                Text(section.title)
                    .font(.brutTitle(18))
                    .foregroundStyle(Theme.fg)
                ForEach(section.points, id: \.self) { point in
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Circle()
                            .fill(Theme.fg.opacity(0.5))
                            .frame(width: 4, height: 4)
                            .alignmentGuide(.firstTextBaseline) { d in d[VerticalAlignment.center] + 4 }
                        Text(point)
                            .font(.brutBody(14))
                            .foregroundStyle(Theme.muted)
                            .lineSpacing(2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 18)
        .accessibilityElement(children: .combine)
    }

    private var decisionBar: some View {
        VStack(spacing: 10) {
            if let errorMessage {
                BrutNotice(text: errorMessage)
            }
            SancharaPrimaryButton(title: ConsentCopy.agree, isLoading: isSaving, action: onAgree)
            SancharaSecondaryButton(title: ConsentCopy.notNow) { declined = true }
                .disabled(isSaving)
        }
        .padding(.horizontal, 24)
        .padding(.top, 14)
        .padding(.bottom, 8)
        .frame(maxWidth: 520)
        .frame(maxWidth: .infinity)
        .background {
            LinearGradient(
                stops: [.init(color: Theme.bg.opacity(0), location: 0), .init(color: Theme.bg, location: 0.28)],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()
        }
    }

    // MARK: Not now

    private var declinedBody: some View {
        VStack(alignment: .leading, spacing: 28) {
            Spacer(minLength: 0)
            ScreenHeader(
                eyebrow: "Nothing was sent",
                title: ConsentCopy.declinedTitle,
                blurb: ConsentCopy.declinedBody,
                accent: Theme.ember,
                titleSize: 40
            )
            VStack(spacing: 10) {
                SancharaPrimaryButton(title: ConsentCopy.reviewAgain) { declined = false }
                Button("Sign out", action: onSignOut)
                    .buttonStyle(BrutButtonStyle(kind: .quiet))
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 24)
        .frame(maxWidth: 520)
        .frame(maxWidth: .infinity)
    }
}

/// Shows the consent screen in place of `content` until the account has
/// agreed to the current notice. Wraps the signed-in app in RootView.
struct ConsentGate<Content: View>: View {
    @ViewBuilder var content: () -> Content

    @Environment(AuthStore.self) private var auth
    @State private var consent = ConsentStore.shared

    var body: some View {
        Group {
            switch consent.state {
            case .checking:
                LoadingScreen()
            case .needed:
                ConsentView(
                    isSaving: consent.isSaving,
                    errorMessage: consent.errorMessage,
                    onAgree: { Task { await consent.agree() } },
                    onSignOut: { Task { await auth.signOut() } }
                )
            case .accepted:
                content()
            }
        }
        .task { await consent.check() }
    }
}
