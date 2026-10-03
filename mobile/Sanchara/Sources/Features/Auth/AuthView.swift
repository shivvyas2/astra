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
    /// Set just before the store moves us to sign-in on its own, so the
    /// "you already have an account" message survives that switch. Every
    /// other mode change is the person's doing and clears the messages.
    @State private var keepMessagesOnNextModeChange = false
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
                        .brutHeading(30)
                        .multilineTextAlignment(.center)
                        .padding(.top, 28)

                    Text(mode.subtitle)
                        .font(.brutBody(14))
                        .foregroundStyle(Theme.muted)
                        .multilineTextAlignment(.center)
                        .padding(.top, 8)

                    if let error = auth.errorMessage {
                        BrutNotice(text: error)
                            .padding(.top, 16)
                    }
                    if let notice = auth.notice {
                        BrutNotice(text: notice, tone: .info)
                            .padding(.top, 16)
                    }

                    VStack(spacing: 12) {
                        AppleSignInButton()

                        HStack(spacing: 10) {
                            BrutDivider(color: Theme.rule, thickness: 1)
                            Text("or")
                                .font(.brutMono(11))
                                .foregroundStyle(Theme.muted)
                            BrutDivider(color: Theme.rule, thickness: 1)
                        }
                        .padding(.vertical, 2)

                        SancharaField(
                            placeholder: "you@email.com",
                            text: $email,
                            keyboard: .emailAddress,
                            textContentType: .username
                        )
                        .focused($focus, equals: .email)

                        VStack(alignment: .leading, spacing: 6) {
                            SancharaSecureField(
                                placeholder: "password",
                                text: $password,
                                textContentType: mode == .signUp ? .newPassword : .password
                            )
                            .focused($focus, equals: .password)

                            if mode == .signUp {
                                Text("At least \(AuthStore.minimumPasswordLength) characters.")
                                    .font(.brutMono(11, weight: .medium))
                                    .foregroundStyle(
                                        password.isEmpty || password.count >= AuthStore.minimumPasswordLength
                                            ? Theme.muted
                                            : Theme.accent
                                    )
                            }
                        }

                        SancharaPrimaryButton(title: mode.cta, isLoading: auth.isWorking) {
                            submit()
                        }

                        SancharaSecondaryButton(title: codeLabel) {
                            focus = nil
                            Task { await auth.sendEmailCode(email: email) }
                        }
                    }
                    .padding(.top, 24)

                    Button(action: switchMode) {
                        Text(mode == .signUp ? "Already have an account?  " : "New to Sanchara?  ")
                            .foregroundStyle(Theme.muted)
                            + Text(mode == .signUp ? "Sign in" : "Create one")
                            .foregroundStyle(Theme.fg)
                    }
                    .font(.system(size: 14, weight: .semibold))
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
            // with the email they already typed still in place, and keep the
            // message that explains why.
            guard shouldSwitch, mode != .signIn else { return }
            keepMessagesOnNextModeChange = true
            mode = .signIn
        }
        .onChange(of: mode) { _, _ in
            if keepMessagesOnNextModeChange {
                keepMessagesOnNextModeChange = false
            } else {
                auth.clearMessages()
            }
        }
    }

    private var codeLabel: String {
        mode == .signUp ? "Or sign up with an email code" : "Forgot password? Email me a code"
    }

    private var modePicker: some View {
        BrutSegmented(options: Mode.allCases.map { ($0, $0.label) }, selection: $mode)
    }

    private func switchMode() {
        // `onChange(of: mode)` clears the messages.
        mode = mode == .signUp ? .signIn : .signUp
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

/// Where a six-digit code is entered — for passwordless sign-in, and for
/// confirming an address after a password sign-up.
struct VerifyCodeView: View {
    let email: String
    let purpose: AuthStore.CodePurpose

    @Environment(AuthStore.self) private var auth
    @State private var code = ""
    @FocusState private var focused: Bool

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            VStack(spacing: 0) {
                Spacer()

                Text(purpose == .signIn ? "Check your email" : "Confirm your email").eyebrow()

                Text("Enter your code")
                    .brutHeading(30)
                    .multilineTextAlignment(.center)
                    .padding(.top, 12)

                Text("We sent a \(AuthStore.codeLength)-digit code to \(email).")
                    .font(.brutBody(14))
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
                    .padding(.top, 8)

                TextField("", text: $code, prompt: Text("000000").foregroundStyle(Theme.muted.opacity(0.5)))
                    .font(.brutMono(28, weight: .bold))
                    .tracking(8)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Theme.fg)
                    .keyboardType(.numberPad)
                    // iOS offers the code straight from the email above the keyboard.
                    .textContentType(.oneTimeCode)
                    .focused($focused)
                    .padding(.vertical, 14)
                    .brutBordered()
                    .padding(.top, 24)
                    .onChange(of: code) { _, entered in
                        let digits = AuthStore.normalizedCode(entered)
                        if digits != entered { code = digits }
                        // Six digits is the whole code; making them press a
                        // button as well would be ceremony.
                        if digits.count == AuthStore.codeLength {
                            focused = false
                            Task { await auth.verifyCode(digits) }
                        }
                    }

                if let error = auth.errorMessage {
                    BrutNotice(text: error)
                        .padding(.top, 12)
                }
                if let notice = auth.notice {
                    BrutNotice(text: notice, tone: .info)
                        .padding(.top, 12)
                }

                SancharaPrimaryButton(title: "Continue", isLoading: auth.isWorking) {
                    focused = false
                    Task { await auth.verifyCode(code) }
                }
                .padding(.top, 16)

                Button("Send a new code") { Task { await auth.resendCode() } }
                    .buttonStyle(BrutButtonStyle(kind: .quiet, fullWidth: false))
                    .padding(.top, 12)

                Button("Use a different email") { Task { await auth.signOut() } }
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.muted)
                    .padding(.top, 10)

                Spacer()
                Spacer()
            }
            .frame(maxWidth: 340)
            .padding(.horizontal, 24)
        }
        .onAppear { focused = true }
    }
}
