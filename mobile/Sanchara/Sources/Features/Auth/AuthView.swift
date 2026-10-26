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

        var label: String { self == .signUp ? L10n.string("Create account") : L10n.string("Sign in") }
        var title: String { self == .signUp ? L10n.string("Create your account") : L10n.string("Welcome back") }
        var subtitle: String {
            self == .signUp
                ? L10n.string("One email, one password, and we'll build your real birth chart next.")
                : L10n.string("Your real birth chart, read by the stars.")
        }
        var cta: String { self == .signUp ? L10n.string("Create account") : L10n.string("Sign in") }
    }

    /// Email with a password (or a code), or a phone number with a texted code.
    enum Method: String, CaseIterable {
        case email, phone
        var label: String { self == .email ? L10n.string("Email") : L10n.string("Phone") }
    }

    @Environment(AuthStore.self) private var auth
    @State private var mode: Mode = AuthStore.hasSignedInBefore ? .signIn : .signUp
    @State private var email = ""
    @State private var password = ""
    /// Remembered, so someone who signs in by phone finds the phone field again.
    @AppStorage("auth.method") private var method: Method = .email
    @State private var phoneCountry: PhoneCountry = .preferred
    @State private var phoneNumber = ""
    @State private var legalPage: LegalPage?
    @Environment(\.accessibilityDifferentiateWithoutColor) private var shapeCues
    /// Set just before the store moves us to sign-in on its own, so the
    /// "you already have an account" message survives that switch. Every
    /// other mode change is the person's doing and clears the messages.
    @State private var keepMessagesOnNextModeChange = false
    @FocusState private var focus: Field?

    private enum Field { case email, password, phone }

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

                    Text(subtitle)
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

                        // "or", as a choice: the rest of the form follows it.
                        HStack(spacing: 10) {
                            BrutDivider(color: Theme.rule, thickness: 1)
                            MethodToggle(selection: $method)
                            BrutDivider(color: Theme.rule, thickness: 1)
                        }

                        if method == .phone {
                            phoneField
                        } else {
                            emailFields
                        }
                    }
                    .padding(.top, 28)

                    // The way forward, as in the reference: the other path
                    // on the left, the round arrow that submits on the right.
                    HStack(alignment: .center, spacing: 16) {
                        Button(action: switchMode) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(mode == .signUp ? L10n.string("Already have an account?") : L10n.string("New to Astrya?"))
                                    .foregroundStyle(Theme.muted)
                                Text(mode == .signUp ? L10n.string("Sign in") : L10n.string("Create one"))
                                    .foregroundStyle(Theme.fg)
                                    .underline()
                            }
                            .font(.scaled(size: 14, weight: .semibold))
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
                            CircleButton(systemImage: "arrow.right", label: method == .phone ? L10n.string("Text me a code") : mode.cta, fill: .accent, size: 60) {
                                submit()
                            }
                        }
                    }
                    .padding(.top, 32)

                    if method == .email {
                        Button(codeLabel) {
                            focus = nil
                            Task { await auth.sendEmailCode(email: email) }
                        }
                        .buttonStyle(BrutButtonStyle(kind: .quiet, fullWidth: false))
                        .frame(minHeight: 44)
                        .padding(.top, 12)
                    }

                    legalNote
                        .padding(.top, 20)

                    Spacer(minLength: 40)
                }
                .frame(maxWidth: 420)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 24)
            }
            .scrollDismissesKeyboard(.interactively)
            .legalSheet($legalPage)
        }
        .onChange(of: auth.shouldSwitchToSignIn) { _, shouldSwitch in
            // Sign-up found an existing account: move them to the right form
            // with the email they already typed still in place, and keep the
            // message that explains why.
            guard shouldSwitch, mode != .signIn else { return }
            keepMessagesOnNextModeChange = true
            mode = .signIn
        }
        .onChange(of: method) { _, _ in
            auth.clearMessages()
            focus = nil
        }
        .onChange(of: mode) { _, _ in
            if keepMessagesOnNextModeChange {
                keepMessagesOnNextModeChange = false
            } else {
                auth.clearMessages()
            }
        }
    }

    private var subtitle: String {
        guard method == .phone else { return mode.subtitle }
        return mode == .signUp
            ? L10n.string("Your number, one code, and we'll build your real birth chart next.")
            : L10n.string("We'll text you a code. No password needed.")
    }

    private var emailFields: some View {
        VStack(alignment: .leading, spacing: 20) {
            SancharaField(
                placeholder: "you@email.com",
                text: $email,
                keyboard: .emailAddress,
                textContentType: .username,
                label: L10n.string("Email")
            )
            .focused($focus, equals: .email)

            VStack(alignment: .leading, spacing: 8) {
                SancharaSecureField(
                    placeholder: L10n.string("password"),
                    text: $password,
                    textContentType: mode == .signUp ? .newPassword : .password,
                    label: L10n.string("Password")
                )
                .focused($focus, equals: .password)

                if mode == .signUp {
                    let tooShort = !password.isEmpty && password.count < AuthStore.minimumPasswordLength
                    HStack(spacing: 4) {
                        // Colour alone says "too short"; the
                        // setting adds the mark notices use.
                        if shapeCues && tooShort {
                            Image(systemName: "exclamationmark.circle.fill")
                                .accessibilityHidden(true)
                        }
                        Text("At least \(AuthStore.minimumPasswordLength) characters.")
                    }
                    .font(.brutMono(11, weight: .medium))
                    .foregroundStyle(tooShort ? Theme.ember : Theme.muted)
                }
            }
        }
    }

    /// Country on the left, number on the right, one underline under both,
    /// like the other fields.
    private var phoneField: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Phone").eyebrow()
            HStack(spacing: 12) {
                Menu {
                    Picker(selection: $phoneCountry) {
                        ForEach(PhoneCountry.allCases) { country in
                            Text(verbatim: "\(country.flag)  \(country.name)  \(country.dialCode)").tag(country)
                        }
                    } label: { EmptyView() }
                } label: {
                    HStack(spacing: 6) {
                        Text(verbatim: phoneCountry.flag)
                        Text(verbatim: phoneCountry.dialCode)
                            .foregroundStyle(Theme.fg)
                        Image(systemName: "chevron.down")
                            .font(.scaled(size: 11, weight: .semibold))
                            .foregroundStyle(Theme.muted)
                    }
                    .font(.scaled(size: 17))
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .accessibilityLabel(L10n.string("Country code, \(phoneCountry.name) \(phoneCountry.dialCode)"))

                Rectangle()
                    .fill(Theme.line)
                    .frame(width: Theme.lineWidth, height: 22)
                    .accessibilityHidden(true)

                TextField("", text: $phoneNumber, prompt: Text(verbatim: phoneCountry.placeholder).foregroundStyle(Theme.muted.opacity(0.8)))
                    .font(.scaled(size: 17))
                    .foregroundStyle(Theme.fg)
                    .keyboardType(.phonePad)
                    .textContentType(.telephoneNumber)
                    .focused($focus, equals: .phone)
                    .accessibilityLabel(L10n.string("Phone number"))
                    .onChange(of: phoneNumber) { _, typed in
                        // A pasted "+1 …" or "+91 …" picks its own country.
                        let trimmed = typed.trimmingCharacters(in: .whitespaces)
                        if trimmed.hasPrefix("+1"), phoneCountry != .unitedStates { phoneCountry = .unitedStates }
                        if trimmed.hasPrefix("+91"), phoneCountry != .india { phoneCountry = .india }
                    }
            }
            .padding(.vertical, 0)

            Rectangle()
                .fill(focus == .phone ? Theme.accent : Theme.line)
                .frame(height: focus == .phone ? 2 : 1)
                .animation(Theme.snap, value: focus)

            Text("We'll text you a \(AuthStore.codeLength)-digit code.")
                .font(.brutMono(11, weight: .medium))
                .foregroundStyle(Theme.muted)
        }
    }

    /// Covers every way in, Sign in with Apple included: continuing means
    /// agreeing, and both documents are one tap away.
    private var legalNote: some View {
        Text(Self.legalText)
        .font(.brutBody(12))
        .foregroundStyle(Theme.muted)
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// One translatable sentence with the two documents as markdown links,
    /// so each language can put them where its grammar wants them.
    private static var legalText: AttributedString {
        func link(_ page: LegalPage) -> String { "[\(page.title)](\(page.url.absoluteString))" }
        let sentence = L10n.string("By continuing, you agree to the \(link(.terms)) and \(link(.privacy)).")
        var text = (try? AttributedString(markdown: sentence)) ?? AttributedString(sentence)
        for run in text.runs where run.link != nil {
            text[run.range].foregroundColor = Theme.fg
            text[run.range].underlineStyle = .single
        }
        return text
    }

    private var codeLabel: String {
        mode == .signUp ? L10n.string("Or sign up with an email code") : L10n.string("Forgot password? Email me a code")
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
        if method == .phone {
            Task { await auth.sendPhoneCode(country: phoneCountry, number: phoneNumber) }
            return
        }
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
    let destination: AuthStore.CodeDestination

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

                    Text(eyebrow).eyebrow()

                    Text("Enter your code")
                        .brutHeading(40)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 10)

                    Text(sentLine)
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
                            // iOS offers the code from the email or text above the keyboard.
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
                            Button(isPhone ? L10n.string("Use a different number") : L10n.string("Use a different email")) {
                                Task { await auth.signOut() }
                            }
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
                            CircleButton(systemImage: "arrow.right", label: L10n.string("Continue"), fill: .accent, size: 60) {
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

    private var isPhone: Bool {
        if case .phone = destination { return true }
        return false
    }

    private var eyebrow: String {
        switch destination {
        case .phone: L10n.string("Check your messages")
        case .email(_, .signIn): L10n.string("Check your email")
        case .email(_, .confirmSignUp): L10n.string("Confirm your email")
        }
    }

    private var sentLine: String {
        switch destination {
        case .phone(let phone):
            L10n.string("We texted a \(AuthStore.codeLength)-digit code to \(PhoneCountry.display(phone)).")
        case .email(let email, _):
            L10n.string("We sent a \(AuthStore.codeLength)-digit code to \(email).")
        }
    }
}

/// Email or Phone, sitting in the "or" rule under Sign in with Apple. Small on
/// purpose: it picks the field below, it is not a second set of tabs.
struct MethodToggle: View {
    @Binding var selection: AuthView.Method

    var body: some View {
        HStack(spacing: 2) {
            ForEach(AuthView.Method.allCases, id: \.self) { method in
                let active = method == selection
                Button {
                    withAnimation(Theme.snap) { selection = method }
                } label: {
                    Text(method.label)
                        .font(.brutMono(12, weight: .semibold))
                        .foregroundStyle(active ? Theme.ink : Theme.muted)
                        .padding(.horizontal, 14)
                        .frame(minHeight: 30)
                        .background(Capsule().fill(active ? Theme.fg : .clear))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L10n.string("Continue with \(method.label)"))
                .accessibilityAddTraits(active ? .isSelected : [])
            }
        }
        .padding(3)
        .overlay(Capsule().strokeBorder(Theme.line, lineWidth: Theme.lineWidth))
        .fixedSize()
    }
}
