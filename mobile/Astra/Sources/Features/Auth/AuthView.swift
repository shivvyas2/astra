import SwiftUI

/// Sign in and sign up.
///
/// The two are separate, labelled paths rather than the web's one "smart" form:
/// on a phone, being told "incorrect password" beats silently attempting to
/// create a second account. A device that has never signed in opens on sign-up.
struct AuthView: View {
    enum Mode: String, CaseIterable {
        case signUp
        case signIn

        var label: String { self == .signUp ? "Create account" : "Sign in" }
        var title: String { self == .signUp ? "Create your account" : "Welcome back" }
        var subtitle: String {
            self == .signUp
                ? "One email, one password, and we'll build your real birth chart next."
                : "Your real birth chart, read by the stars."
        }
        var cta: String { self == .signUp ? "Create account" : "Sign in" }
    }

    @Environment(AuthStore.self) private var auth
    @State private var mode: Mode = AuthStore.hasSignedInBefore ? .signIn : .signUp
    @State private var email = ""
    @State private var password = ""
    @FocusState private var focus: Field?

    private enum Field { case email, password }

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 0) {
                    Spacer(minLength: 60)

                    modePicker

                    Text(mode.title)
                        .font(.system(size: 30, weight: .light))
                        .tracking(-0.5)
                        .foregroundStyle(Theme.fg)
                        .padding(.top, 28)

                    Text(mode.subtitle)
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.muted)
                        .multilineTextAlignment(.center)
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
                            .multilineTextAlignment(.center)
                            .padding(.top, 16)
                    }

                    VStack(spacing: 12) {
                        AppleSignInButton()

                        HStack(spacing: 10) {
                            Rectangle().fill(Theme.hairline).frame(height: 1)
                            Text("or")
                                .font(.system(size: 12))
                                .foregroundStyle(Theme.muted)
                            Rectangle().fill(Theme.hairline).frame(height: 1)
                        }
                        .padding(.vertical, 2)

                        AstraField(
                            placeholder: "you@email.com",
                            text: $email,
                            keyboard: .emailAddress,
                            textContentType: .username
                        )
                        .focused($focus, equals: .email)

                        VStack(alignment: .leading, spacing: 6) {
                            AstraSecureField(
                                placeholder: "password",
                                text: $password,
                                textContentType: mode == .signUp ? .newPassword : .password
                            )
                            .focused($focus, equals: .password)

                            if mode == .signUp {
                                Text("At least \(AuthStore.minimumPasswordLength) characters.")
                                    .font(.system(size: 12))
                                    .foregroundStyle(
                                        password.isEmpty || password.count >= AuthStore.minimumPasswordLength
                                            ? Theme.muted.opacity(0.8)
                                            : Theme.accent
                                    )
                            }
                        }

                        AstraPrimaryButton(title: mode.cta, isLoading: auth.isWorking) {
                            submit()
                        }

                        AstraSecondaryButton(title: magicLinkLabel) {
                            focus = nil
                            Task { await auth.sendMagicLink(email: email) }
                        }
                    }
                    .padding(.top, 24)

                    Button(action: switchMode) {
                        Text(mode == .signUp ? "Already have an account?  " : "New to Astra?  ")
                            .foregroundStyle(Theme.muted)
                            + Text(mode == .signUp ? "Sign in" : "Create one")
                            .foregroundStyle(Theme.fg)
                    }
                    .font(.system(size: 14))
                    .padding(.top, 20)

                    Spacer(minLength: 40)
                }
                .frame(maxWidth: 380)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 24)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .onChange(of: auth.shouldSwitchToSignIn) { _, shouldSwitch in
            // Sign-up found an existing account: move them to the right form
            // with the email they already typed still in place.
            if shouldSwitch { mode = .signIn }
        }
    }

    private var magicLinkLabel: String {
        mode == .signUp ? "Or continue with an email link" : "Forgot password? Email me a link"
    }

    private var modePicker: some View {
        HStack(spacing: 4) {
            ForEach(Mode.allCases, id: \.rawValue) { option in
                Button {
                    guard mode != option else { return }
                    mode = option
                    auth.clearMessages()
                } label: {
                    Text(option.label)
                        .font(.system(size: 14, weight: mode == option ? .medium : .regular))
                        .foregroundStyle(mode == option ? Theme.fg : Theme.muted)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                        .background(mode == option ? Color.white.opacity(0.08) : .clear)
                        .clipShape(RoundedRectangle(cornerRadius: 7))
                }
            }
        }
        .padding(3)
        .background(Theme.fieldFill)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(Theme.hairline, lineWidth: 1)
        )
    }

    private func switchMode() {
        mode = mode == .signUp ? .signIn : .signUp
        auth.clearMessages()
    }

    private func submit() {
        focus = nil
        Task {
            switch mode {
            case .signUp: await auth.signUp(email: email, password: password)
            case .signIn: await auth.signIn(email: email, password: password)
            }
        }
    }
}

/// Mirrors the web's `/check-email` screen, plus a way to send it again.
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

                if let notice = auth.notice {
                    Text(notice)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.muted)
                }
                if let error = auth.errorMessage {
                    Text(error)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.accent)
                }

                AstraSecondaryButton(title: "Send it again") {
                    Task { await auth.resendConfirmation(email: email) }
                }
                .padding(.top, 12)
                .frame(maxWidth: 300)

                Button("Use a different email") {
                    Task { await auth.signOut() }
                }
                .font(.system(size: 14))
                .foregroundStyle(Theme.muted)
                .padding(.top, 8)
            }
            .padding(.horizontal, 32)
        }
    }
}
