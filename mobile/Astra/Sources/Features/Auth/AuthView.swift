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

                        AstraSecondaryButton(title: codeLabel) {
                            focus = nil
                            Task { await auth.sendEmailCode(email: email) }
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

    private var codeLabel: String {
        mode == .signUp ? "Or sign up with an email code" : "Forgot password? Email me a code"
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
                    .font(.system(size: 30, weight: .light))
                    .tracking(-0.5)
                    .foregroundStyle(Theme.fg)
                    .padding(.top, 12)

                Text("We sent a \(AuthStore.codeLength)-digit code to \(email).")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
                    .padding(.top, 8)

                TextField("", text: $code, prompt: Text("000000").foregroundStyle(Theme.muted.opacity(0.5)))
                    .font(.system(size: 28, weight: .light, design: .monospaced))
                    .tracking(8)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Theme.fg)
                    .keyboardType(.numberPad)
                    // iOS offers the code straight from the email above the keyboard.
                    .textContentType(.oneTimeCode)
                    .focused($focused)
                    .padding(.vertical, 14)
                    .background(Theme.fieldFill)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.cornerRadius))
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.cornerRadius)
                            .stroke(Theme.hairline, lineWidth: 1)
                    )
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
                    Text(error)
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.accent)
                        .multilineTextAlignment(.center)
                        .padding(.top, 12)
                }
                if let notice = auth.notice {
                    Text(notice)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.muted)
                        .padding(.top, 12)
                }

                AstraPrimaryButton(title: "Continue", isLoading: auth.isWorking) {
                    focused = false
                    Task { await auth.verifyCode(code) }
                }
                .padding(.top, 16)

                Button("Send a new code") { Task { await auth.resendCode() } }
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.muted)
                    .padding(.top, 16)

                Button("Use a different email") { Task { await auth.signOut() } }
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.muted.opacity(0.8))
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
