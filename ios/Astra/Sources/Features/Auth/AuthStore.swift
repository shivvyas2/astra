import Foundation
import Supabase

/// Auth state for the app.
///
/// `authenticate` reproduces the web's "smart auth" (`app/(auth)/actions.ts`):
/// one form for both paths — sign in if the account exists, create it if not,
/// and report a wrong password distinctly so the user is not told to sign up
/// for an account they already have.
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

    var state: State = .loading
    var errorMessage: String?
    var notice: String?
    var isWorking = false

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

    func authenticate(email rawEmail: String, password: String) async {
        let email = rawEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !email.isEmpty, !password.isEmpty else {
            errorMessage = "Enter your email and password."
            return
        }
        errorMessage = nil
        notice = nil
        isWorking = true
        defer { isWorking = false }

        // 1) Try signing in first — the common case for returning users.
        do {
            try await Supa.client.auth.signIn(email: email, password: password)
            state = .signedIn
            return
        } catch {
            if error.localizedDescription.lowercased().contains("not confirmed") {
                state = .awaitingConfirmation(email: email)
                return
            }
        }

        // 2) Sign-in failed. Try to create the account.
        do {
            let response = try await Supa.client.auth.signUp(email: email, password: password)
            if response.session != nil {
                state = .signedIn
            } else {
                state = .awaitingConfirmation(email: email)
            }
        } catch {
            let message = error.localizedDescription.lowercased()
            if message.contains("already registered") || message.contains("already exists") {
                errorMessage = "Incorrect password for this account. Try again, or use a magic link."
            } else {
                errorMessage = error.localizedDescription
            }
        }
    }

    func sendMagicLink(email rawEmail: String) async {
        let email = rawEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !email.isEmpty else {
            errorMessage = "Enter your email first."
            return
        }
        errorMessage = nil
        isWorking = true
        defer { isWorking = false }
        do {
            // Returns into the app via the Universal Link on astra.shivvyas.com.
            try await Supa.client.auth.signInWithOTP(
                email: email,
                redirectTo: AppConfig.apiBaseURL.appendingPathComponent("auth/callback")
            )
            notice = "Check your email for a sign-in link."
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func signOut() async {
        try? await Supa.client.auth.signOut()
        state = .signedOut
    }

    /// Handles the Universal Link opened from a confirmation or magic-link email.
    func handle(url: URL) async {
        do {
            try await Supa.client.auth.session(from: url)
            state = .signedIn
        } catch {
            errorMessage = "That link has expired. Request a new one."
        }
    }
}
