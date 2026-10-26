import SwiftUI

struct RootView: View {
    @Environment(AuthStore.self) private var auth
    /// Read here so a change of language redraws the whole app at once.
    private let language = AppLanguage.shared

    var body: some View {
        Group {
            switch auth.state {
            case .loading:
                LoadingScreen()
            case .signedOut:
                AuthView()
            case .awaitingCode(let destination):
                VerifyCodeView(destination: destination)
            case .signedIn:
                SignedInView()
            }
        }
        // Every `Text("…")` below looks its words up in this locale, so the
        // Profile language chip switches the app without a relaunch.
        .environment(\.locale, language.locale)
        .task { await auth.start() }
        .onOpenURL { url in
            // Two kinds of URL arrive here: Supabase's auth callback, and our
            // own scheme from a widget tap. Only the first is for the auth
            // store; handing it a sanchara:// URL would show "link expired".
            if DeepLink.isDeepLink(url) {
                DeepLink.shared.handle(url: url)
            } else {
                Task { await auth.handle(url: url) }
            }
        }
    }
}

/// Sends a signed-in user to intake or to their reading, depending on whether
/// a chart has been computed for them yet.
struct SignedInView: View {
    @Environment(AuthStore.self) private var auth
    @State private var profile = ProfileStore()

    var body: some View {
        // AI consent comes before intake and the first reading (Features/Consent).
        ConsentGate {
        Group {
            switch profile.state {
            case .loading:
                LoadingScreen()
            case .needsIntake:
                IntakeView { await profile.load() }
            case .ready:
                MainTabView(profile: profile)
            case .failed(let message):
                ZStack {
                    Atmosphere(mood: .dusk)
                    VStack(spacing: 16) {
                        BrutNotice(text: message, tone: .info)
                        SancharaSecondaryButton(title: L10n.string("Try again")) {
                            Task { await profile.load() }
                        }
                        Button("Sign out") { Task { await auth.signOut() } }
                            .buttonStyle(BrutButtonStyle(kind: .quiet))
                    }
                    .frame(maxWidth: 320)
                    .padding(.horizontal, 24)
                }
            }
        }
        }
        .task { await profile.load() }
        // StoreKit: listen for transactions and sync the entitlement (Features/Billing).
        .task { if PlusStore.isEnabled { PlusStore.shared.start() } }
    }
}

struct LoadingScreen: View {
    var body: some View {
        ZStack {
            Atmosphere(mood: .dusk)
            // The app icon's wordmark, centred and sized like the launch
            // screen's, so opening the app continues from the icon tapped
            // without the logo jumping.
            Image("Logo")
                .renderingMode(.template)
                .resizable()
                .scaledToFit()
                .frame(width: 132)
                .foregroundStyle(Theme.accent)
                .overlay(alignment: .bottom) {
                    ProgressView()
                        .tint(Theme.accent)
                        .offset(y: 56)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Loading Astrya")
        }
    }
}
