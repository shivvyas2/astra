import XCTest
@testable import Sanchara

/// The on-device suggestion path has to degrade, not disappear: every device
/// that cannot run Apple Intelligence still gets three usable starters.
@MainActor
final class SuggestionTests: XCTestCase {

    func testEveryModeHasThreeStarters() {
        for mode in ChatMode.allCases {
            let starters = SuggestionEngine.starters(for: mode)
            XCTAssertEqual(starters.count, 3, "\(mode.label) should offer three starters")
            XCTAssertFalse(starters.contains(where: \.isEmpty))
        }
    }

    func testStartersAreShownForTheCurrentMode() {
        let engine = SuggestionEngine()
        engine.showStarters(for: .numerology)
        XCTAssertEqual(engine.suggestions, SuggestionEngine.starters(for: .numerology))
        XCTAssertFalse(engine.isThinking)
    }

    func testClearEmptiesTheStrip() {
        let engine = SuggestionEngine()
        engine.showStarters(for: .vedic)
        engine.clear()
        XCTAssertTrue(engine.suggestions.isEmpty)
    }

    /// Where the on-device model is unavailable, `refresh` must fall straight
    /// back rather than leaving the strip empty or stuck thinking.
    func testRefreshFallsBackWhenOnDeviceModelIsUnavailable() throws {
        try XCTSkipIf(SuggestionEngine.isOnDeviceAvailable, "Apple Intelligence is available here")
        let engine = SuggestionEngine()
        engine.refresh(after: "Saturn is crossing your Moon this month.", mode: .vedic)
        XCTAssertEqual(engine.suggestions, SuggestionEngine.starters(for: .vedic))
        XCTAssertFalse(engine.isThinking)
    }

    func testStatusIsAlwaysExplained() {
        XCTAssertFalse(SuggestionEngine.onDeviceStatus.isEmpty)
        print("on-device status: \(SuggestionEngine.onDeviceStatus)")
    }

    /// Where Apple Intelligence reports itself available, `refresh` must
    /// finish and leave a usable strip — model-written when generation works,
    /// starters when it does not. (Simulators report available but often have
    /// no model assets downloaded, so this asserts the outcome, not the source.)
    func testRefreshAlwaysSettlesOnUsableQuestions() async throws {
        try XCTSkipUnless(SuggestionEngine.isOnDeviceAvailable, "Apple Intelligence unavailable here")
        let engine = SuggestionEngine()
        engine.refresh(
            after: """
                **This month** Saturn is crossing your natal Moon in Taurus, which tends to slow \
                things down at work and ask for patience rather than speed.

                **In simple words** Progress is there, it is just quieter than you would like.
                """,
            mode: .vedic
        )
        XCTAssertTrue(engine.isThinking)

        let deadline = Date().addingTimeInterval(60)
        while engine.isThinking, Date() < deadline {
            try await Task.sleep(nanoseconds: 200_000_000)
        }

        XCTAssertFalse(engine.isThinking, "generation should finish within a minute")
        XCTAssertFalse(engine.suggestions.isEmpty)
        XCTAssertLessThanOrEqual(engine.suggestions.count, 3)
        for question in engine.suggestions {
            print("suggested: \(question)")
            XCTAssertFalse(question.isEmpty)
        }
    }
}
