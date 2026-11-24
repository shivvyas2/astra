import SwiftUI

/// Whether a moment should play, and the record that it has. Nothing plays
/// under Reduce Motion, iOS's or the app's own.
@MainActor
enum MotionGate {
    enum Scope { case onceEver, oncePerLaunch }

    private static var playedThisLaunch: Set<String> = []

    static func shouldPlay(_ key: String, _ scope: Scope, defaults: UserDefaults = .standard) -> Bool {
        guard !Theme.reducesMotion else { return false }
        switch scope {
        case .onceEver: return !defaults.bool(forKey: storageKey(key))
        case .oncePerLaunch: return !playedThisLaunch.contains(key)
        }
    }

    static func recordPlayed(_ key: String, _ scope: Scope, defaults: UserDefaults = .standard) {
        switch scope {
        case .onceEver: defaults.set(true, forKey: storageKey(key))
        case .oncePerLaunch: playedThisLaunch.insert(key)
        }
    }

    static func resetForTests() { playedThisLaunch = [] }
    static func storageKey(_ key: String) -> String { "motion.played.\(key)" }
}

extension EnvironmentValues {
    /// False on a tab that is mounted but not the one on screen. Every page
    /// stays mounted, so appearing is not the same as being seen.
    @Entry var pageIsShowing = true
}

private struct FirstVisible: ViewModifier {
    let fraction: CGFloat
    let action: () -> Void
    @Environment(\.pageIsShowing) private var pageIsShowing
    @State private var inView = false
    @State private var fired = false

    func body(content: Content) -> some View {
        content
            .onGeometryChange(for: Bool.self) { proxy in
                guard let scroll = proxy.bounds(of: .scrollView) else { return true }
                let seen = scroll.intersection(CGRect(origin: .zero, size: proxy.size))
                return !seen.isNull && seen.height >= proxy.size.height * fraction
            } action: { inView = $0; fire() }
            .onChange(of: pageIsShowing) { fire() }
    }

    private func fire() {
        guard !fired, inView, pageIsShowing else { return }
        fired = true
        action()
    }
}

extension View {
    /// Runs once, when `fraction` of this view's height can actually be seen:
    /// scrolled into view, on the tab that is showing.
    func onFirstVisible(_ fraction: CGFloat = 0.5, _ action: @escaping () -> Void) -> some View {
        modifier(FirstVisible(fraction: fraction, action: action))
    }
}

/// Draws one playing moment: hands `draw` the seconds since it began, every
/// frame until it is removed. Purely visual.
struct InkCanvas: View {
    let start: Date
    /// Room around the view for ink that runs past its edges.
    static let bleed: CGFloat = 36
    let draw: (GraphicsContext, CGSize, Double) -> Void

    var body: some View {
        SwiftUI.TimelineView(.animation) { frame in
            Canvas { context, size in
                var inner = context
                inner.translateBy(x: Self.bleed, y: Self.bleed)
                let room = CGSize(width: size.width - 2 * Self.bleed, height: size.height - 2 * Self.bleed)
                draw(inner, room, frame.date.timeIntervalSince(start))
            }
        }
        .padding(-Self.bleed)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
