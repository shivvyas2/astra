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
        /// Account created but the email is not confirmed yet.
        case awaitingConfirmation(email: String)
    }

    /// Supabase's default minimum. Stated up front rather than after a round trip.
    static let minimumPasswordLength = 6

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
        if !Self.emailLooksValid(email) { return "That email doesn't look right." }
        if password.count < Self.minimumPasswordLength {
            return "Passwords need at least \(Self.minimumPasswordLength) characters."
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
                state = .awaitingConfirmation(email: email)
            } else if message.contains("invalid login") || message.contains("credentials") {
                errorMessage = "Incorrect email or password. Try again, or use a magic link."
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
                state = .awaitingConfirmation(email: email)
            }
        } catch {
            let message = error.localizedDescription.lowercased()
            if message.contains("already registered") || message.contains("already exists")
                || message.contains("already been registered")
            {
                errorMessage = "You already have an account with this email. Sign in instead."
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
            errorMessage = "Apple sign-in didn't complete. Try again."

        case .success(let authorization):
            guard
                let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                let tokenData = credential.identityToken,
                let idToken = String(data: tokenData, encoding: .utf8)
            else {
                errorMessage = "Apple didn't return a sign-in token."
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

    // MARK: - Passwordless

    /// The easiest way in: no password to choose, and it both creates the
    /// account and signs in, depending on whether the email is known.
    func sendMagicLink(email rawEmail: String) async {
        let email = rawEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        clearMessages()
        guard Self.emailLooksValid(email) else {
            errorMessage = "Enter your email first."
            return
        }
        isWorking = true
        defer { isWorking = false }
        do {
            // Returns into the app via the Universal Link on astra.shivvyas.com.
            try await Supa.client.auth.signInWithOTP(
                email: email,
                redirectTo: AppConfig.apiBaseURL.appendingPathComponent("auth/callback")
            )
            notice = "Check \(email) for a link that signs you straight in."
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Re-sends the confirmation email from the "check your email" screen.
    func resendConfirmation(email: String) async {
        clearMessages()
        isWorking = true
        defer { isWorking = false }
        do {
            try await Supa.client.auth.resend(
                email: email,
                type: .signup,
                emailRedirectTo: AppConfig.apiBaseURL.appendingPathComponent("auth/callback")
            )
            notice = "Sent again. It can take a minute to arrive."
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func signOut() async {
        // Stop alerts for this device before the token is gone, so the next
        // person to sign in here does not get the previous account's readings.
        await PushStore.shared.unregister()
        try? await Supa.client.auth.signOut()
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
            errorMessage = "That link has expired. Request a new one."
        }
    }

    func clearMessages() {
        errorMessage = nil
        notice = nil
        shouldSwitchToSignIn = false
    }

    // MARK: - First run

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
