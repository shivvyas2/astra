import AuthenticationServices
import Foundation
import Supabase

/// Auth state for the app.
///
/// Sign-in and sign-up are separate, deliberate paths — a person who mistypes a
/// password should be told that, not silently pushed into creating a second
/// account. The screen picks which one to open with; the store never guesses.
@Observable
@MainActor
final class AuthStore {
    enum State {
        case loading
        case signedOut
        case signedIn
        /// A six-digit code has been emailed or texted and is waiting to be entered.
        case awaitingCode(CodeDestination)
    }

    /// Where the waiting code went.
    enum CodeDestination: Equatable {
        case email(String, CodePurpose)
        /// E.164, as sent to Supabase.
        case phone(String)
    }

    /// Which code was sent, which decides how it is verified.
    enum CodePurpose {
        /// Passwordless sign-in or sign-up.
        case signIn
        /// Confirming the address on an account created with a password.
        case confirmSignUp

        var otpType: EmailOTPType { self == .signIn ? .email : .signup }
    }

    /// Supabase's default minimum. Stated up front rather than after a round trip.
    nonisolated static let minimumPasswordLength = 6
    /// Supabase emails a six-digit code.
    nonisolated static let codeLength = 6

    var state: State = .loading
    var errorMessage: String?
    var notice: String?
    var isWorking = false
    /// Set when sign-up finds an existing account, so the screen can switch to
    /// sign-in with the email already filled in.
    var shouldSwitchToSignIn = false

    func start() async {
        state = (try? await Supa.client.auth.session) != nil ? .signedIn : .signedOut
        for await change in Supa.client.auth.authStateChanges {
            switch change.event {
            case .signedIn, .tokenRefreshed:
                if change.session != nil { state = .signedIn }
            case .signedOut:
                state = .signedOut
            default:
                break
            }
        }
    }

    // MARK: - Validation

    /// Pure and actor-free, so validation can be checked without the store.
    nonisolated static func emailLooksValid(_ email: String) -> Bool {
        let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let at = trimmed.firstIndex(of: "@"), at != trimmed.startIndex else { return false }
        let domain = trimmed[trimmed.index(after: at)...]
        return domain.contains(".") && !domain.hasPrefix(".") && !domain.hasSuffix(".")
            && !trimmed.contains(" ")
    }

    private func validate(email: String, password: String) -> String? {
        if !Self.emailLooksValid(email) { return L10n.string("That email doesn't look right.") }
        if password.count < Self.minimumPasswordLength {
            return L10n.string("Passwords need at least \(Self.minimumPasswordLength) characters.")
        }
        return nil
    }

    // MARK: - Sign in

    func signIn(email rawEmail: String, password: String) async {
        let email = rawEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        clearMessages()
        if let problem = validate(email: email, password: password) {
            errorMessage = problem
            return
        }
        isWorking = true
        defer { isWorking = false }

        do {
            try await Supa.client.auth.signIn(email: email, password: password)
            Self.rememberSignedInBefore()
            state = .signedIn
        } catch {
            let message = error.localizedDescription.lowercased()
            if message.contains("not confirmed") {
                state = .awaitingCode(.email(email, .confirmSignUp))
            } else if message.contains("invalid login") || message.contains("credentials") {
                errorMessage = L10n.string("Incorrect email or password. Try again, or use a magic link.")
            } else {
                errorMessage = error.localizedDescription
            }
        }
    }

    // MARK: - Sign up

    func signUp(email rawEmail: String, password: String) async {
        let email = rawEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        clearMessages()
        if let problem = validate(email: email, password: password) {
            errorMessage = problem
            return
        }
        isWorking = true
        defer { isWorking = false }

        do {
            let response = try await Supa.client.auth.signUp(
                email: email,
                password: password,
                redirectTo: AppConfig.apiBaseURL.appendingPathComponent("auth/callback")
            )
            Self.rememberSignedInBefore()
            if response.session != nil {
                state = .signedIn // email confirmation is switched off
            } else {
                state = .awaitingCode(.email(email, .confirmSignUp))
            }
        } catch {
            let message = error.localizedDescription.lowercased()
            if message.contains("already registered") || message.contains("already exists")
                || message.contains("already been registered")
            {
                errorMessage = L10n.string("You already have an account with this email. Sign in instead.")
                shouldSwitchToSignIn = true
            } else {
                errorMessage = error.localizedDescription
            }
        }
    }

    // MARK: - Sign in with Apple

    /// Completes the native Apple flow by handing Apple's identity token to
    /// Supabase. No password, no confirmation email — the account exists the
    /// moment Apple vouches for it.
    func completeAppleSignIn(result: Result<ASAuthorization, Error>, rawNonce: String) async {
        clearMessages()
        switch result {
        case .failure(let error):
            // Dismissing the sheet is a normal action, not an error to report.
            if (error as? ASAuthorizationError)?.code == .canceled { return }
            errorMessage = L10n.string("Apple sign-in didn't complete. Try again.")

        case .success(let authorization):
            guard
                let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                let tokenData = credential.identityToken,
                let idToken = String(data: tokenData, encoding: .utf8)
            else {
                errorMessage = L10n.string("Apple didn't return a sign-in token.")
                return
            }

            isWorking = true
            defer { isWorking = false }
            do {
                try await Supa.client.auth.signInWithIdToken(
                    credentials: .init(provider: .apple, idToken: idToken, nonce: rawNonce)
                )
                // Apple sends the name only on the first authorization ever, so
                // it is kept for intake rather than dropped.
                if let name = credential.fullName { AppleSignIn.remember(name) }
                Self.rememberSignedInBefore()
                state = .signedIn
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    // MARK: - Email codes

    /// The easiest way in: no password to choose. Supabase sends a six-digit
    /// code, which beats a link on a phone — the code can be typed into the app
    /// that is already open, with no hop out to a mail client and back.
    func sendEmailCode(email rawEmail: String) async {
        let email = rawEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        clearMessages()
        guard Self.emailLooksValid(email) else {
            errorMessage = L10n.string("Enter your email first.")
            return
        }
        isWorking = true
        defer { isWorking = false }
        do {
            // `redirectTo` keeps the link in the email working as a fallback for
            // anyone who taps it instead of typing the code.
            try await Supa.client.auth.signInWithOTP(
                email: email,
                redirectTo: AppConfig.apiBaseURL.appendingPathComponent("auth/callback")
            )
            state = .awaitingCode(.email(email, .signIn))
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Phone codes

    /// Sign-in and sign-up are one path by phone: Supabase creates the account
    /// on the first code, and there is no password to get wrong.
    func sendPhoneCode(country: PhoneCountry, number: String) async {
        clearMessages()
        guard let phone = country.e164(number) else {
            errorMessage = number.isEmpty
                ? L10n.string("Enter your phone number first.")
                : L10n.string("That doesn't look like a \(country.name) mobile number.")
            return
        }
        isWorking = true
        defer { isWorking = false }
        do {
            try await Supa.client.auth.signInWithOTP(phone: phone)
            state = .awaitingCode(.phone(phone))
        } catch {
            errorMessage = Self.phoneError(error)
        }
    }

    /// Supabase's wording when the phone provider is off or Twilio refuses.
    private static func phoneError(_ error: Error) -> String {
        let message = error.localizedDescription.lowercased()
        if message.contains("provider") || message.contains("unsupported") || message.contains("disabled") {
            return L10n.string("Phone sign-in isn't available right now. Use email or Apple instead.")
        }
        if message.contains("rate") || message.contains("too many") {
            return L10n.string("Too many codes for this number. Wait a minute and try again.")
        }
        return error.localizedDescription
    }

    /// Digits only: people paste codes with stray spaces, and an email client
    /// will sometimes wrap one in punctuation.
    nonisolated static func normalizedCode(_ input: String) -> String {
        String(input.filter(\.isNumber).prefix(codeLength))
    }

    func verifyCode(_ input: String) async {
        guard case .awaitingCode(let destination) = state else { return }
        let code = Self.normalizedCode(input)
        clearMessages()
        guard code.count == Self.codeLength else {
            if case .phone = destination {
                errorMessage = L10n.string("Enter the \(Self.codeLength) digits from the text.")
            } else {
                errorMessage = L10n.string("Enter the \(Self.codeLength) digits from the email.")
            }
            return
        }
        isWorking = true
        defer { isWorking = false }
        do {
            switch destination {
            case .email(let email, let purpose):
                try await Supa.client.auth.verifyOTP(email: email, token: code, type: purpose.otpType)
            case .phone(let phone):
                try await Supa.client.auth.verifyOTP(phone: phone, token: code, type: .sms)
            }
            Self.rememberSignedInBefore()
            state = .signedIn
        } catch {
            let message = error.localizedDescription.lowercased()
            errorMessage =
                message.contains("expired") || message.contains("invalid")
                ? L10n.string("That code didn't work. It may have expired, so send a new one.")
                : error.localizedDescription
        }
    }

    /// Sends another code for whichever flow is waiting.
    func resendCode() async {
        guard case .awaitingCode(let destination) = state else { return }
        clearMessages()
        isWorking = true
        defer { isWorking = false }
        do {
            switch destination {
            case .phone(let phone):
                try await Supa.client.auth.signInWithOTP(phone: phone)
            case .email(let email, .signIn):
                try await Supa.client.auth.signInWithOTP(
                    email: email,
                    redirectTo: AppConfig.apiBaseURL.appendingPathComponent("auth/callback")
                )
            case .email(let email, .confirmSignUp):
                try await Supa.client.auth.resend(
                    email: email,
                    type: .signup,
                    emailRedirectTo: AppConfig.apiBaseURL.appendingPathComponent("auth/callback")
                )
            }
            notice = L10n.string("Sent again. It can take a minute to arrive.")
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func signOut() async {
        // Stop alerts for this device before the token is gone, so the next
        // person to sign in here does not get the previous account's readings.
        await PushStore.shared.unregister()
        try? await Supa.client.auth.signOut()
        // The chart, the birth details, and the last reading outlive the session
        // otherwise — they are on disk in the app group, and the widget would go
        // on showing them to whoever signs in next.
        ChartCache.shared.clear()
        clearMessages()
        state = .signedOut
    }

    /// Handles the Universal Link opened from a confirmation or magic-link email.
    func handle(url: URL) async {
        do {
            try await Supa.client.auth.session(from: url)
            Self.rememberSignedInBefore()
            state = .signedIn
        } catch {
            errorMessage = L10n.string("That link has expired. Request a new one.")
        }
    }

    func clearMessages() {
        errorMessage = nil
        notice = nil
        shouldSwitchToSignIn = false
    }

    // MARK: - First run

    // Pre-rename key, kept deliberately: the bundle id is unchanged, so
    // renaming it would show every returning user the first-run screen.
    private static let signedInBeforeKey = "astra.hasSignedInBefore"

    /// A device that has never had an account opens on "create account"; a
    /// returning one opens on "sign in".
    static var hasSignedInBefore: Bool {
        UserDefaults.standard.bool(forKey: signedInBeforeKey)
    }

    static func rememberSignedInBefore() {
        UserDefaults.standard.set(true, forKey: signedInBeforeKey)
    }
}
