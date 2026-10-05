import Supabase
import XCTest
@testable import Sanchara

/// The pure decisions behind the widget refreshing on its own: when a token
/// needs refreshing, how a refreshed session is written back so the app can
/// still read it, when to fetch, when to ask WidgetKit again, and which alert
/// to lead with.
final class WidgetSyncTests: XCTestCase {

    private func utc(_ text: String) -> Date {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: text)!
    }

    // MARK: - Token expiry

    func testTokenWellInsideItsLifetimeIsUsedAsIs() {
        let now = Date(timeIntervalSince1970: 1_000_000)
        XCTAssertFalse(TokenPolicy.needsRefresh(expiresAt: 1_000_000 + 3600, now: now))
    }

    func testTokenInsideTheMarginIsRefreshed() {
        let now = Date(timeIntervalSince1970: 1_000_000)
        XCTAssertTrue(TokenPolicy.needsRefresh(expiresAt: 1_000_000 + 60, now: now))
        XCTAssertFalse(TokenPolicy.needsRefresh(expiresAt: 1_000_000 + 121, now: now))
    }

    func testExpiredTokenIsRefreshed() {
        let now = Date(timeIntervalSince1970: 1_000_000)
        XCTAssertTrue(TokenPolicy.needsRefresh(expiresAt: 999_000, now: now))
    }

    // MARK: - Stored session

    private let refreshResponse = """
    {"access_token":"new-access","token_type":"bearer","expires_in":3600,
     "expires_at":2000003600,"refresh_token":"new-refresh",
     "user":{"id":"ignored"}}
    """.data(using: .utf8)!

    func testTokensAreReadFromSupabaseSwiftsCamelCaseBlob() {
        let blob = #"{"accessToken":"a","refreshToken":"r","expiresAt":123.5,"expiresIn":3600,"tokenType":"bearer","user":{}}"#
        XCTAssertEqual(
            SessionBlob.tokens(from: Data(blob.utf8)),
            SessionTokens(accessToken: "a", refreshToken: "r", expiresAt: 123.5)
        )
    }

    func testTokensAreReadFromSnakeCaseBlob() {
        let blob = #"{"access_token":"a","refresh_token":"r","expires_at":99}"#
        XCTAssertEqual(SessionBlob.tokens(from: Data(blob.utf8))?.refreshToken, "r")
    }

    func testBlobWithoutARefreshTokenIsNoSession() {
        XCTAssertNil(SessionBlob.tokens(from: Data(#"{"accessToken":"a","expiresAt":1}"#.utf8)))
        XCTAssertNil(SessionBlob.tokens(from: Data("not json".utf8)))
    }

    func testMergeReplacesTokensAndKeepsTheStoredUser() throws {
        let stored = #"{"accessToken":"old","refreshToken":"old-r","expiresAt":1,"expiresIn":3600,"tokenType":"bearer","user":{"id":"kept","createdAt":12345.0}}"#
        let merged = try XCTUnwrap(SessionBlob.merging(refreshed: refreshResponse, into: Data(stored.utf8), now: Date()))
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: merged) as? [String: Any])
        XCTAssertEqual(object["accessToken"] as? String, "new-access")
        XCTAssertEqual(object["refreshToken"] as? String, "new-refresh")
        XCTAssertEqual((object["expiresAt"] as? NSNumber)?.doubleValue, 2_000_003_600)
        XCTAssertNil(object["access_token"], "keeps the stored blob's key style")
        let user = try XCTUnwrap(object["user"] as? [String: Any])
        XCTAssertEqual(user["id"] as? String, "kept")
        XCTAssertEqual((user["createdAt"] as? NSNumber)?.doubleValue, 12345.0)
    }

    func testMergeComputesExpiryWhenTheServerOmitsIt() throws {
        let response = Data(#"{"access_token":"a","refresh_token":"r","expires_in":600}"#.utf8)
        let now = Date(timeIntervalSince1970: 5_000)
        let merged = try XCTUnwrap(SessionBlob.merging(refreshed: response, into: Data(#"{"accessToken":"x","refreshToken":"y","expiresAt":1}"#.utf8), now: now))
        XCTAssertEqual(SessionBlob.tokens(from: merged)?.expiresAt, 5_600)
    }

    /// The round trip that matters: a session stored by supabase-swift, merged
    /// by the widget, must still decode as a `Session` in the app — otherwise
    /// the widget's refresh would sign the app out.
    func testMergedBlobStillDecodesAsASupabaseSession() throws {
        let serverSession = """
        {"access_token":"old","token_type":"bearer","expires_in":3600,"expires_at":1700000000,
         "refresh_token":"old-r",
         "user":{"id":"9b0f3e1c-6a3e-4d1b-8f3a-2f6b0c1d2e3f","aud":"authenticated","role":"authenticated",
                 "email":"a@b.co","app_metadata":{},"user_metadata":{},
                 "created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-02T00:00:00Z"}}
        """
        let session = try AuthClient.Configuration.jsonDecoder.decode(Session.self, from: Data(serverSession.utf8))
        // Exactly how supabase-swift's SessionStorage writes it.
        let stored = try JSONEncoder().encode(session)

        let merged = try XCTUnwrap(SessionBlob.merging(refreshed: refreshResponse, into: stored, now: Date()))
        let decoded = try JSONDecoder().decode(Session.self, from: merged)
        XCTAssertEqual(decoded.accessToken, "new-access")
        XCTAssertEqual(decoded.refreshToken, "new-refresh")
        XCTAssertEqual(decoded.expiresAt, 2_000_003_600)
        XCTAssertEqual(decoded.user.id, session.user.id)
        XCTAssertEqual(decoded.user.createdAt, session.user.createdAt)
        XCTAssertEqual(SessionBlob.tokens(from: stored)?.refreshToken, "old-r")
    }

    // MARK: - Fetch throttle

    func testFetchesWhenNeverSynced() {
        XCTAssertTrue(SyncPolicy.shouldFetch(lastSync: nil, now: Date()))
    }

    func testSharesARecentFetch() {
        let now = Date()
        XCTAssertFalse(SyncPolicy.shouldFetch(lastSync: now.addingTimeInterval(-60), now: now))
        XCTAssertTrue(SyncPolicy.shouldFetch(lastSync: now.addingTimeInterval(-11 * 60), now: now))
    }

    func testClockSetBackwardsDoesNotFreezeTheWidget() {
        let now = Date()
        XCTAssertTrue(SyncPolicy.shouldFetch(lastSync: now.addingTimeInterval(3600), now: now))
    }

    // MARK: - Next refresh

    func testNextRefreshFollowsTheMorningRun() {
        XCTAssertEqual(RefreshSchedule.next(after: utc("2026-10-05T01:30:00Z")), utc("2026-10-05T02:45:00Z"))
    }

    func testNextRefreshFollowsTheNightRun() {
        XCTAssertEqual(RefreshSchedule.next(after: utc("2026-10-05T14:30:00Z")), utc("2026-10-05T15:45:00Z"))
    }

    func testNextRefreshIsNeverMoreThanTwoHoursAway() {
        XCTAssertEqual(RefreshSchedule.next(after: utc("2026-10-05T03:00:00Z")), utc("2026-10-05T05:00:00Z"))
        XCTAssertEqual(RefreshSchedule.next(after: utc("2026-10-05T22:00:00Z")), utc("2026-10-06T00:00:00Z"))
    }

    func testNextRefreshIsAlwaysInTheFuture() {
        let now = utc("2026-10-05T02:45:00Z")
        let next = RefreshSchedule.next(after: now)
        XCTAssertGreaterThan(next, now)
        XCTAssertLessThanOrEqual(next.timeIntervalSince(now), RefreshSchedule.maxInterval)
    }

    // MARK: - Alert selection

    private func alert(_ id: String, hoursAgo: Double, read: Bool = false, now: Date) -> ChartCache.CachedAlert {
        ChartCache.CachedAlert(
            id: id, severity: "warning", kinds: [], title: id, body: "",
            createdAt: now.addingTimeInterval(-hoursAgo * 3600),
            readAt: read ? now : nil
        )
    }

    func testLeadsWithTheNewestUnreadAlert() {
        let now = Date()
        let alerts = [
            alert("old", hoursAgo: 48, now: now),
            alert("newest-read", hoursAgo: 1, read: true, now: now),
            alert("new", hoursAgo: 5, now: now),
        ]
        XCTAssertEqual(AlertPick.latestUnread(alerts, now: now)?.id, "new")
        XCTAssertEqual(AlertPick.fresh(alerts, now: now).map(\.id), ["new", "old"])
    }

    func testAllReadIsAllClear() {
        let now = Date()
        XCTAssertNil(AlertPick.latestUnread([alert("a", hoursAgo: 1, read: true, now: now)], now: now))
        XCTAssertNil(AlertPick.latestUnread([], now: now))
    }

    func testStaleUnreadAlertStopsShowing() {
        let now = Date()
        XCTAssertNil(AlertPick.latestUnread([alert("ancient", hoursAgo: 22 * 24, now: now)], now: now))
    }

    // MARK: - Dates and links

    func testParsesPostgresTimestamps() {
        let expected = utc("2026-10-05T02:31:12Z")
        XCTAssertEqual(WidgetDates.parse("2026-10-05T02:31:12+00:00"), expected)
        XCTAssertEqual(WidgetDates.parse("2026-10-05T02:31:12Z"), expected)
        XCTAssertEqual(WidgetDates.parse("2026-10-05 02:31:12+00"), expected)
        let micro = WidgetDates.parse("2026-10-05T02:31:12.123456+00:00")
        XCTAssertEqual(micro?.timeIntervalSince(expected) ?? 0, 0.123, accuracy: 0.001)
        XCTAssertNil(WidgetDates.parse("yesterday"))
    }

    func testAlertLinkRoundTripsThroughDeepLink() throws {
        let url = try XCTUnwrap(WidgetLink.alert("9b0f3e1c-6a3e"))
        XCTAssertEqual(url.absoluteString, "sanchara://alert/9b0f3e1c-6a3e")
        XCTAssertTrue(DeepLink.isDeepLink(url))
        XCTAssertEqual(url.host, "alert")
        XCTAssertEqual(DeepLink.itemID(url), "9b0f3e1c-6a3e")
        XCTAssertNil(DeepLink.itemID(URL(string: "sanchara://alert")!))
    }
}
