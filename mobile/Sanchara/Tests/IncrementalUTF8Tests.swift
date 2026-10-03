import XCTest
@testable import Sanchara

/// The chat stream's decoder: bytes arrive in arbitrary pieces and a
/// multi-byte character can be split across two of them.
final class IncrementalUTF8Tests: XCTestCase {

    func testWholeASCIIChunkDecodesAtOnce() {
        var decoder = IncrementalUTF8()
        XCTAssertEqual(decoder.decode(Data("hello".utf8)), "hello")
        XCTAssertNil(decoder.flush())
    }

    func testASplitEmDashIsHeldUntilComplete() {
        var decoder = IncrementalUTF8()
        let dash = Array("—".utf8) // three bytes
        XCTAssertEqual(decoder.decode(Data("a".utf8) + Data(dash[0..<1])), "a")
        XCTAssertNil(decoder.decode(Data(dash[1..<2])))
        XCTAssertEqual(decoder.decode(Data(dash[2..<3]) + Data("b".utf8)), "—b")
    }

    func testASplitFourByteScalarSurvives() {
        var decoder = IncrementalUTF8()
        let star = Array("🌟".utf8) // four bytes
        XCTAssertNil(decoder.decode(Data(star[0..<2])))
        XCTAssertEqual(decoder.decode(Data(star[2..<4])), "🌟")
    }

    func testFlushReturnsTheLeftovers() {
        var decoder = IncrementalUTF8()
        _ = decoder.decode(Data([0xE2, 0x80])) // dangling, incomplete
        XCTAssertEqual(decoder.flush(), "\u{FFFD}")
        XCTAssertNil(decoder.flush())
    }
}
