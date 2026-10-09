import SwiftUI

/// `GET /api/mood` (lib/mood/patterns.ts).
struct MoodPayload: Decodable {
    struct Checkin: Decodable, Equatable { let day: String; let mood: Int }
    struct Pattern: Decodable, Equatable, Identifiable {
        let key: String
        let label: String
        let sentence: String
        var id: String { key }
    }
    struct Summary: Decodable, Equatable {
        let days: Int
        let patterns: [Pattern]
        let needed: Int
    }
    let available: Bool
    let checkins: [Checkin]
    let summary: Summary?
}

/// One tap a day on Today, and over time what the taps say about the
/// person's sky. Hidden until the server has the mood table. The web draws
/// the same card (components/MoodCheckin.tsx).
struct MoodCheckinCard: View {
    @State private var available = false
    @State private var today: Int?
    @State private var summary: MoodPayload.Summary?
    @State private var error: String?

    private static let faces = [(1, "Rough"), (2, "Low"), (3, "Okay"), (4, "Good"), (5, "Great")]

    var body: some View {
        Group {
            if available {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Check in").eyebrow()
                    Text("How was today?").font(.brutTitle(20)).foregroundStyle(Theme.fg)
                    HStack(spacing: 8) {
                        ForEach(Self.faces, id: \.0) { mood, label in
                            face(mood, label)
                        }
                    }
                    if let error { BrutNotice(text: error) }
                    BrutDivider().padding(.top, 4)
                    Text("Your pattern").eyebrow()
                    if let summary, !summary.patterns.isEmpty {
                        ForEach(summary.patterns) { p in
                            (Text(p.label + ". ").fontWeight(.semibold).foregroundColor(Theme.fg)
                             + Text(p.sentence).foregroundColor(Theme.muted))
                                .font(.brutBody(14))
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    } else {
                        Text(waitingText)
                            .font(.brutBody(14))
                            .foregroundStyle(Theme.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(20)
                .frame(maxWidth: .infinity, alignment: .leading)
                .brutCard()
            }
        }
        .task { await load() }
    }

    private var waitingText: String {
        if let summary, summary.needed > 0 {
            return "Check in for \(summary.needed) more \(summary.needed == 1 ? "day" : "days") and Astrya will compare your days with where the Moon was for you."
        }
        return "No clear pattern yet between your days and the Moon. That is an answer too; it keeps checking."
    }

    private func face(_ mood: Int, _ label: String) -> some View {
        let on = today == mood
        return Button {
            Task { await pick(mood) }
        } label: {
            VStack(spacing: 4) {
                Text("\(mood)").font(.brutNumeral(22))
                Text(label).font(.system(size: 11, weight: .medium))
            }
            .foregroundStyle(on ? Theme.ink : Theme.fg)
            .frame(maxWidth: .infinity, minHeight: 58)
            .brutBordered(fill: on ? Theme.accent : Theme.fg.opacity(0.04), line: on ? Theme.accent : Theme.line)
        }
        .buttonStyle(DipButtonStyle())
        .accessibilityLabel("\(label), \(mood) of 5")
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    /// The person's own calendar date.
    static func localDay(_ date: Date = .now) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }

    private func load() async {
        guard let payload = try? await SancharaAPI.mood() else { return }
        available = payload.available
        today = payload.checkins.first { $0.day == Self.localDay() }?.mood
        summary = payload.summary
    }

    private func pick(_ mood: Int) async {
        let before = today
        today = mood
        error = nil
        do {
            try await SancharaAPI.saveMood(day: Self.localDay(), mood: mood)
            await load()
        } catch {
            today = before
            self.error = "That didn't save. Try again."
        }
    }
}
