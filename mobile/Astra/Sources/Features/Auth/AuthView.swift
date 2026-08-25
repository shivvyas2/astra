import SwiftUI

/// Ported from `components/AuthForm.tsx` — same copy, same hierarchy.
struct AuthView: View {
    @Environment(AuthStore.self) private var auth
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                Text("Welcome to Astra")
                    .font(.system(size: 30, weight: .light))
                    .tracking(-0.5)
                    .foregroundStyle(Theme.fg)

                Text("Your real birth chart, read by the stars.")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.muted)
                    .padding(.top, 8)

                if let error = auth.errorMessage {
                    Text(error)
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.accent)
                        .multilineTextAlignment(.center)
                        .padding(.top, 16)
                }
                if let notice = auth.notice {
                    Text(notice)
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.muted)
                        .padding(.top, 16)
                }

                VStack(spacing: 12) {
                    AstraField(
                        placeholder: "you@email.com",
                        text: $email,
                        keyboard: .emailAddress,
                        textContentType: .username
                    )
                    AstraField(
                        placeholder: "password",
                        text: $password,
                        isSecure: true,
                        textContentType: .password
                    )
                    AstraPrimaryButton(title: "Continue", isLoading: auth.isWorking) {
                        Task { await auth.authenticate(email: email, password: password) }
                    }
                    AstraSecondaryButton(title: "Email me a magic link instead") {
                        Task { await auth.sendMagicLink(email: email) }
                    }
                }
                .padding(.top, 24)

                Spacer()
                Spacer()
            }
            .frame(maxWidth: 380)
            .padding(.horizontal, 24)
        }
    }
}

/// Mirrors the web's `/check-email` screen.
struct AwaitingConfirmationView: View {
    let email: String
    @Environment(AuthStore.self) private var auth

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            VStack(spacing: 12) {
                Text("Check your email").eyebrow()
                Text("Confirm your address")
                    .font(.system(size: 28, weight: .light))
                    .foregroundStyle(Theme.fg)
                Text("We sent a link to \(email). Open it on this device and you'll come straight back here.")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
                    .padding(.top, 4)
                Button("Use a different email") {
                    Task { await auth.signOut() }
                }
                .font(.system(size: 14))
                .foregroundStyle(Theme.muted)
                .padding(.top, 16)
            }
            .padding(.horizontal, 32)
        }
    }
}
