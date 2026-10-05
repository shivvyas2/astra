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
            Atmosphere(mood: .dusk)

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    modePicker
                        .padding(.top, 12)

                    // The hero: an orbit to the right, above the headline,
                    // never behind anything that has to be read.
                    HStack {
                        Spacer(minLength: 0)
                        OrbitDecoration(color: Theme.fg.opacity(0.3))
                            .frame(width: 150, height: 110)
                    }
                    .padding(.top, 8)

                    Text(mode.title)
                        .brutHeading(40)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 4)

                    Text(mode.subtitle)
                        .font(.brutBody(15))
                        .foregroundStyle(Theme.muted)
                        .lineSpacing(2)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 10)

                    if let error = auth.errorMessage {
                        BrutNotice(text: error)
                            .padding(.top, 16)
                    }
                    if let notice = auth.notice {
                        BrutNotice(text: notice, tone: .info)
                            .padding(.top, 16)
                    }

                    VStack(alignment: .leading, spacing: 20) {
                        AppleSignInButton()

                        HStack(spacing: 10) {
                            BrutDivider(color: Theme.rule, thickness: 1)
                            Text("or")
                                .font(.brutMono(11))
                                .foregroundStyle(Theme.muted)
                            BrutDivider(color: Theme.rule, thickness: 1)
                        }

                        SancharaField(
                            placeholder: "you@email.com",
                            text: $email,
                            keyboard: .emailAddress,
                            textContentType: .username,
                            label: "Email"
                        )
                        .focused($focus, equals: .email)

                        VStack(alignment: .leading, spacing: 8) {
                            SancharaSecureField(
                                placeholder: "password",
                                text: $password,
                                textContentType: mode == .signUp ? .newPassword : .password,
                                label: "Password"
                            )
                            .focused($focus, equals: .password)

                            if mode == .signUp {
                                Text("At least \(AuthStore.minimumPasswordLength) characters.")
                                    .font(.brutMono(11, weight: .medium))
                                    .foregroundStyle(
                                        password.isEmpty || password.count >= AuthStore.minimumPasswordLength
                                            ? Theme.muted
                                            : Theme.ember
                                    )
                            }
                        }
                    }
                    .padding(.top, 28)

                    // The way forward, as in the reference: the other path
                    // on the left, the round arrow that submits on the right.
                    HStack(alignment: .center, spacing: 16) {
                        Button(action: switchMode) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(mode == .signUp ? "Already have an account?" : "New to Astrya?")
                                    .foregroundStyle(Theme.muted)
                                Text(mode == .signUp ? "Sign in" : "Create one")
                                    .foregroundStyle(Theme.fg)
                                    .underline()
                            }
                            .font(.system(size: 14, weight: .semibold))
                            .frame(minHeight: 44, alignment: .leading)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)

                        Spacer(minLength: 0)

                        if auth.isWorking {
                            ProgressView()
                                .tint(Theme.ink)
                                .frame(width: 60, height: 60)
                                .background(Circle().fill(Theme.accent))
                                .accessibilityLabel("Working")
                        } else {
                            CircleButton(systemImage: "arrow.right", label: mode.cta, fill: .accent, size: 60) {
                                submit()
                            }
                        }
                    }
                    .padding(.top, 32)

                    Button(codeLabel) {
                        focus = nil
                        Task { await auth.sendEmailCode(email: email) }
                    }
                    .buttonStyle(BrutButtonStyle(kind: .quiet, fullWidth: false))
                    .frame(minHeight: 44)
                    .padding(.top, 12)

                    Spacer(minLength: 40)
                }
                .frame(maxWidth: 420)
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
            Atmosphere(mood: .dusk)

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    HStack {
                        Spacer(minLength: 0)
                        OrbitDecoration(color: Theme.fg.opacity(0.3))
                            .frame(width: 150, height: 110)
                    }
                    .padding(.top, 24)

                    Text(purpose == .signIn ? "Check your email" : "Confirm your email").eyebrow()

                    Text("Enter your code")
                        .brutHeading(40)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 10)

                    Text("We sent a \(AuthStore.codeLength)-digit code to \(email).")
                        .font(.brutBody(15))
                        .foregroundStyle(Theme.muted)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 10)

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Code").eyebrow()
                        TextField("", text: $code, prompt: Text("000000").foregroundStyle(Theme.muted.opacity(0.5)))
                            .font(.brutMono(36, weight: .semibold))
                            .tracking(14)
                            .foregroundStyle(Theme.fg)
                            .keyboardType(.numberPad)
                            // iOS offers the code straight from the email above the keyboard.
                            .textContentType(.oneTimeCode)
                            .focused($focused)
                            .padding(.vertical, 8)
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
                        Rectangle()
                            .fill(focused ? Theme.accent : Theme.line)
                            .frame(height: focused ? 2 : 1)
                            .animation(Theme.snap, value: focused)
                    }
                    .padding(.top, 32)

                    if let error = auth.errorMessage {
                        BrutNotice(text: error)
                            .padding(.top, 16)
                    }
                    if let notice = auth.notice {
                        BrutNotice(text: notice, tone: .info)
                            .padding(.top, 16)
                    }

                    HStack(alignment: .center, spacing: 16) {
                        VStack(alignment: .leading, spacing: 0) {
                            Button("Send a new code") { Task { await auth.resendCode() } }
                                .buttonStyle(BrutButtonStyle(kind: .quiet, fullWidth: false))
                                .frame(minHeight: 44)
                            Button("Use a different email") { Task { await auth.signOut() } }
                                .buttonStyle(BrutButtonStyle(kind: .quiet, fullWidth: false))
                                .frame(minHeight: 44)
                        }

                        Spacer(minLength: 0)

                        if auth.isWorking {
                            ProgressView()
                                .tint(Theme.ink)
                                .frame(width: 60, height: 60)
                                .background(Circle().fill(Theme.accent))
                                .accessibilityLabel("Working")
                        } else {
                            CircleButton(systemImage: "arrow.right", label: "Continue", fill: .accent, size: 60) {
                                focused = false
                                Task { await auth.verifyCode(code) }
                            }
                        }
                    }
                    .padding(.top, 32)

                    Spacer(minLength: 40)
                }
                .frame(maxWidth: 420)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 24)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .onAppear { focused = true }
    }
}
