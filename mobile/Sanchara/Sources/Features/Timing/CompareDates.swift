import SwiftUI

/// `GET /api/timing/compare` (lib/timing/compare.ts).
struct DateComparison: Decodable, Equatable {
    struct Factor: Decodable, Equatable, Hashable {
        let label: String
        let detail: String
        let score: Int
    }
    struct Day: Decodable, Equatable {
        let date: String
        let score: Int
        let factors: [Factor]
    }
    let a: Day
    let b: Day
    /// "a", "b" or "even".
    let better: String

    var winner: Day? { better == "a" ? a : better == "b" ? b : nil }
}

/// Two dates for one decision, side by side. Lives in Key dates; the web has
/// the same panel (components/CompareDates.tsx).
struct CompareDatesSection: View {
    @State private var first = Calendar.current.date(byAdding: .day, value: 7, to: .now) ?? .now
    @State private var second = Calendar.current.date(byAdding: .day, value: 30, to: .now) ?? .now
    @State private var topic = ""
    @State private var result: DateComparison?
    @State private var busy = false
    @State private var error: String?

    private static let topics: [(String, String)] = [
        ("", "Anything"), ("career", "Career"), ("relationships", "Relationships"), ("money", "Money"),
        ("health", "Health"), ("home", "Home"), ("family", "Family"), ("children", "Children"),
        ("travel", "Travel"), ("education", "Study"),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Decide").eyebrow()
            Text("Compare two dates").font(.brutTitle(22)).foregroundStyle(Theme.fg)
            Text("Signing, a move, a launch: put two days side by side against your chart.")
                .font(.brutBody(14)).foregroundStyle(Theme.muted)
                .fixedSize(horizontal: false, vertical: true)

            DatePicker("First date", selection: $first, in: Date.now..., displayedComponents: .date)
            DatePicker("Second date", selection: $second, in: Date.now..., displayedComponents: .date)
            Picker("It's about", selection: $topic) {
                ForEach(Self.topics, id: \.0) { Text($0.1).tag($0.0) }
            }
            .pickerStyle(.menu)

            SancharaPrimaryButton(title: "Compare", isLoading: busy) { Task { await compare() } }
            if let error { BrutNotice(text: error) }

            if let result {
                Text(result.winner.map { "\(Self.long($0.date)) reads better." } ?? "Neither date stands out: they read about the same.")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.fg)
                day(result.a, best: result.better == "a")
                day(result.b, best: result.better == "b")
                Text("Read with the Moon at noon in your birthplace's time zone. Classical muhurta, computed from your chart.")
                    .font(.brutBody(12)).foregroundStyle(Theme.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .font(.brutBody(15))
        .foregroundStyle(Theme.fg)
        .tint(Theme.accent)
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .brutCard()
    }

    private func day(_ d: DateComparison.Day, best: Bool) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(Self.long(d.date)).font(.system(size: 14, weight: .semibold))
                Spacer()
                if best { BrutTag(text: "Better") }
            }
            Text(d.score > 0 ? "+\(d.score)" : "\(d.score)").font(.brutNumeral(36))
            ForEach(d.factors, id: \.self) { f in
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Circle().fill(f.score > 0 ? Theme.accent : f.score < 0 ? Theme.ember : Theme.muted).frame(width: 6, height: 6)
                    (Text(f.label + ". ").fontWeight(.medium) + Text(f.detail).foregroundColor(Theme.muted))
                        .font(.brutBody(13))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .brutBordered(
            fill: best ? Theme.accent.opacity(0.06) : Theme.fg.opacity(0.04),
            line: best ? Theme.accent : Theme.line
        )
    }

    private static func long(_ iso: String) -> String {
        guard let d = KeyDates.isoDay.date(from: iso) else { return iso }
        let f = DateFormatter()
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "EEE d MMMM yyyy"
        return f.string(from: d)
    }

    private static func iso(_ date: Date) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }

    private func compare() async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            result = try await SancharaAPI.compareDates(Self.iso(first), Self.iso(second), topic: topic.isEmpty ? nil : topic)
        } catch {
            self.error = "Those dates couldn't be read. Try again."
        }
    }
}
