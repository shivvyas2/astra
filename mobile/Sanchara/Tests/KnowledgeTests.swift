import XCTest
@testable import Sanchara

/// "What Astrya knows": the payload from `GET /api/facts` decodes, tolerates
/// a server ahead of or behind the app, and groups in display order.
final class KnowledgeTests: XCTestCase {

    private func decode(_ json: String) throws -> KnowledgeAPI.Payload {
        try JSONDecoder().decode(KnowledgeAPI.Payload.self, from: Data(json.utf8))
    }

    func testDecodesTheFactsPayload() throws {
        let payload = try decode("""
        {"facts":[{"id":"a","fact":"Works as a nurse in Pune","category":"work",
          "created_at":"2026-06-01T00:00:00Z","updated_at":"2026-06-01T00:00:00Z"}],"available":true}
        """)
        XCTAssertEqual(payload.facts, [
            UserFact(id: "a", fact: "Works as a nurse in Pune", category: .work, updatedAt: "2026-06-01T00:00:00Z"),
        ])
        XCTAssertTrue(payload.available)
    }

    func testAMissingTableIsAnEmptyList() throws {
        let payload = try decode(#"{"facts":[],"available":false}"#)
        XCTAssertTrue(payload.facts.isEmpty)
        XCTAssertFalse(payload.available)
    }

    func testAnUnknownCategoryReadsAsOther() throws {
        let payload = try decode(#"{"facts":[{"id":"a","fact":"Plays chess","category":"hobbies","updated_at":"x"}]}"#)
        XCTAssertEqual(payload.facts.first?.category, .other)
        XCTAssertTrue(payload.available)
    }

    func testGroupsFollowDisplayOrderNewestFirstAndSkipEmptyCategories() {
        let facts = [
            UserFact(id: "1", fact: "Worried about father's health", category: .worries, updatedAt: "2026-05-01"),
            UserFact(id: "2", fact: "Works as a nurse", category: .work, updatedAt: "2026-01-01"),
            UserFact(id: "3", fact: "Got a promotion", category: .work, updatedAt: "2026-09-01"),
            UserFact(id: "4", fact: "Engaged since June 2026", category: .relationships, updatedAt: "2026-06-01"),
        ]
        let groups = FactGrouping.groups(facts)
        XCTAssertEqual(groups.map(\.category), [.work, .relationships, .worries])
        XCTAssertEqual(groups.first?.facts.map(\.id), ["3", "2"])
    }

    func testEveryServerCategoryIsKnown() {
        // Must match the check constraint in 0008_user_facts.sql.
        XCTAssertEqual(
            FactCategory.allCases.map(\.rawValue),
            ["work", "relationships", "family", "health", "money", "home", "goals", "worries", "other"]
        )
    }
}
