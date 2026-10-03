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

/// Five rows, one per tab, each saying in a sentence what the place is for.
///
/// Shown once, after the chart exists. It is deliberately not a carousel: a
/// list can be read in ten seconds and dismissed, and it is the same list the
/// tab bar's labels point at, so what is learned here is still there after.
struct WelcomeTourView: View {
    var onDone: () -> Void

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.bg.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        ScreenHeader(
                            eyebrow: "Welcome",
                            title: "What's where",
                            blurb: "Five places, along the bottom of the screen. Here is what each one does."
                        )

                        VStack(spacing: 14) {
                            ForEach(MainTabView.Tab.allCases) { tab in
                                HStack(alignment: .top, spacing: 14) {
                                    Image(systemName: tab.symbol)
                                        .font(.system(size: 16, weight: .bold))
                                        .foregroundStyle(Theme.ink)
                                        .frame(width: 40, height: 40)
                                        .background(tab.color)
                                        .overlay(Rectangle().stroke(Theme.line, lineWidth: Theme.lineWidth))
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(tab.title)
                                            .font(.brutTitle(17))
                                            .foregroundStyle(Theme.fg)
                                        Text(tab.blurb)
                                            .font(.brutBody(14))
                                            .foregroundStyle(Theme.muted)
                                            .fixedSize(horizontal: false, vertical: true)
                                    }
                                    Spacer(minLength: 0)
                                }
                                .padding(14)
                                .brutCard()
                                .accessibilityElement(children: .combine)
                            }
                        }

                        SancharaPrimaryButton(title: "Got it", kind: .accent) {
                            WelcomeTour.markSeen()
                            onDone()
                        }
                        .padding(.top, 4)
                    }
                    .padding(20)
                }
            }
            .navigationTitle("")
            .toolbarBackground(Theme.bg, for: .navigationBar)
        }
        .presentationBackground(Theme.bg)
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(false)
        .onDisappear {
            // Swiping it away counts as having seen it.
            WelcomeTour.markSeen()
        }
    }
}
