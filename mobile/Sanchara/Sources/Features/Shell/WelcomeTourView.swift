import SwiftUI

/// Whether the one-time "what's where" sheet has been shown on this device.
enum WelcomeTour {
    static let key = "sanchara.tourSeen"
    static let didReset = Notification.Name("sanchara.tourReset")

    static var seen: Bool {
        UserDefaults.standard.bool(forKey: key)
    }

    static func markSeen() {
        UserDefaults.standard.set(true, forKey: key)
    }

    /// "Show me around again", from the profile.
    static func reset() {
        UserDefaults.standard.set(false, forKey: key)
        NotificationCenter.default.post(name: didReset, object: nil)
    }
}

/// Five pages, one per tab, each naming the place in one large word and
/// saying in a sentence what it is for.
///
/// Shown once, after the chart exists. Every page can be skipped, and the
/// words on it are the same words on the tab bar, so what is learned here is
/// still there after. Dismissing it in any way — Skip, the last button, or a
/// swipe down — marks it seen; only "Show me around again" in the profile
/// brings it back.
struct WelcomeTourView: View {
    var onDone: () -> Void

    @State private var page = 0
    private let tabs = MainTabView.Tab.allCases

    private var isLast: Bool { page == tabs.count - 1 }

    var body: some View {
        ZStack {
            Atmosphere(mood: .dusk)

            VStack(spacing: 0) {
                HStack {
                    Text("What's where").eyebrow()
                    Spacer()
                    Button("Skip") { finish() }
                        .buttonStyle(BrutButtonStyle(kind: .quiet, fullWidth: false))
                        .frame(minHeight: 44)
                        .accessibilityHint("Closes the tour")
                }
                .padding(.horizontal, 24)
                .padding(.top, 16)

                TabView(selection: $page) {
                    ForEach(Array(tabs.enumerated()), id: \.element) { index, tab in
                        TourPage(number: index + 1, tab: tab, color: color(for: tab, at: index))
                            .tag(index)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))

                footer
                    .padding(.horizontal, 24)
                    .padding(.bottom, 20)
            }
        }
        .presentationBackground(Theme.bg)
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(false)
        .onDisappear {
            // Swiping it away counts as having seen it.
            WelcomeTour.markSeen()
        }
    }

    private var footer: some View {
        HStack(spacing: 16) {
            HStack(spacing: 8) {
                ForEach(tabs.indices, id: \.self) { index in
                    Group {
                        if index == page {
                            Circle().fill(Theme.fg)
                        } else {
                            Circle().strokeBorder(Theme.muted, lineWidth: 1)
                        }
                    }
                    .frame(width: 6, height: 6)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Page \(page + 1) of \(tabs.count)")

            Spacer(minLength: 0)

            if isLast {
                SancharaPrimaryButton(title: "Start exploring", kind: .accent) { finish() }
                    .frame(maxWidth: 230)
            } else {
                CircleButton(systemImage: "arrow.right", label: "Next", fill: .accent, size: 60) {
                    withAnimation(Theme.ease) { page = min(page + 1, tabs.count - 1) }
                }
            }
        }
        .frame(minHeight: 60)
    }

    /// The same colours the tab bar fills each place with; the first page
    /// always in the accent.
    private func color(for tab: MainTabView.Tab, at index: Int) -> Color {
        if index == 0 { return Theme.accent }
        switch tab {
        case .today: return Theme.accent
        case .ask: return Theme.ember
        case .kundli: return Theme.fg
        case .life: return Theme.violet
        case .you: return Theme.fg
        }
    }

    private func finish() {
        WelcomeTour.markSeen()
        onDone()
    }
}

/// One place in the app: an orbit around its symbol, its number, its name as
/// one large word, and what it is for.
private struct TourPage: View {
    let number: Int
    let tab: MainTabView.Tab
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Spacer(minLength: 12)

            ZStack {
                OrbitDecoration(color: Theme.fg.opacity(0.3))
                    .frame(width: 240, height: 200)
                Image(systemName: tab.symbol)
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(color)
                    .frame(width: 56, height: 56)
                    .background {
                        Circle().fill(Theme.fg.opacity(0.04))
                        Circle().strokeBorder(Theme.line, lineWidth: Theme.lineWidth)
                    }
                    .accessibilityHidden(true)
            }
            .frame(maxWidth: .infinity, minHeight: 200, alignment: .trailing)

            Spacer(minLength: 12)

            NumberBadge(number: number)

            Text(tab.title)
                .font(.brutDisplay(56))
                .tracking(-56 * 0.035)
                .foregroundStyle(color)
                .lineLimit(1)
                .minimumScaleFactor(0.6)

            Text(tab.blurb)
                .font(.brutBody(17))
                .foregroundStyle(Theme.fg.opacity(0.86))
                .lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)

            Spacer(minLength: 24)
        }
        .padding(.horizontal, 24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}
