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

    private static let moods = [1, 2, 3, 4, 5]

    /// Computed rather than stored, so the words follow a change of language.
    private static func label(_ mood: Int) -> String {
        switch mood {
        case 1: L10n.string("Rough")
        case 2: L10n.string("Low")
        case 3: L10n.string("Okay")
        case 4: L10n.string("Good")
        default: L10n.string("Great")
        }
    }

    var body: some View {
        Group {
            if available {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Check in").eyebrow()
                    Text("How was today?").font(.brutTitle(20)).foregroundStyle(Theme.fg)
                    HStack(spacing: 8) {
                        ForEach(Self.moods, id: \.self) { mood in
                            face(mood, Self.label(mood))
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
            return L10n.string("Check in for \(summary.needed) more days and Astrya will compare your days with where the Moon was for you.")
        }
        return L10n.string("No clear pattern yet between your days and the Moon. That is an answer too; it keeps checking.")
    }

    private func face(_ mood: Int, _ label: String) -> some View {
        let on = today == mood
        return Button {
            Task { await pick(mood) }
        } label: {
            VStack(spacing: 4) {
                Text("\(mood)").font(.brutNumeral(22))
                // Five across: a longer Hindi or Gujarati word shrinks to fit.
                Text(label).font(.system(size: 11, weight: .medium))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .foregroundStyle(on ? Theme.ink : Theme.fg)
            .frame(maxWidth: .infinity, minHeight: 58)
            .brutBordered(fill: on ? Theme.accent : Theme.fg.opacity(0.04), line: on ? Theme.accent : Theme.line)
        }
        .buttonStyle(DipButtonStyle())
        .accessibilityLabel(L10n.string("\(label), \(mood) of 5"))
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
            self.error = L10n.string("That didn't save. Try again.")
        }
    }
}
