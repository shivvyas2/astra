import XCTest
@testable import Sanchara

/// The reading's markdown, as the transcript splits it into blocks.
final class MarkdownBlockTests: XCTestCase {

    func testABoldOnlyLineIsAHeading() {
        let blocks = MarkdownBlock.parse("**Career**\nSaturn rules your tenth.")
        XCTAssertEqual(blocks, [.heading("Career"), .paragraph("Saturn rules your tenth.")])
    }

    func testABoldSentenceInsideProseStaysAParagraph() {
        let blocks = MarkdownBlock.parse("This is **not** a heading, it has **two** runs.")
        XCTAssertEqual(blocks.count, 1)
        if case .paragraph = blocks[0] {} else { XCTFail("expected a paragraph, got \(blocks[0])") }
    }

    func testHashHeadingsStillParse() {
        XCTAssertEqual(MarkdownBlock.parse("## Money"), [.heading("Money")])
    }

    func testSimpleWordsIsSplitOffFromTheHeadingOnward() {
        let blocks = MarkdownBlock.parse("""
        **Career**
        Likely a change by March 2027.

        **In simple words**
        Expect a job offer early next year.
        - Say yes.
        """)
        let split = MarkdownBlock.splitSimpleWords(blocks)
        XCTAssertEqual(split.main, [.heading("Career"), .paragraph("Likely a change by March 2027.")])
        XCTAssertEqual(split.simple, [
            .heading("In simple words"),
            .paragraph("Expect a job offer early next year."),
            .bullet(marker: "•", text: "Say yes."),
        ])
    }

    func testSimpleWordsHeadingMatchesLoosely() {
        XCTAssertTrue(MarkdownBlock.isSimpleWordsHeading("In Simple Words:"))
        XCTAssertTrue(MarkdownBlock.isSimpleWordsHeading("**in simple words**"))
        XCTAssertFalse(MarkdownBlock.isSimpleWordsHeading("Simple"))
    }

    func testNoSimpleWordsMeansNothingIsSplit() {
        let blocks = MarkdownBlock.parse("**Career**\nStill streaming")
        let split = MarkdownBlock.splitSimpleWords(blocks)
        XCTAssertEqual(split.main, blocks)
        XCTAssertTrue(split.simple.isEmpty)
    }

    func testOrderedItemsKeepTheirNumber() {
        XCTAssertEqual(MarkdownBlock.parse("2) Second"), [.bullet(marker: "2.", text: "Second")])
    }

    /// Mirrors lib/astrology/reading.test.ts.
    func testChartBasisIsSplitOffAfterSimpleWords() {
        let blocks = MarkdownBlock.parse("""
        **Career**
        Saturn in your 10th house asks for patience.

        **In simple words**
        Yes, around April.

        **Chart basis**
        - Saturn transiting the 10th house until April 2027
        - Mahadasha: Venus until March 2031
        """)
        let (rest, basis) = MarkdownBlock.splitChartBasis(blocks)
        XCTAssertEqual(basis, ["Saturn transiting the 10th house until April 2027", "Mahadasha: Venus until March 2031"])
        let split = MarkdownBlock.splitSimpleWords(rest)
        XCTAssertEqual(split.simple.first, .heading("In simple words"))
        XCTAssertEqual(split.simple.count, 2)
    }

    func testOlderReadingsHaveNoChartBasis() {
        let (rest, basis) = MarkdownBlock.splitChartBasis(MarkdownBlock.parse("**Career**\nSteady."))
        XCTAssertNil(basis)
        XCTAssertEqual(rest.count, 2)
    }
}
