import XCTest
@testable import Sanchara

/// On-device memory: the on-device model's notes become a valid
/// `/api/memory/ingest` body, the memory payload decodes, and "what do you
/// know about me?" is recognised and answered locally.
final class MemoryTests: XCTestCase {

    private let facts = [
        UserFact(id: "uuid-old", fact: "Works as a nurse in Pune", category: .work, updatedAt: "2026-01-01"),
        UserFact(id: "uuid-new", fact: "Engaged since June 2026", category: .relationships, updatedAt: "2026-07-01"),
    ]

    // MARK: - References

    func testFactsAreShownNewestFirstUnderShortReferences() {
        let context = MemoryContext(facts: facts)
        XCTAssertEqual(context.listing, "F1 (relationships) Engaged since June 2026\nF2 (work) Works as a nurse in Pune")
        XCTAssertEqual(context.id(forRef: "F2"), "uuid-old")
        XCTAssertEqual(context.id(forRef: " f1 "), "uuid-new")
        XCTAssertNil(context.id(forRef: "F3"))
        XCTAssertNil(context.id(forRef: "uuid-old"))
        XCTAssertNil(context.id(forRef: ""))
    }

    func testTheContextIsCappedForTheOnDeviceWindow() {
        let many = (0..<30).map { UserFact(id: "id\($0)", fact: "Fact \($0)", category: .other, updatedAt: String(format: "2026-01-%02d", $0 % 28 + 1)) }
        XCTAssertEqual(MemoryContext(facts: many).facts.count, MemoryContext.maxFacts)
        XCTAssertEqual(MemoryContext(facts: []).listing, "(none yet)")
    }

    // MARK: - Payload building

    func testNotesBecomeAnIngestBody() {
        let notes = ProposedNotes(
            facts: [
                .init(text: "  Married since March 2026. ", category: "relationships", confidence: "stated", replaces: "F1"),
                .init(text: "Wants to move abroad in 2027", category: "goals", confidence: "INFERRED", replaces: ""),
                .init(text: "Plays chess", category: "hobbies", confidence: "maybe", replaces: "F9"),
                .init(text: "Hi", category: "work", confidence: "stated", replaces: ""),
            ],
            noLongerTrue: ["F2", "F7", "F2"],
            summary: "Asked when to marry; told Feb to May 2027 is likely.",
            topics: ["relationships", "Relationships", "fame", "travel"],
            events: [
                .init(claim: "A wedding date is fixed", topic: "relationships", firstMonth: "2027-2", lastMonth: "2027/05", likelihood: "Likely"),
                .init(claim: "Something soon", topic: "career", firstMonth: "next spring", lastMonth: "2027-05", likelihood: "likely"),
                .init(claim: "A move to a new city", topic: "space", firstMonth: "2027-09", lastMonth: "2027-06", likelihood: "possible"),
                .init(claim: "A raise at your current job", topic: "career", firstMonth: "2027-01-15", lastMonth: "2027-03", likelihood: "certain"),
            ]
        )
        let body = MemoryPayloadBuilder.build(conversationId: "conv", notes: notes, context: MemoryContext(facts: facts))

        XCTAssertEqual(body.conversationId, "conv")
        XCTAssertEqual(body.facts.update, [.init(id: "uuid-new", fact: "Married since March 2026")])
        XCTAssertEqual(body.facts.add, [
            .init(fact: "Wants to move abroad in 2027", category: "goals", confidence: "inferred"),
            // An unknown reference is a new fact; an unknown category is "other".
            .init(fact: "Plays chess", category: "other", confidence: "stated"),
        ])
        XCTAssertEqual(body.facts.remove, ["uuid-old"])
        XCTAssertEqual(body.summary, "Asked when to marry; told Feb to May 2027 is likely")
        XCTAssertEqual(body.topics, ["relationships", "travel"])
        XCTAssertEqual(body.predictions, [
            .init(claim: "A wedding date is fixed", topic: "relationships", windowStart: "2027-02", windowEnd: "2027-05", confidence: "likely"),
            .init(claim: "A raise at your current job", topic: "career", windowStart: "2027-01", windowEnd: "2027-03", confidence: "possible"),
        ])
    }

    func testTheBodyUsesTheServersFieldNames() throws {
        let body = MemoryIngest(
            conversationId: "c",
            facts: .init(add: [], update: [], remove: []),
            summary: nil,
            topics: [],
            predictions: [.init(claim: "A job offer arrives", topic: "career", windowStart: "2027-01", windowEnd: "2027-02", confidence: "likely")]
        )
        let json = try XCTUnwrap(String(data: JSONEncoder().encode(body), encoding: .utf8))
        XCTAssertTrue(json.contains(#""window_start":"2027-01""#))
        XCTAssertTrue(json.contains(#""conversationId":"c""#))
        XCTAssertFalse(json.contains("summary"), "a nil summary is left out, not sent as null")
        XCTAssertFalse(body.isEmpty)
    }

    func testMonthsAreNormalised() {
        XCTAssertEqual(MemoryPayloadBuilder.normaliseMonth("2027-3"), "2027-03")
        XCTAssertEqual(MemoryPayloadBuilder.normaliseMonth("2027.11.04"), "2027-11")
        XCTAssertNil(MemoryPayloadBuilder.normaliseMonth("2027-13"))
        XCTAssertNil(MemoryPayloadBuilder.normaliseMonth("03-2027"))
        XCTAssertNil(MemoryPayloadBuilder.normaliseMonth(""))
    }

    func testALongSummaryIsCutAtAWord() throws {
        let long = String(repeating: "word ", count: 200)
        let summary = try XCTUnwrap(MemoryPayloadBuilder.summary(long))
        XCTAssertLessThanOrEqual(summary.count, MemoryPayloadBuilder.summaryLimit)
        XCTAssertTrue(summary.hasSuffix("word…"))
        XCTAssertNil(MemoryPayloadBuilder.summary("  "))
    }

    func testTheModelInputNeverNamesTheSubject() {
        let input = MemoryPayloadBuilder.modelInput(
            message: "I got engaged in June",
            reply: "Your 7th lord...",
            previousSummary: nil,
            context: MemoryContext(facts: facts),
            today: "2026-10-05"
        )
        XCTAssertTrue(input.contains("Today is 2026-10-05."))
        XCTAssertTrue(input.contains("F1 (relationships) Engaged since June 2026"))
        XCTAssertTrue(input.contains("(just started)"))
        for word in ["astrolog", "horoscope", "zodiac"] {
            XCTAssertFalse(input.lowercased().contains(word))
        }
    }

    // MARK: - "What do you know about me?"

    func testRecognisesOnlyTheMemoryQuestion() {
        XCTAssertTrue(MemoryQuestion.isAskingWhatIsKnown("What do you know about me?"))
        XCTAssertTrue(MemoryQuestion.isAskingWhatIsKnown("what does Astrya remember"))
        XCTAssertTrue(MemoryQuestion.isAskingWhatIsKnown("What have I told you so far?"))
        XCTAssertTrue(MemoryQuestion.isAskingWhatIsKnown("How much do you know about me"))
        XCTAssertFalse(MemoryQuestion.isAskingWhatIsKnown("What do you know about my career next year?"))
        XCTAssertFalse(MemoryQuestion.isAskingWhatIsKnown("Where is my Saturn?"))
    }

    func testAnswersFromTheFactsItHolds() {
        let answer = MemoryQuestion.answer(facts: facts, conversations: 2, predictions: 1)
        XCTAssertTrue(answer.contains("**Work**\n- Works as a nurse in Pune"))
        XCTAssertTrue(answer.contains("**Relationships**\n- Engaged since June 2026"))
        XCTAssertTrue(answer.contains("notes on 2 past conversations and one prediction to check back on"))
        XCTAssertTrue(answer.contains("What Astrya knows"))
        XCTAssertTrue(MemoryQuestion.answer(facts: [], conversations: 0, predictions: 0).contains("don't know anything"))
    }

    // MARK: - The memory payload

    func testDecodesTheMemoryPayload() throws {
        let json = """
        {"facts":[{"id":"a","fact":"Works as a nurse","category":"work","updated_at":"2026-06-01"}],
         "summaries":[{"conversation_id":"c1","summary":"Asked about work.","topics":["career","fame"],"last_message_at":"2026-09-12T10:00:00Z"}],
         "predictions":[{"id":"p1","conversation_id":"c1","topic":"career","claim":"A job offer","window_start":"2027-03-01","window_end":"2027-06-30","confidence":"likely","status":"open","checked_at":null,"created_at":"2026-09-12"},
                        {"id":"p2","topic":"fame","claim":"Famous","window_start":"2026-01-01","window_end":"2026-02-28","confidence":"possible","status":"someday"}],
         "available":{"facts":true,"summaries":true,"predictions":false}}
        """
        let payload = try JSONDecoder().decode(KnowledgeAPI.Payload.self, from: Data(json.utf8))
        XCTAssertEqual(payload.facts.count, 1)
        XCTAssertTrue(payload.available)
        XCTAssertEqual(payload.summaries, [ConversationSummary(conversationId: "c1", summary: "Asked about work.", topics: [.career], lastMessageAt: "2026-09-12T10:00:00Z")])
        XCTAssertEqual(payload.predictions.map(\.topic), [.career, .general])
        XCTAssertEqual(payload.predictions.map(\.status), [.open, .open])
        XCTAssertEqual(payload.predictions.first?.windowLabel, "Mar–Jun 2027")
    }

    func testWindowsAndOrdering() {
        XCTAssertEqual(PredictionWindow.label(start: "2026-12-01", end: "2027-02-28"), "Dec 2026 – Feb 2027")
        XCTAssertEqual(PredictionWindow.label(start: "2027-03-01", end: "2027-03-31"), "Mar 2027")
        XCTAssertEqual(PredictionWindow.label(start: "x", end: "y"), "")

        let p = { (id: String, start: String, status: PredictionStatus, checked: String?) in
            PredictionItem(id: id, topic: .career, claim: id, windowStart: start, windowEnd: "2027-12-31",
                           confidence: "likely", status: status, checkedAt: checked)
        }
        let ordered = PredictionWindow.ordered([
            p("late", "2027-06-01", .open, nil),
            p("done", "2026-01-01", .happened, "2026-10-01"),
            p("soon", "2026-09-01", .open, nil),
        ])
        XCTAssertEqual(ordered.map(\.id), ["soon", "late", "done"])
        XCTAssertTrue(ordered[0].canCheck(today: "2026-10-05"))
        XCTAssertFalse(ordered[1].canCheck(today: "2026-10-05"))
        XCTAssertFalse(ordered[2].canCheck(today: "2026-10-05"))
    }

    func testEveryTopicMatchesTheServer() {
        // Must match TOPICS in lib/memory/types.ts and the check constraint in 0009_memory.sql.
        XCTAssertEqual(
            MemoryTopic.allCases.map(\.rawValue),
            ["career", "relationships", "money", "health", "home", "family", "children", "travel", "education", "general"]
        )
    }

    // MARK: - Scorecard (mirrors lib/memory/scorecard.test.ts)

    private func item(_ status: PredictionStatus, start: String = "2026-06-01", confidence: String = "possible") -> PredictionItem {
        PredictionItem(id: UUID().uuidString, topic: .career, claim: "A change of role", windowStart: start,
                       windowEnd: "2026-08-31", confidence: confidence, status: status)
    }

    func testScorecardTakesTheRateOverHappenedAndDidntOnly() {
        let card = Scorecard([item(.happened), item(.happened), item(.didnt), item(.unsure), item(.unsure)], today: "2026-10-09")
        XCTAssertEqual(card.checked, 3)
        XCTAssertEqual(card.unsure, 2)
        XCTAssertEqual(card.rate, 67)
        XCTAssertEqual(card.total, 5)
    }

    func testScorecardShowsNoRateUntilThereAreEnoughAnswers() {
        XCTAssertNil(Scorecard([item(.happened), item(.happened)], today: "2026-10-09").rate)
        XCTAssertEqual(Scorecard([item(.happened), item(.happened), item(.didnt)], today: "2026-10-09").rate, 67)
    }

    func testScorecardSplitsOpenIntoAwaitingAndUpcoming() {
        let card = Scorecard([item(.open, start: "2026-10-09"), item(.open, start: "2026-01-01"), item(.open, start: "2027-03-01")],
                             today: "2026-10-09")
        XCTAssertEqual(card.awaiting, 2)
        XCTAssertEqual(card.upcoming, 1)
        XCTAssertNil(card.rate)
    }

    func testScorecardKeepsARecordOfLikelyCalls() {
        let card = Scorecard([item(.happened, confidence: "likely"), item(.didnt, confidence: "likely"),
                              item(.happened), item(.unsure, confidence: "likely")], today: "2026-10-09")
        XCTAssertEqual(card.likelyChecked, 2)
        XCTAssertEqual(card.likelyHappened, 1)
    }
}
