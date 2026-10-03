import SwiftUI

/// What the timeline is, in plain words.
///
/// Static on purpose. The per-period meanings are written for the person; this
/// is the one page that explains the idea itself, and it should read the same
/// for everyone so it can be trusted the way a caption is trusted.
struct PeriodExplainerView: View {
    @Environment(\.dismiss) private var dismiss

    private let sections: [(String, String)] = [
        (
            "What these periods are",
            "Vedic astrology divides a life into a fixed sequence of chapters, each ruled by one planet. The sequence is called Vimshottari dasha. Which chapter you were born into depends on where the Moon was at the moment of your birth, and everything after follows in order."
        ),
        (
            "Why they are different lengths",
            "Each planet's chapter has a set length: Sun 6 years, Moon 10, Mars 7, Rahu 18, Jupiter 16, Saturn 19, Mercury 17, Ketu 7, Venus 20. The whole cycle is 120 years, so most people see eight or nine of them. The one you were born into was already running, which is why your first chapter is shorter than its full length."
        ),
        (
            "Sub-periods",
            "Inside every chapter the same nine planets take turns again, in the same order, starting with the chapter's own planet. These sub-periods are where the texture of a chapter comes from — a Saturn chapter feels different in its Venus months than in its Mars months."
        ),
        (
            "What the meanings are",
            "The line under each chapter is written for you from your own chart and from the moments you have pinned. It is a reading of what that chapter tends to ask of you, not a prediction of events. Past chapters are read in hindsight; future ones as tendencies."
        ),
        (
            "Why pin moments",
            "A chapter is abstract until something real sits inside it. Pinning what actually happened — a move, a job, a loss — lets you see your own life against the pattern, and lets the readings speak to what you have lived rather than to a chart alone."
        ),
    ]

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.bg.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(sections, id: \.0) { title, text in
                            VStack(alignment: .leading, spacing: 8) {
                                Text(title)
                                    .font(.brutTitle(16))
                                    .foregroundStyle(Theme.fg)
                                Text(text)
                                    .font(.brutBody(14))
                                    .foregroundStyle(Theme.muted)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            .padding(16)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .brutBordered()
                        }
                    }
                    .padding(20)
                }
            }
            .navigationTitle("Your periods")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(Theme.fg)
                }
            }
            .toolbarBackground(Theme.bg, for: .navigationBar)
        }
        .tint(Theme.fg)
        .presentationBackground(Theme.bg)
    }
}
