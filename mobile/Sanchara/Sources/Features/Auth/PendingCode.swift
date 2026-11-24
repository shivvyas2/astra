import Foundation

/// A sign-in code that has been sent and is waiting to be entered: when, how
/// many times, and how many wrong tries. Pure, so the timers can be tested.
/// Mirrors `lib/auth/pendingCode.ts`.
struct PendingCode: Codable, Equatable {
    var destination: AuthStore.CodeDestination
    /// Nil when nothing has been sent yet, so one can be asked for at once.
    var sentAt: Date?
    var resends = 0
    var tries = 0
    /// Too many tries: no more until then.
    var lockedUntil: Date?

    /// Wrong codes before the screen makes them wait. A million codes, so a
    /// handful of tries is plenty for a person and useless to a script.
    static let maxTries = 5
    static let lockSeconds: TimeInterval = 120
    /// How long to wait before another: longer each time.
    static let resendWaits: [TimeInterval] = [60, 60, 120, 300]

    var isPhone: Bool {
        if case .phone = destination { return true }
        return false
    }

    /// Supabase's email setting, and Twilio Verify's ten minutes.
    var lifetime: TimeInterval { isPhone ? 600 : 3600 }

    func resendIn(at now: Date) -> Int {
        guard let sentAt else { return 0 }
        let wait = Self.resendWaits[min(max(0, resends), Self.resendWaits.count - 1)]
        return max(0, Int((wait - max(0, now.timeIntervalSince(sentAt))).rounded(.up)))
    }

    func expiresIn(at now: Date) -> Int {
        guard let sentAt else { return 0 }
        return max(0, Int((lifetime - max(0, now.timeIntervalSince(sentAt))).rounded(.up)))
    }

    func isExpired(at now: Date) -> Bool { sentAt != nil && expiresIn(at: now) == 0 }

    func lockedFor(at now: Date) -> Int {
        guard let lockedUntil else { return 0 }
        return max(0, Int(lockedUntil.timeIntervalSince(now).rounded(.up)))
    }

    var triesLeft: Int { max(0, Self.maxTries - tries) }

    /// Time to offer another way in.
    var isStuck: Bool { resends >= 2 || tries >= 3 }

    mutating func sent(at now: Date, again: Bool) {
        sentAt = now
        resends = again ? resends + 1 : 0
        tries = 0
        lockedUntil = nil
    }

    mutating func wrongCode(at now: Date) {
        tries += 1
        if tries >= Self.maxTries { lockedUntil = now.addingTimeInterval(Self.lockSeconds) }
    }

    mutating func unlockIfDue(at now: Date) {
        guard let lockedUntil, lockedUntil <= now else { return }
        self.lockedUntil = nil
        tries = 0
    }

    /// "0:42", "12:05".
    static func clock(_ seconds: Int) -> String {
        "\(max(0, seconds) / 60):" + String(format: "%02d", max(0, seconds) % 60)
    }

    // MARK: - Kept across launches

    /// Someone who goes to their mail app and comes back to a fresh launch
    /// still finds the code screen, not the start of sign-in.
    private static let key = "auth.pendingCode"

    static func restore(from defaults: UserDefaults = .standard, now: Date = .now) -> PendingCode? {
        guard let data = defaults.data(forKey: key), let held = try? JSONDecoder().decode(PendingCode.self, from: data),
              held.sentAt != nil, !held.isExpired(at: now) else { return nil }
        return held
    }

    static func save(_ pending: PendingCode?, to defaults: UserDefaults = .standard) {
        if let pending, let data = try? JSONEncoder().encode(pending) {
            defaults.set(data, forKey: key)
        } else {
            defaults.removeObject(forKey: key)
        }
    }
}
