import XCTest
@testable import Sanchara

/// The houses the kundli seal lights above an answer.
final class ReadingHousesTests: XCTestCase {
    func testOrdinalsAndListsInOrderOfMention() {
        let text = """
        Saturn moves into Aries, your 10th house, on 2027-06-03. Mercury rules \
        houses 3 and 12 and sits in house 12, so a move becomes possible.
        """
        XCTAssertEqual(ReadingHouses.mentioned(in: text), [10, 3, 12])
    }

    func testBhavaAndCommaLists() {
        XCTAssertEqual(ReadingHouses.mentioned(in: "Jupiter aspects the 7th bhava and houses 1, 5 and 9."), [7, 1, 5, 9])
    }

    func testDatesAndOtherNumbersAreNotHouses() {
        XCTAssertEqual(ReadingHouses.mentioned(in: "From 2027-10 to 2028, about 3 years."), [])
    }

    func testCapsAtFour() {
        XCTAssertEqual(ReadingHouses.mentioned(in: "houses 1, 2, 3, 4 and 5").count, ReadingHouses.limit)
    }
}
