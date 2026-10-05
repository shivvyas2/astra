import Foundation

/// Formatting for the admin screens. Pure and locale-pinned where the output
/// is compared in tests, so "1,204" means the same thing on every device.
enum AdminFormat {
    private static let posix = Locale(identifier: "en_US_POSIX")

    // MARK: Numbers

    /// "1,204" — a count in full, for stat cards up to 9,999 and for VoiceOver.
    static func grouped(_ value: Int) -> String {
        let f = NumberFormatter()
        f.locale = posix
        f.numberStyle = .decimal
        f.usesGroupingSeparator = true
        f.groupingSeparator = ","
        return f.string(from: NSNumber(value: value)) ?? String(value)
    }

    /// "1,204", "12.4k", "1.2M". Full below ten thousand, where every digit
    /// still fits a card; compact above.
    static func compact(_ value: Int) -> String {
        let magnitude = abs(value)
        let sign = value < 0 ? "-" : ""
        func trim(_ x: Double) -> String {
            let s = String(format: "%.1f", x)
            return s.hasSuffix(".0") ? String(s.dropLast(2)) : s
        }
        switch magnitude {
        case ..<10_000: return grouped(value)
        case ..<999_950: return sign + trim(Double(magnitude) / 1_000) + "k"
        case ..<999_950_000: return sign + trim(Double(magnitude) / 1_000_000) + "M"
        default: return sign + trim(Double(magnitude) / 1_000_000_000) + "B"
        }
    }

    /// "$0", "$0.012", "$3.20", "$1,204", "$12.4k". Fractions of a cent
    /// keep three places, because a reading costs about a cent.
    static func money(_ value: Double) -> String {
        guard value.isFinite else { return "$0" }
        let sign = value < 0 ? "-" : ""
        let v = abs(value)
        if v == 0 { return "$0" }
        if v < 0.001 { return sign + "<$0.001" }
        if v < 1 { return sign + "$" + trimZeros(String(format: "%.3f", v), keep: 2) }
        if v < 1_000 { return sign + "$" + String(format: "%.2f", v) }
        if v < 10_000 { return sign + "$" + grouped(Int(v.rounded())) }
        return sign + "$" + compact(Int(v.rounded())).replacingOccurrences(of: "$", with: "")
    }

    /// The number part of a cost, for a card that prints "USD" small beside it.
    static func moneyNumber(_ value: Double) -> String {
        String(money(value).drop { $0 == "$" || $0 == "-" || $0 == "<" })
    }

    /// "62%". `value` is 0–1.
    static func percent(_ value: Double) -> String {
        guard value.isFinite else { return "—" }
        return "\(Int((value * 100).rounded()))%"
    }

    /// "0.012" keeps three places but "0.300" becomes "0.30": at least `keep` decimals.
    private static func trimZeros(_ s: String, keep: Int) -> String {
        guard let dot = s.firstIndex(of: ".") else { return s }
        var out = s
        while out.hasSuffix("0"), out.distance(from: dot, to: out.endIndex) - 1 > keep { out.removeLast() }
        return out
    }

    // MARK: Dates

    /// Reads the server's timestamps: ISO 8601 with or without fractional
    /// seconds, Postgres's space-separated form, or a bare `yyyy-MM-dd`
    /// (taken as midnight UTC).
    static func parseDate(_ raw: String?) -> Date? {
        guard let raw = raw?.trimmingCharacters(in: .whitespaces), !raw.isEmpty else { return nil }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = iso.date(from: raw) { return d }
        iso.formatOptions = [.withInternetDateTime]
        if let d = iso.date(from: raw) { return d }
        let normalised = raw.replacingOccurrences(of: " ", with: "T")
        if normalised != raw, let d = parseDate(normalised) { return d }
        let day = DateFormatter()
        day.locale = posix
        day.timeZone = TimeZone(identifier: "UTC")
        day.dateFormat = "yyyy-MM-dd"
        if raw.count == 10, let d = day.date(from: raw) { return d }
        return nil
    }

    /// "just now", "5m ago", "3h ago", "yesterday", "4d ago", then "12 Mar",
    /// or "12 Mar 2025" outside the current year. Nil reads as "never".
    static func relative(_ date: Date?, now: Date = Date(), calendar: Calendar = .current) -> String {
        guard let date else { return "never" }
        let seconds = now.timeIntervalSince(date)
        if seconds < 0 { return shortDate(date, calendar: calendar) }
        if seconds < 60 { return "just now" }
        if seconds < 3_600 { return "\(Int(seconds / 60))m ago" }
        if calendar.isDate(date, inSameDayAs: now) || seconds < 6 * 3_600 { return "\(Int(seconds / 3_600))h ago" }
        let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: date), to: calendar.startOfDay(for: now)).day ?? 0
        if days <= 1 { return "yesterday" }
        if days < 7 { return "\(days)d ago" }
        return shortDate(date, now: now, calendar: calendar)
    }

    static func relative(_ raw: String?, now: Date = Date(), calendar: Calendar = .current) -> String {
        relative(parseDate(raw), now: now, calendar: calendar)
    }

    /// "12 Mar", or "12 Mar 2025" when not this year.
    static func shortDate(_ date: Date, now: Date = Date(), calendar: Calendar = .current) -> String {
        let f = DateFormatter()
        f.locale = posix
        f.calendar = calendar
        f.timeZone = calendar.timeZone
        let sameYear = calendar.component(.year, from: date) == calendar.component(.year, from: now)
        f.dateFormat = sameYear ? "d MMM" : "d MMM yyyy"
        return f.string(from: date)
    }

    /// "Fri 3 Oct · 14:20".
    static func dayAndTime(_ date: Date, calendar: Calendar = .current) -> String {
        let f = DateFormatter()
        f.locale = posix
        f.calendar = calendar
        f.timeZone = calendar.timeZone
        f.dateFormat = "EEE d MMM · HH:mm"
        return f.string(from: date)
    }

    /// "15 Jun 1995" from `1995-06-15`, as written — a birth date is a date,
    /// not an instant, so no timezone shifts it.
    static func birthDate(_ raw: String?) -> String? {
        guard let raw, raw.count >= 10 else { return raw }
        let p = raw.prefix(10).split(separator: "-")
        guard p.count == 3, let y = Int(p[0]), let m = Int(p[1]), let d = Int(p[2]), (1...12).contains(m) else { return raw }
        return "\(d) \(months[m - 1]) \(y)"
    }

    /// "10:30" from "10:30:00".
    static func clock(_ raw: String?) -> String? {
        guard let raw, !raw.isEmpty else { return nil }
        return String(raw.prefix(5))
    }

    static let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

    /// "Mar–Jun 2027", "Dec 2026 – Feb 2027", "Mar 2027" from `yyyy-MM-dd` bounds.
    static func window(start: String?, end: String?) -> String {
        func parts(_ iso: String?) -> (Int, Int)? {
            guard let p = iso?.split(separator: "-"), p.count >= 2,
                  let y = Int(p[0]), let m = Int(p[1]), (1...12).contains(m) else { return nil }
            return (y, m)
        }
        guard let (sy, sm) = parts(start) else { return "" }
        guard let (ey, em) = parts(end) else { return "\(months[sm - 1]) \(sy)" }
        if sy == ey {
            return sm == em ? "\(months[sm - 1]) \(sy)" : "\(months[sm - 1])–\(months[em - 1]) \(sy)"
        }
        return "\(months[sm - 1]) \(sy) – \(months[em - 1]) \(ey)"
    }

    // MARK: Words

    /// The name if there is one, else the part of the email before the @.
    static func displayName(name: String?, email: String?) -> String {
        if let name = name?.trimmingCharacters(in: .whitespaces), !name.isEmpty { return name }
        if let email, let local = email.split(separator: "@").first, !local.isEmpty { return String(local) }
        return "Unnamed"
    }

    /// "AS" for "Asha Sharma", "A" for "asha".
    static func initials(_ name: String) -> String {
        let letters = name.split(whereSeparator: { $0 == " " || $0 == "." || $0 == "_" })
            .prefix(2)
            .compactMap(\.first)
        return letters.isEmpty ? "?" : String(letters).uppercased()
    }

    /// "deep_reading" → "Deep reading".
    static func label(_ raw: String) -> String {
        let spaced = raw.replacingOccurrences(of: "_", with: " ").replacingOccurrences(of: "-", with: " ")
        return spaced.prefix(1).uppercased() + spaced.dropFirst()
    }

    /// "claude-sonnet-4-5-20250929" → "sonnet 4.5". Short enough for a row;
    /// unknown shapes come back unchanged.
    static func modelName(_ raw: String) -> String {
        var parts = raw.lowercased().split(separator: "-").map(String.init)
        if parts.first == "claude" { parts.removeFirst() }
        if let last = parts.last, last.count == 8, Int(last) != nil { parts.removeLast() }
        guard let family = parts.first(where: { Int($0) == nil }) else { return raw }
        let numbers = parts.filter { Int($0) != nil }
        return numbers.isEmpty ? family : "\(family) \(numbers.joined(separator: "."))"
    }
}

// MARK: - Timeline grouping

/// One month of a user's timeline.
struct AdminTimelineMonth: Identifiable, Hashable {
    /// `yyyy-MM`, or `undated` for events whose time could not be read.
    let id: String
    /// "Aug", or "Undated".
    let label: String
    let year: Int?
    /// Oldest first, so a column reads top to bottom in order.
    let events: [AdminUserDetail.TimelineEvent]
}

enum AdminTimelineGrouping {
    static let undatedID = "undated"

    /// Months oldest first (the timeline runs left to right), events oldest
    /// first within each, undated events last. Months with no events are
    /// left out — the scrubber only lists months something happened in.
    static func months(_ events: [AdminUserDetail.TimelineEvent], calendar: Calendar = .current) -> [AdminTimelineMonth] {
        var buckets: [String: (year: Int, month: Int, items: [(Date, AdminUserDetail.TimelineEvent)])] = [:]
        var undated: [AdminUserDetail.TimelineEvent] = []
        for event in events {
            guard let date = event.date else { undated.append(event); continue }
            let parts = calendar.dateComponents([.year, .month], from: date)
            guard let y = parts.year, let m = parts.month else { undated.append(event); continue }
            let key = String(format: "%04d-%02d", y, m)
            buckets[key, default: (y, m, [])].items.append((date, event))
        }
        var result = buckets.keys.sorted().compactMap { key -> AdminTimelineMonth? in
            guard let bucket = buckets[key] else { return nil }
            let ordered = bucket.items.sorted { $0.0 < $1.0 }.map(\.1)
            return AdminTimelineMonth(id: key, label: AdminFormat.months[bucket.month - 1], year: bucket.year, events: ordered)
        }
        if !undated.isEmpty {
            result.append(AdminTimelineMonth(id: undatedID, label: "Undated", year: nil, events: undated))
        }
        return result
    }
}

// MARK: - Memory grouping

enum AdminFactGrouping {
    /// The app's fact categories in display order (`FactCategory`).
    static let order = ["work", "relationships", "family", "health", "money", "home", "goals", "worries", "other"]

    /// Known categories in the app's order, unknown ones after them
    /// alphabetically; newest first within each.
    static func groups(_ facts: [AdminUserDetail.Fact]) -> [(category: String, facts: [AdminUserDetail.Fact])] {
        let byCategory = Dictionary(grouping: facts) { $0.category.lowercased() }
        let known = order.filter { byCategory[$0] != nil }
        let unknown = byCategory.keys.filter { !order.contains($0) }.sorted()
        return (known + unknown).map { key in
            (key, (byCategory[key] ?? []).sorted { ($0.updatedAt ?? "") > ($1.updatedAt ?? "") })
        }
    }

    static func title(_ category: String) -> String {
        switch category {
        case "goals": "Plans and goals"
        case "worries": "On their mind"
        default: AdminFormat.label(category)
        }
    }
}
