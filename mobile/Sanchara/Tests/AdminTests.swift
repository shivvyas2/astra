import XCTest
@testable import Sanchara

// MARK: - Decoding

final class AdminDecodingTests: XCTestCase {

    func testMe() throws {
        XCTAssertTrue(try AdminSamples.decode(AdminMe.self, AdminSamples.me).isAdmin)
        XCTAssertFalse(try AdminSamples.decode(AdminMe.self, "{}").isAdmin)
    }

    func testOverviewFull() throws {
        let o = try AdminSamples.decode(AdminOverview.self, AdminSamples.overview)
        XCTAssertEqual(o.days, 30)
        XCTAssertEqual(o.totals.users, 1204)
        XCTAssertEqual(o.totals.costUsd, 412.37, accuracy: 0.001)
        XCTAssertEqual(o.totals.predictionHitRate ?? 0, 0.72, accuracy: 0.001)
        XCTAssertEqual(o.totals.heavyUsers, 12)
        XCTAssertEqual(o.series.count, 30)
        XCTAssertEqual(o.series.first?.day, "2026-09-05")
        XCTAssertNotNil(o.series.first?.date)
        XCTAssertEqual(o.modes.map(\.mode), ["vedic", "western", "tarot"])
        XCTAssertEqual(o.models.count, 2)
        XCTAssertEqual(o.kinds.first?.kind, "reading")
        XCTAssertEqual(o.topUsers.map(\.id), ["u-1", "u-2", "u-3"])
        XCTAssertEqual(o.topUsers[2].displayName, "kiran", "no name falls back to the email's local part")
    }

    /// The payload before `heavyUsers`/`topUsers` existed, with the retired
    /// `quotaHits`, and with a null hit rate.
    func testOverviewOlderShapeStillDecodes() throws {
        let json = """
        { "generatedAt": "2026-10-05T09:30:00Z", "days": 7,
          "totals": { "users": 10, "readings": 40, "predictionsHappened": 3, "predictionsDidnt": 1, "predictionHitRate": null, "quotaHits": 4 },
          "series": [], "modes": [], "models": [], "kinds": [] }
        """
        let o = try AdminSamples.decode(AdminOverview.self, json)
        XCTAssertEqual(o.totals.heavyUsers, 0)
        XCTAssertTrue(o.topUsers.isEmpty)
        XCTAssertNil(o.totals.predictionHitRate)
        XCTAssertEqual(o.totals.hitRate ?? 0, 0.75, accuracy: 0.001, "falls back to happened over settled")
        XCTAssertEqual(o.totals.costUsd, 0)
    }

    func testOverviewEmptyObjectAndLooseTypes() throws {
        let empty = try AdminSamples.decode(AdminOverview.self, "{}")
        XCTAssertEqual(empty.days, 30)
        XCTAssertEqual(empty.totals.users, 0)
        XCTAssertNil(empty.totals.hitRate)

        let loose = try AdminSamples.decode(AdminOverview.self, """
        { "days": "90", "totals": { "users": "1204", "readings": 12.0, "deepShare": 18, "costUsd": "3.5" },
          "series": [ { "day": "2026-10-01", "readings": 3 }, "garbage", { "day": "2026-10-02" } ],
          "topUsers": [ { "name": "No id" }, { "id": 42, "costUsd30d": 1 } ] }
        """)
        XCTAssertEqual(loose.days, 90)
        XCTAssertEqual(loose.totals.users, 1204)
        XCTAssertEqual(loose.totals.readings, 12)
        XCTAssertEqual(loose.totals.deepShare, 0.18, accuracy: 0.0001, "a percentage reads as a share")
        XCTAssertEqual(loose.totals.costUsd, 3.5)
        XCTAssertEqual(loose.series.count, 2, "a malformed row drops that row only")
        XCTAssertEqual(loose.series[1].readings, 0)
        XCTAssertEqual(loose.topUsers.map(\.id), ["42"], "a row without an id is dropped; a numeric id reads as text")
    }

    func testUsersPage() throws {
        let page = try AdminSamples.decode(AdminUsersPage.self, AdminSamples.users)
        XCTAssertEqual(page.total, 1204)
        XCTAssertEqual(page.users.count, 3)
        XCTAssertEqual(page.users[0].costUsd30d, 18.42, accuracy: 0.001)
        XCTAssertTrue(page.users[0].hasPush)
        XCTAssertTrue(page.users[2].isAdmin)
        XCTAssertNil(page.users[2].place)

        let sparse = try AdminSamples.decode(AdminUsersPage.self, #"{ "users": [ { "id": "x" } ] }"#)
        XCTAssertEqual(sparse.total, 1, "a missing total reads as the rows sent")
        XCTAssertEqual(sparse.users[0].displayName, "Unnamed")
        XCTAssertEqual(sparse.users[0].readings, 0)
        XCTAssertFalse(sparse.users[0].hasPush)
    }

    func testUserDetailFull() throws {
        let d = try AdminSamples.decode(AdminUserDetail.self, AdminSamples.userDetail)
        XCTAssertEqual(d.user.displayName, "Asha Sharma")
        XCTAssertEqual(d.user.birth?.timeKnown, false)
        XCTAssertEqual(d.user.birth?.timezone, "Asia/Kolkata")
        XCTAssertEqual(d.user.chart?.antardashaEnd, "2027-03-01")
        XCTAssertEqual(d.stats.readings, 1204)
        XCTAssertEqual(d.timeline.count, 9)
        XCTAssertEqual(d.timeline[1].refId, "c-1")
        XCTAssertNil(d.timeline[0].refId)
        XCTAssertEqual(d.conversations.map(\.id), ["c-1", "c-3"])
        XCTAssertEqual(d.memory.facts.count, 4)
        XCTAssertEqual(d.memory.summaries.first?.topics, ["career", "money"])
        XCTAssertEqual(d.memory.predictions.map(\.status), ["open", "happened", "didnt"])
        XCTAssertEqual(d.memory.predictions[0].windowLabel, "Mar–Jun 2027")
        XCTAssertEqual(d.usage.count, 30)
    }

    func testUserDetailMinimal() throws {
        let d = try AdminSamples.decode(AdminUserDetail.self, #"{ "user": { "id": "u-7", "email": "a@b.co" } }"#)
        XCTAssertNil(d.user.birth)
        XCTAssertNil(d.user.chart)
        XCTAssertEqual(d.stats.readings, 0)
        XCTAssertTrue(d.timeline.isEmpty)
        XCTAssertTrue(d.memory.facts.isEmpty)
        XCTAssertTrue(d.usage.isEmpty)

        let birthWithoutFlag = try AdminSamples.decode(AdminUserDetail.self, #"{ "user": { "id": "u", "birth": { "date": "1990-01-02" } } }"#)
        XCTAssertEqual(birthWithoutFlag.user.birth?.timeKnown, true, "a missing flag means the time is known")

        XCTAssertThrowsError(try AdminSamples.decode(AdminUserDetail.self, "{}"), "no user is not a user detail")
    }

    func testPredictionConfidenceAsNumber() throws {
        let d = try AdminSamples.decode(AdminUserDetail.self, """
        { "user": { "id": "u" }, "memory": { "predictions": [ { "id": "p", "claim": "x", "confidence": 0.8 } ] } }
        """)
        XCTAssertEqual(d.memory.predictions.first?.confidence, "80%")
        XCTAssertEqual(d.memory.predictions.first?.status, "open")
    }

    func testTranscript() throws {
        let t = try AdminSamples.decode(AdminTranscript.self, AdminSamples.transcript)
        XCTAssertEqual(t.conversation.title, "Will I change jobs?")
        XCTAssertEqual(t.messages.count, 4)
        XCTAssertEqual(t.messages[1].role, "assistant")
        XCTAssertTrue(t.messages[1].content.contains("\n"))

        let bare = try AdminSamples.decode(AdminTranscript.self, #"{ "messages": [ { "content": "hi" } ] }"#)
        XCTAssertEqual(bare.conversation.id, "")
        XCTAssertEqual(bare.messages.first?.role, "assistant")
    }

    func testStatusMapping() {
        XCTAssertNil(AdminAPI.error(status: 200, body: Data()))
        XCTAssertEqual(AdminAPI.error(status: 401, body: Data()), .notAdmin)
        XCTAssertEqual(AdminAPI.error(status: 403, body: Data()), .notAdmin)
        XCTAssertEqual(AdminAPI.error(status: 500, body: Data(#"{"error":"Boom"}"#.utf8)), .server("Boom"))
        XCTAssertEqual(AdminAPI.pathSafe("a/b?c"), "a%2Fb%3Fc")
        XCTAssertEqual(AdminAPI.pathSafe("2f1c-9a"), "2f1c-9a")
    }
}

// MARK: - Formatting

final class AdminFormatTests: XCTestCase {
    private var utc: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }

    func testMoney() {
        XCTAssertEqual(AdminFormat.money(0), "$0")
        XCTAssertEqual(AdminFormat.money(0.0004), "<$0.001")
        XCTAssertEqual(AdminFormat.money(0.0224), "$0.022")
        XCTAssertEqual(AdminFormat.money(0.3), "$0.30")
        XCTAssertEqual(AdminFormat.money(3.2), "$3.20")
        XCTAssertEqual(AdminFormat.money(412.374), "$412.37")
        XCTAssertEqual(AdminFormat.money(1204.4), "$1,204")
        XCTAssertEqual(AdminFormat.money(12_400), "$12.4k")
        XCTAssertEqual(AdminFormat.money(-3.2), "-$3.20")
        XCTAssertEqual(AdminFormat.moneyNumber(412.37), "412.37")
    }

    func testCompactAndGrouped() {
        XCTAssertEqual(AdminFormat.grouped(1204), "1,204")
        XCTAssertEqual(AdminFormat.compact(0), "0")
        XCTAssertEqual(AdminFormat.compact(1204), "1,204")
        XCTAssertEqual(AdminFormat.compact(9_999), "9,999")
        XCTAssertEqual(AdminFormat.compact(12_400), "12.4k")
        XCTAssertEqual(AdminFormat.compact(18_000), "18k")
        XCTAssertEqual(AdminFormat.compact(999_999), "1M")
        XCTAssertEqual(AdminFormat.compact(1_260_000), "1.3M")
        XCTAssertEqual(AdminFormat.percent(0.724), "72%")
    }

    func testParseDate() {
        XCTAssertNotNil(AdminFormat.parseDate("2026-10-05T09:30:00.123Z"))
        XCTAssertNotNil(AdminFormat.parseDate("2026-10-05T09:30:00Z"))
        XCTAssertNotNil(AdminFormat.parseDate("2026-10-05T09:30:00+05:30"))
        XCTAssertNotNil(AdminFormat.parseDate("2026-10-05 09:30:00+00:00"))
        XCTAssertEqual(AdminFormat.parseDate("2026-10-05"), Date(timeIntervalSince1970: 1_791_158_400))
        XCTAssertNil(AdminFormat.parseDate("yesterday"))
        XCTAssertNil(AdminFormat.parseDate(nil))
    }

    func testRelative() {
        let now = AdminFormat.parseDate("2026-10-05T12:00:00Z")!
        func rel(_ s: String) -> String { AdminFormat.relative(s, now: now, calendar: utc) }
        XCTAssertEqual(rel("2026-10-05T11:59:30Z"), "just now")
        XCTAssertEqual(rel("2026-10-05T11:55:00Z"), "5m ago")
        XCTAssertEqual(rel("2026-10-05T09:00:00Z"), "3h ago")
        XCTAssertEqual(rel("2026-10-04T08:00:00Z"), "yesterday")
        XCTAssertEqual(rel("2026-10-01T08:00:00Z"), "4d ago")
        XCTAssertEqual(rel("2026-03-12T08:00:00Z"), "12 Mar")
        XCTAssertEqual(rel("2025-03-12T08:00:00Z"), "12 Mar 2025")
        XCTAssertEqual(AdminFormat.relative(nil as String?, now: now), "never")
    }

    func testWordsAndDates() {
        XCTAssertEqual(AdminFormat.birthDate("1995-06-15"), "15 Jun 1995")
        XCTAssertEqual(AdminFormat.clock("10:30:00"), "10:30")
        XCTAssertEqual(AdminFormat.window(start: "2026-12-01", end: "2027-02-28"), "Dec 2026 – Feb 2027")
        XCTAssertEqual(AdminFormat.window(start: "2027-03-01", end: nil), "Mar 2027")
        XCTAssertEqual(AdminFormat.initials("Asha Sharma"), "AS")
        XCTAssertEqual(AdminFormat.initials("kiran"), "K")
        XCTAssertEqual(AdminFormat.label("memory_ingest"), "Memory ingest")
        XCTAssertEqual(AdminFormat.modelName("claude-sonnet-4-5-20250929"), "sonnet 4.5")
        XCTAssertEqual(AdminFormat.modelName("claude-haiku-4-5"), "haiku 4.5")
        XCTAssertEqual(AdminFormat.modelName("gpt"), "gpt")
        XCTAssertEqual(AdminFormat.displayName(name: "  ", email: "z@x.io"), "z")
    }
}

// MARK: - Grouping

final class AdminGroupingTests: XCTestCase {
    private var utc: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }

    private func events(_ pairs: [(String, String)]) throws -> [AdminUserDetail.TimelineEvent] {
        let json = pairs.map { #"{ "at": "\#($0.0)", "kind": "reading", "title": "\#($0.1)" }"# }.joined(separator: ",")
        return try AdminSamples.decode(AdminUserDetail.self, #"{ "user": { "id": "u" }, "timeline": [\#(json)] }"#).timeline
    }

    func testTimelineGroupsByMonthInOrder() throws {
        let months = AdminTimelineGrouping.months(try events([
            ("2026-10-03T21:00:00Z", "oct-b"),
            ("2026-08-12T19:00:00Z", "aug-b"),
            ("not a date", "undated"),
            ("2026-08-03T09:00:00Z", "aug-a"),
            ("2025-12-31T23:00:00Z", "dec"),
            ("2026-10-01T01:00:00Z", "oct-a"),
        ]), calendar: utc)
        XCTAssertEqual(months.map(\.id), ["2025-12", "2026-08", "2026-10", "undated"])
        XCTAssertEqual(months.map(\.label), ["Dec", "Aug", "Oct", "Undated"])
        XCTAssertEqual(months[0].year, 2025)
        XCTAssertEqual(months[1].events.map(\.title), ["aug-a", "aug-b"], "oldest first within a month")
        XCTAssertEqual(months[2].events.map(\.title), ["oct-a", "oct-b"])
        XCTAssertNil(months[3].year)
    }

    func testTimelineUsesTheCalendarsTimeZone() throws {
        var kolkata = Calendar(identifier: .gregorian)
        kolkata.timeZone = TimeZone(identifier: "Asia/Kolkata")!
        let e = try events([("2026-08-31T20:00:00Z", "late")])
        XCTAssertEqual(AdminTimelineGrouping.months(e, calendar: utc).first?.id, "2026-08")
        XCTAssertEqual(AdminTimelineGrouping.months(e, calendar: kolkata).first?.id, "2026-09", "01:30 on 1 Sep in India")
        XCTAssertTrue(AdminTimelineGrouping.months([], calendar: utc).isEmpty)
    }

    func testFactsGroupInTheAppsOrder() throws {
        let d = try AdminSamples.decode(AdminUserDetail.self, """
        { "user": { "id": "u" }, "memory": { "facts": [
          { "id": "1", "fact": "a", "category": "zodiac" }, { "id": "2", "fact": "b", "category": "home" },
          { "id": "3", "fact": "c", "category": "work", "updatedAt": "2026-01-01" }, { "id": "4", "fact": "d", "category": "work", "updatedAt": "2026-05-01" } ] } }
        """)
        let groups = AdminFactGrouping.groups(d.memory.facts)
        XCTAssertEqual(groups.map(\.category), ["work", "home", "zodiac"])
        XCTAssertEqual(groups[0].facts.map(\.id), ["4", "3"])
        XCTAssertEqual(AdminFactGrouping.title("goals"), "Plans and goals")
    }
}

// MARK: - Store and gate

@MainActor
final class AdminStoreTests: XCTestCase {

    func testPagingAppendsUntilTotal() async {
        let stub = StubAdminService()
        stub.totalUsers = 120
        let store = AdminStore(service: stub, debounce: .zero)
        await store.reloadUsers()
        XCTAssertEqual(store.users.count, 50)
        XCTAssertTrue(store.hasMoreUsers)
        await store.loadMoreUsers()
        await store.loadMoreUsers()
        XCTAssertEqual(store.users.count, 120)
        XCTAssertFalse(store.hasMoreUsers)
        await store.loadMoreUsers()
        XCTAssertEqual(stub.userCalls.map(\.offset), [0, 50, 100], "no call once everything is loaded")
    }

    func testSearchDebouncesToOneCall() async throws {
        let stub = StubAdminService()
        let store = AdminStore(service: stub, debounce: .milliseconds(80))
        store.queryChanged("a")
        store.queryChanged("as")
        store.queryChanged("ash")
        try await Task.sleep(for: .milliseconds(300))
        XCTAssertEqual(stub.userCalls.map(\.query), ["ash"])
    }

    func testForbiddenFlipsToAdminsOnly() async {
        let stub = StubAdminService()
        stub.failWith = AdminAPI.AdminError.notAdmin
        let store = AdminStore(service: stub)
        await store.loadOverview()
        XCTAssertTrue(store.notAdmin)
        XCTAssertNil(store.overview)
    }

    func testOverviewRangeAndHeavyUsers() async {
        let store = AdminStore(service: StubAdminService())
        await store.loadOverview()
        XCTAssertEqual(store.heavyUserIDs, ["u-1", "u-2", "u-3"])
        await store.selectRange(90)
        XCTAssertEqual(store.range, 90)
        XCTAssertEqual(store.overview?.days, 90)
    }

    func testDetailAndTranscriptErrorsStayLocal() async {
        let stub = StubAdminService()
        stub.failWith = AdminAPI.AdminError.server("Boom")
        let store = AdminStore(service: stub)
        await store.loadUser("u-1")
        XCTAssertEqual(store.detailErrors["u-1"], "Boom")
        XCTAssertFalse(store.notAdmin)
        stub.failWith = nil
        await store.loadUser("u-1")
        XCTAssertNil(store.detailErrors["u-1"])
        XCTAssertNotNil(store.details["u-1"])
        await store.loadTranscript("c-1")
        XCTAssertEqual(store.transcripts["c-1"]?.messages.count, 4)
    }

    func testGateCachesPerUser() async {
        let stub = StubAdminService()
        var user: String? = "user-a"
        let gate = AdminGate(service: stub, currentUser: { user })
        await gate.check()
        await gate.check()
        XCTAssertTrue(gate.isAdmin)
        XCTAssertEqual(stub.meCalls, 1, "asked once per user")

        stub.isAdmin = false
        user = "user-b"
        await gate.check()
        XCTAssertFalse(gate.isAdmin)
        XCTAssertEqual(stub.meCalls, 2)

        user = nil
        await gate.check()
        XCTAssertEqual(gate.status, .notAdmin, "signed out is not an admin")
    }

    func testGateLeavesUnknownOnNetworkFailure() async {
        let stub = StubAdminService()
        stub.failWith = URLError(.notConnectedToInternet)
        let gate = AdminGate(service: stub, currentUser: { "u" })
        await gate.check()
        XCTAssertEqual(gate.status, .unknown)
        stub.failWith = nil
        await gate.check()
        XCTAssertTrue(gate.isAdmin, "asks again after a failure")
    }
}
