import XCTest
@testable import Sanchara

final class PendingCodeTests: XCTestCase {
    private let start = Date(timeIntervalSince1970: 1_790_000_000)
    private func pending(_ destination: AuthStore.CodeDestination = .email("asha@example.com", .signIn)) -> PendingCode {
        var p = PendingCode(destination: destination)
        p.sent(at: start, again: false)
        return p
    }
    private func after(_ s: TimeInterval) -> Date { start.addingTimeInterval(s) }

    func testTimersCountDown() {
        let p = pending()
        XCTAssertEqual(p.resendIn(at: start), 60)
        XCTAssertEqual(p.resendIn(at: after(45.5)), 15)
        XCTAssertEqual(p.resendIn(at: after(61)), 0)
        XCTAssertEqual(p.expiresIn(at: after(60)), 3540)
        XCTAssertFalse(p.isExpired(at: after(3599)))
        XCTAssertTrue(p.isExpired(at: after(3601)))
        XCTAssertTrue(pending(.phone("+919876543210")).isExpired(at: after(601)))
    }

    func testWaitsGrow() {
        var p = pending()
        XCTAssertEqual((0..<5).map { _ in p.sent(at: start, again: true); return p.resendIn(at: start) }, [60, 120, 300, 300, 300])
    }

    func testAClockSetBackDoesNotTrapAnyone() {
        XCTAssertEqual(pending().resendIn(at: after(-9_999)), 60)
    }

    func testTooManyTriesLocksAndThenOpens() {
        var p = pending()
        for _ in 0..<PendingCode.maxTries { p.wrongCode(at: start) }
        XCTAssertEqual(p.lockedFor(at: start), 120)
        p.unlockIfDue(at: after(60))
        XCTAssertEqual(p.lockedFor(at: after(60)), 60)
        p.unlockIfDue(at: after(121))
        XCTAssertEqual(p.lockedFor(at: after(121)), 0)
        XCTAssertEqual(p.triesLeft, PendingCode.maxTries)
    }

    func testANewCodeStartsAfresh() {
        var p = pending()
        for _ in 0..<PendingCode.maxTries { p.wrongCode(at: start) }
        p.sent(at: after(90), again: true)
        XCTAssertEqual(p.tries, 0)
        XCTAssertEqual(p.lockedFor(at: after(90)), 0)
    }

    func testItSurvivesARelaunchUntilItExpires() {
        let defaults = UserDefaults(suiteName: "pending-code-tests")!
        defaults.removePersistentDomain(forName: "pending-code-tests")
        for p in [pending(), pending(.email("a@b.co", .confirmSignUp)), pending(.phone("+919876543210"))] {
            PendingCode.save(p, to: defaults)
            XCTAssertEqual(PendingCode.restore(from: defaults, now: after(30)), p)
        }
        XCTAssertNil(PendingCode.restore(from: defaults, now: after(700)))
        PendingCode.save(nil, to: defaults)
        XCTAssertNil(PendingCode.restore(from: defaults, now: start))
    }

    func testWrongCodeIsToldApartFromNoConnection() {
        XCTAssertFalse(AuthStore.isWrongCode(URLError(.notConnectedToInternet)))
        struct E: LocalizedError { var errorDescription: String? }
        XCTAssertTrue(AuthStore.isWrongCode(E(errorDescription: "Token has expired or is invalid")))
        XCTAssertFalse(AuthStore.isWrongCode(E(errorDescription: "Internal server error")))
    }

    func testClock() { XCTAssertEqual([0, 9, 60, 725].map(PendingCode.clock), ["0:00", "0:09", "1:00", "12:05"]) }
}
