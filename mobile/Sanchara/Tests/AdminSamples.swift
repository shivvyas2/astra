import Foundation
@testable import Sanchara

/// Sample admin payloads in the shape of the server contract, and a stub
/// service that answers with them.
enum AdminSamples {
    static func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    static let me = #"{ "isAdmin": true }"#

    static let overview = """
    {
      "generatedAt": "2026-10-05T09:30:00.000Z",
      "days": 30,
      "totals": {
        "users": 1204, "newUsers": 86, "activeUsers7d": 312, "readings": 18432, "readingsToday": 214,
        "deepShare": 0.18, "costUsd": 412.37, "costToday": 9.84, "costPerReading": 0.0224,
        "facts": 5310, "conversationMemories": 2210, "predictionsOpen": 640, "predictionsHappened": 118,
        "predictionsDidnt": 46, "predictionHitRate": 0.72, "dailyReadings": 4021, "alertsSent": 932,
        "pushDevices": 488, "lifeEvents": 377, "heavyUsers": 12
      },
      "series": [\(series)],
      "modes": [ { "mode": "vedic", "readings": 11020 }, { "mode": "western", "readings": 5120 }, { "mode": "tarot", "readings": 2292 } ],
      "models": [
        { "model": "claude-sonnet-4-5-20250929", "calls": 15210, "costUsd": 351.2 },
        { "model": "claude-haiku-4-5", "calls": 30120, "costUsd": 61.17 }
      ],
      "kinds": [ { "kind": "reading", "calls": 18432, "costUsd": 330.1 }, { "kind": "memory_ingest", "calls": 9800, "costUsd": 52.0 }, { "kind": "daily", "calls": 4021, "costUsd": 30.27 } ],
      "topUsers": [
        { "id": "u-1", "name": "Asha Sharma", "email": "asha@example.com", "costUsd30d": 18.42, "readings30d": 610 },
        { "id": "u-2", "name": "Rohan Mehta", "email": "rohan@example.com", "costUsd30d": 11.05, "readings30d": 402 },
        { "id": "u-3", "name": null, "email": "kiran@example.com", "costUsd30d": 7.3, "readings30d": 260 }
      ]
    }
    """

    /// Thirty days of activity with a gentle wave, ending 2026-10-04.
    static var series: String {
        (0..<30).map { i -> String in
            let day = Calendar(identifier: .gregorian).date(byAdding: .day, value: i, to: Date(timeIntervalSince1970: 1_788_566_400))!
            let f = DateFormatter()
            f.locale = Locale(identifier: "en_US_POSIX")
            f.timeZone = TimeZone(identifier: "UTC")
            f.dateFormat = "yyyy-MM-dd"
            let readings = 520 + Int(140 * sin(Double(i) / 3.2)) + i * 6
            return #"{ "day": "\#(f.string(from: day))", "signups": \#(2 + i % 5), "readings": \#(readings), "costUsd": \#(Double(readings) * 0.0224), "activeUsers": \#(180 + i * 3) }"#
        }
        .joined(separator: ",")
    }

    static let users = """
    {
      "users": [
        { "id": "u-1", "email": "asha@example.com", "name": "Asha Sharma", "place": "Pune, India", "createdAt": "2026-03-12T10:00:00Z",
          "lastActiveAt": "2026-10-05T08:10:00Z", "plan": "plus", "readings": 1204, "readings7d": 61, "costUsd30d": 18.42,
          "facts": 48, "predictionsOpen": 9, "hasPush": true, "isAdmin": false },
        { "id": "u-2", "email": "rohan@example.com", "name": "Rohan Mehta", "place": "Mumbai", "createdAt": "2026-05-01T10:00:00Z",
          "lastActiveAt": "2026-10-01T18:00:00Z", "plan": "free", "readings": 402, "readings7d": 12, "costUsd30d": 11.05,
          "facts": 20, "predictionsOpen": 3, "hasPush": false, "isAdmin": false },
        { "id": "u-9", "email": "shiv@example.com", "name": "Shiv", "createdAt": "2025-12-01T10:00:00Z",
          "lastActiveAt": "2026-09-02T18:00:00Z", "plan": "free", "readings": 88, "readings7d": 0, "costUsd30d": 0.42,
          "facts": 4, "predictionsOpen": 1, "hasPush": true, "isAdmin": true }
      ],
      "total": 1204
    }
    """

    static let userDetail = """
    {
      "user": { "id": "u-1", "email": "asha@example.com", "name": "Asha Sharma", "createdAt": "2026-03-12T10:00:00Z",
        "lastActiveAt": "2026-10-05T08:10:00Z", "plan": "plus", "isAdmin": false,
        "birth": { "date": "1995-06-15", "time": "10:30:00", "timeKnown": false, "place": "Pune, Maharashtra, India", "timezone": "Asia/Kolkata" },
        "chart": { "lagna": "Vrishchika", "moonSign": "Karka", "sunSign": "Mithuna", "mahadasha": "Venus", "antardasha": "Mercury", "antardashaEnd": "2027-03-01" } },
      "stats": { "readings": 1204, "deepReadings": 140, "costUsd": 61.2, "costUsd30d": 18.42, "facts": 48, "summaries": 30,
        "predictionsOpen": 9, "predictionsHappened": 6, "predictionsDidnt": 2, "lifeEvents": 7, "alerts": 41, "dailyReadings": 120, "pushDevices": 2 },
      "timeline": [
        { "at": "2026-08-03T09:00:00Z", "kind": "signup", "title": "Joined Astrya", "detail": "Signed in with Apple", "refId": null },
        { "at": "2026-08-04T10:00:00Z", "kind": "reading", "title": "Will I change jobs?", "detail": null, "refId": "c-1" },
        { "at": "2026-08-12T19:00:00Z", "kind": "fact", "title": "Works as a product designer", "detail": "From a reading about work", "refId": null },
        { "at": "2026-08-20T08:00:00Z", "kind": "alert", "title": "Rahu transit alert", "refId": null },
        { "at": "2026-09-02T12:00:00Z", "kind": "prediction", "title": "Role change", "detail": "A role change between March and June 2027", "refId": null },
        { "at": "2026-09-09T12:00:00Z", "kind": "reading", "title": "Marriage timing", "refId": "c-2" },
        { "at": "2026-09-21T07:30:00Z", "kind": "life_event", "title": "Moved to Bengaluru", "detail": "Pinned on the timeline", "refId": null },
        { "at": "2026-10-03T21:00:00Z", "kind": "reading", "title": "Money this year", "refId": "c-3" },
        { "at": "2026-10-04T07:00:00Z", "kind": "daily", "title": "Daily reading", "refId": null }
      ],
      "conversations": [
        { "id": "c-1", "title": "Will I change jobs?", "mode": "vedic", "createdAt": "2026-08-04T10:00:00Z", "lastMessageAt": "2026-08-04T10:20:00Z", "messages": 8 },
        { "id": "c-3", "title": "Money this year", "mode": "western", "createdAt": "2026-10-03T21:00:00Z", "lastMessageAt": "2026-10-03T21:10:00Z", "messages": 4 }
      ],
      "memory": {
        "facts": [
          { "id": "f-1", "fact": "Works as a product designer at a fintech startup", "category": "work", "confidence": 0.9, "source": "chat", "updatedAt": "2026-08-12T19:00:00Z" },
          { "id": "f-2", "fact": "Recently moved to Bengaluru", "category": "home", "confidence": 0.8, "source": "life_event", "updatedAt": "2026-09-21T07:30:00Z" },
          { "id": "f-3", "fact": "Considering an MBA", "category": "goals", "confidence": 0.6, "source": "chat", "updatedAt": "2026-09-30T07:30:00Z" },
          { "id": "f-4", "fact": "Wants a role with more ownership", "category": "work", "confidence": 0.7, "source": "chat", "updatedAt": "2026-09-01T07:30:00Z" }
        ],
        "summaries": [ { "conversationId": "c-1", "summary": "Asked about a job change; the reading pointed to spring 2027.", "topics": ["career", "money"], "lastMessageAt": "2026-08-04T10:20:00Z" } ],
        "predictions": [
          { "id": "p-1", "topic": "career", "claim": "A role change between March and June 2027.", "windowStart": "2027-03-01", "windowEnd": "2027-06-30", "confidence": "likely", "status": "open", "checkedAt": null },
          { "id": "p-2", "topic": "money", "claim": "A late payment lands in November.", "windowStart": "2025-11-01", "windowEnd": "2025-11-30", "confidence": "possible", "status": "happened", "checkedAt": "2025-12-02T00:00:00Z" },
          { "id": "p-3", "topic": "love", "claim": "A meaningful introduction in August.", "windowStart": "2026-08-01", "windowEnd": "2026-08-31", "confidence": "possible", "status": "didnt", "checkedAt": "2026-09-02T00:00:00Z" }
        ]
      },
      "usage": [\(usage)]
    }
    """

    static var usage: String {
        (0..<30).map { i -> String in
            let day = String(format: "2026-09-%02d", i + 1)
            let readings = [2, 5, 0, 8, 3, 12, 4][i % 7] + i / 6
            return #"{ "day": "\#(day)", "readings": \#(readings), "costUsd": \#(Double(readings) * 0.03) }"#
        }
        .joined(separator: ",")
    }

    static let transcript = """
    {
      "conversation": { "id": "c-1", "userId": "u-1", "title": "Will I change jobs?", "mode": "vedic", "createdAt": "2026-08-04T10:00:00Z" },
      "messages": [
        { "role": "user", "content": "Will I change jobs next year?", "createdAt": "2026-08-04T10:00:00Z" },
        { "role": "assistant", "content": "**Career**\\nSaturn rules your tenth house from the fourth. Likely: a role change between March and June 2027, when the Venus sub-period ends.", "createdAt": "2026-08-04T10:00:20Z" },
        { "role": "user", "content": "Should I take the offer if it comes?", "createdAt": "2026-08-04T10:05:00Z" },
        { "role": "assistant", "content": "Say yes if it lets you work from where you live.", "createdAt": "2026-08-04T10:05:15Z" }
      ]
    }
    """
}

/// Answers every admin call from the samples, counting what was asked.
final class StubAdminService: AdminService, @unchecked Sendable {
    var isAdmin = true
    var failWith: Error?
    var totalUsers = 120
    private(set) var userCalls: [(query: String, offset: Int)] = []
    private(set) var meCalls = 0

    func me() async throws -> AdminMe {
        meCalls += 1
        if let failWith { throw failWith }
        return try AdminSamples.decode(AdminMe.self, #"{ "isAdmin": \#(isAdmin) }"#)
    }

    func overview(days: Int) async throws -> AdminOverview {
        if let failWith { throw failWith }
        return try AdminSamples.decode(AdminOverview.self, AdminSamples.overview.replacingOccurrences(of: #""days": 30"#, with: #""days": \#(days)"#))
    }

    func users(query: String, limit: Int, offset: Int) async throws -> AdminUsersPage {
        userCalls.append((query, offset))
        if let failWith { throw failWith }
        let base = try AdminSamples.decode(AdminUsersPage.self, AdminSamples.users).users
        let count = max(0, min(limit, totalUsers - offset))
        let rows = (0..<count).map { i -> String in
            let template = base[(offset + i) % base.count]
            return #"{ "id": "u-\#(offset + i)", "name": "\#(template.displayName) \#(offset + i)", "email": "\#(template.email ?? "")", "plan": "\#(template.plan ?? "free")", "readings": \#(template.readings), "readings7d": \#(template.readings7d), "costUsd30d": \#(template.costUsd30d), "lastActiveAt": "\#(template.lastActiveAt ?? "")", "hasPush": \#(template.hasPush), "isAdmin": \#(template.isAdmin) }"#
        }
        return try AdminSamples.decode(AdminUsersPage.self, #"{ "users": [\#(rows.joined(separator: ","))], "total": \#(totalUsers) }"#)
    }

    func user(id: String) async throws -> AdminUserDetail {
        if let failWith { throw failWith }
        return try AdminSamples.decode(AdminUserDetail.self, AdminSamples.userDetail)
    }

    func conversation(id: String) async throws -> AdminTranscript {
        if let failWith { throw failWith }
        return try AdminSamples.decode(AdminTranscript.self, AdminSamples.transcript)
    }
}
