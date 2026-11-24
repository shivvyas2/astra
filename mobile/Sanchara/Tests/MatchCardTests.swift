import XCTest
@testable import Sanchara

/// The confirm card: how it arrives, and what confirming it saves.
final class MatchCardTests: XCTestCase {
    private let json = #"{"type":"match","name":"Priya","relationship":"partner","birthDate":"1996-08-21","altBirthDate":null,"birthTime":"14:10","timeKnown":true,"places":[{"name":"Nagpur, Maharashtra, India","lat":21.15,"lng":79.09,"timezone":"Asia/Kolkata","country":"India"}],"placeAmbiguous":false}"#

    func testPlainTextPassesThrough() {
        var s = CardSplitter()
        XCTAssertEqual(s.text(from: "Hello "), "Hello ")
        XCTAssertNil(s.card())
    }

    func testACardSplitAcrossChunksIsHeldBack() {
        var s = CardSplitter()
        XCTAssertEqual(s.text(from: "Is this right?\u{1E}" + json.prefix(40)), "Is this right?")
        XCTAssertNil(s.text(from: String(json.dropFirst(40))))
        XCTAssertEqual(s.card()?.name, "Priya")
        XCTAssertEqual(s.card()?.places.first?.timezone, "Asia/Kolkata")
    }

    func testACardCutShortIsDropped() {
        var s = CardSplitter()
        _ = s.text(from: "x\u{1E}{\"name\":")
        XCTAssertNil(s.card())
    }

    func testConfirmingSavesWhatWasShown() throws {
        let card = try JSONDecoder().decode(MatchCard.self, from: Data(json.utf8))
        XCTAssertFalse(card.isEmpty)
        let body = card.draft(relationship: .spouse, birthDate: "1996-08-21", place: card.places[0]).json
        XCTAssertEqual(body["label"] as? String, "Priya")
        XCTAssertEqual(body["relationship"] as? String, "spouse")
        XCTAssertEqual(body["birth_time"] as? String, "14:10")
        XCTAssertEqual(body["birth_time_known"] as? Bool, true)
        XCTAssertEqual(body["place_name"] as? String, "Nagpur, Maharashtra, India")
    }

    func testReadBackIsRecognisedInEveryLanguage() {
        XCTAssertTrue(MatchCard.isReadBack("Kya yeh sahi hai?\n\n> **Priya** (Partner) · 21 Aug 1996, 2:10 PM · Nagpur"))
        XCTAssertTrue(MatchCard.isReadBack("> **હેતલ** (પતિ/પત્ની) · 12 Jun 1995, 6:20 AM · Rajkot"))
        XCTAssertFalse(MatchCard.isReadBack("**Marriage**\nMost likely yes."))
    }
}
