import SwiftUI

struct RootView: View {
    @Environment(AuthStore.self) private var auth

    var body: some View {
        Group {
            switch auth.state {
            case .loading:
                ZStack {
                    Theme.bg.ignoresSafeArea()
                    ProgressView().tint(Theme.muted)
                }
            case .signedOut:
                AuthView()
            case .awaitingConfirmation(let email):
                AwaitingConfirmationView(email: email)
            case .signedIn:
                SignedInPlaceholderView()
            }
        }
        .task { await auth.start() }
        .onOpenURL { url in
            Task { await auth.handle(url: url) }
        }
    }
}

/// Stands in until intake and chat land in the next task.
struct SignedInPlaceholderView: View {
    @Environment(AuthStore.self) private var auth

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            VStack(spacing: 16) {
                Text("Signed in").eyebrow()
                Text("ASTRA")
                    .font(.system(size: 48, weight: .bold))
                    .foregroundStyle(Theme.fg)
                Button("Sign out") { Task { await auth.signOut() } }
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.muted)
                    .padding(.top, 8)
            }
        }
    }
}
