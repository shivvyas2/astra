import SwiftUI

struct RootView: View {
    @Environment(AuthStore.self) private var auth

    var body: some View {
        Group {
            switch auth.state {
            case .loading:
                LoadingScreen()
            case .signedOut:
                AuthView()
            case .awaitingCode(let email, let purpose):
                VerifyCodeView(email: email, purpose: purpose)
            case .signedIn:
                SignedInView()
            }
        }
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
                    Theme.bg.ignoresSafeArea()
                    VStack(spacing: 16) {
                        BrutNotice(text: message, tone: .info)
                        SancharaSecondaryButton(title: "Try again") {
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
        .task { await profile.load() }
    }
}

struct LoadingScreen: View {
    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            ProgressView().tint(Theme.muted)
        }
    }
}


