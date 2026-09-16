import AuthenticationServices
import CryptoKit
import Foundation
import SwiftUI

/// Sign in with Apple — the fastest way onto Sanchara: no password to choose, no
/// confirmation email to wait for.
///
/// Supabase verifies Apple's identity token directly (`signInWithIdToken`), so
/// the flow is fully native: no web sheet, no redirect.
enum AppleSignIn {
    /// Apple signs the nonce we send; Supabase compares it against the raw
    /// value we pass back. That pairing is what stops a stolen token being
    /// replayed against our project.
    static func randomNonce(length: Int = 32) -> String {
        let characters = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var nonce = ""
        var remaining = length
        while remaining > 0 {
            var byte: UInt8 = 0
            let status = SecRandomCopyBytes(kSecRandomDefault, 1, &byte)
            guard status == errSecSuccess else { continue }
            // Reject values that would bias the modulo, so every character is
            // equally likely.
            if byte < 252 {
                nonce.append(characters[Int(byte) % characters.count])
                remaining -= 1
            }
        }
        return nonce
    }

    static func sha256(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    // Apple hands over the person's name only on the very first authorization.
    // Keeping it means intake opens with the name already filled in.
    //
    // These keys keep the pre-rename prefix on purpose. The bundle id did not
    // change, so existing installs upgrade in place and carry the old keys —
    // renaming them would drop the stored name, and Apple only ever supplies
    // it once, so it could not be recovered.
    private static let firstNameKey = "astra.apple.firstName"
    private static let lastNameKey = "astra.apple.lastName"

    static func remember(_ name: PersonNameComponents) {
        let defaults = UserDefaults.standard
        if let given = name.givenName, !given.isEmpty { defaults.set(given, forKey: firstNameKey) }
        if let family = name.familyName, !family.isEmpty { defaults.set(family, forKey: lastNameKey) }
    }

    static var rememberedName: (first: String, last: String)? {
        let defaults = UserDefaults.standard
        let first = defaults.string(forKey: firstNameKey) ?? ""
        let last = defaults.string(forKey: lastNameKey) ?? ""
        return first.isEmpty && last.isEmpty ? nil : (first, last)
    }

    static func forgetName() {
        UserDefaults.standard.removeObject(forKey: firstNameKey)
        UserDefaults.standard.removeObject(forKey: lastNameKey)
    }
}

/// Apple's own button — its look and label are prescribed by Apple's guidelines,
/// so this wraps rather than restyles it.
struct AppleSignInButton: View {
    @Environment(AuthStore.self) private var auth
    @State private var rawNonce = ""

    var body: some View {
        SignInWithAppleButton(.continue) { request in
            let nonce = AppleSignIn.randomNonce()
            rawNonce = nonce
            request.requestedScopes = [.fullName, .email]
            request.nonce = AppleSignIn.sha256(nonce)
        } onCompletion: { result in
            let nonce = rawNonce
            Task { await auth.completeAppleSignIn(result: result, rawNonce: nonce) }
        }
        .signInWithAppleButtonStyle(.white)
        .frame(height: 48)
        .clipShape(RoundedRectangle(cornerRadius: Theme.cornerRadius))
    }
}
