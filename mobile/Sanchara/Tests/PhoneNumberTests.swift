import XCTest
@testable import Sanchara

/// What phone sign-in accepts and how it shows a number back.
final class PhoneNumberTests: XCTestCase {
    func testIndiaAcceptsTheWaysPeopleWriteANumber() {
        let want = "+919876543210"
        for input in ["9876543210", "98765 43210", "098765 43210", "+91 98765-43210", "919876543210"] {
            XCTAssertEqual(PhoneCountry.india.e164(input), want, input)
        }
    }

    func testIndiaRejectsWhatCannotBeAMobile() {
        for input in ["", "12345", "5876543210", "98765432101", "abcdefghij"] {
            XCTAssertNil(PhoneCountry.india.e164(input), input)
        }
    }

    func testUSAcceptsCommonFormats() {
        let want = "+14155552671"
        for input in ["4155552671", "(415) 555-2671", "415.555.2671", "+1 415 555 2671", "14155552671"] {
            XCTAssertEqual(PhoneCountry.unitedStates.e164(input), want, input)
        }
    }

    func testUSRejectsAreaCodesAndExchangesStartingWithZeroOrOne() {
        XCTAssertNil(PhoneCountry.unitedStates.e164("1155552671"))
        XCTAssertNil(PhoneCountry.unitedStates.e164("4151552671"))
        XCTAssertNil(PhoneCountry.unitedStates.e164("415555267"))
    }

    func testDisplay() {
        XCTAssertEqual(PhoneCountry.display("+919876543210"), "+91 98765 43210")
        XCTAssertEqual(PhoneCountry.display("+14155552671"), "+1 (415) 555-2671")
        XCTAssertEqual(PhoneCountry.of(e164: "+14155552671"), .unitedStates)
    }
}
