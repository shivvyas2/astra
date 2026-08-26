import XCTest
@testable import Astra

/// Sign-up should catch a mistyped email or a too-short password before
/// spending a round trip on it.
final class AuthValidationTests: XCTestCase {

    func testAcceptsOrdinaryAddresses() {
        XCTAssertTrue(AuthStore.emailLooksValid("shiv@example.com"))
        XCTAssertTrue(AuthStore.emailLooksValid("first.last+tag@sub.example.co.in"))
    }

    func testRejectsMalformedAddresses() {
        XCTAssertFalse(AuthStore.emailLooksValid(""))
        XCTAssertFalse(AuthStore.emailLooksValid("shiv"))
        XCTAssertFalse(AuthStore.emailLooksValid("@example.com"))
        XCTAssertFalse(AuthStore.emailLooksValid("shiv@example"))
        XCTAssertFalse(AuthStore.emailLooksValid("shiv@example."))
        XCTAssertFalse(AuthStore.emailLooksValid("shiv @example.com"))
    }

    func testAppleNonceIsRandomAndHashed() {
        let a = AppleSignIn.randomNonce()
        let b = AppleSignIn.randomNonce()
        XCTAssertEqual(a.count, 32)
        XCTAssertNotEqual(a, b, "a repeated nonce would defeat the point of sending one")
        // SHA-256 hex is always 64 characters, and must be stable for a value.
        XCTAssertEqual(AppleSignIn.sha256(a).count, 64)
        XCTAssertEqual(AppleSignIn.sha256(a), AppleSignIn.sha256(a))
        XCTAssertNotEqual(AppleSignIn.sha256(a), AppleSignIn.sha256(b))
    }
}
