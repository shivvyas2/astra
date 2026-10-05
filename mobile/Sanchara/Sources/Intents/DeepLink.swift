import Foundation
import Observation

/// Where an intent, a control, or a widget tap says the app should land.
///
/// Intents run without a UI, sometimes in a different process from the app —
/// a Control Center button lives in the widget extension — so none of them can
/// present anything themselves. They write a destination into the app group and
/// the app drains it when it next comes to the front. The push notification
/// path already works this way (`PushStore.pending`), and this mirrors it on
/// purpose: one habit, two sources.
@Observable
@MainActor
final class DeepLink {
    static let shared = DeepLink()

    enum Destination: Equatable {
        /// Show the kundli.
        case kundli
        /// Open the chat with this question already asked, properly this time.
        case ask(String)
        /// Show the life timeline — a tap on the period widget.
        case timeline
    }

    /// The custom scheme the widget links into, declared in `project.yml`.
    nonisolated static let scheme = "sanchara"

    /// Read and cleared by the view that handles it. Nil when nothing is waiting.
    var pending: Destination?

    /// Re-announces a tapped alert or reading until the tab view takes it.
    private var relay: Task<Void, Never>?

    private init() {}

    /// Called on launch and on every return to the foreground.
    func drain() {
        guard let raw = ChartCache.shared.takePendingDestination() else { return }
        if raw == "kundli" {
            pending = .kundli
        } else if raw == "timeline" {
            pending = .timeline
        } else if raw.hasPrefix("ask:") {
            let question = String(raw.dropFirst("ask:".count))
            if !question.isEmpty { pending = .ask(question) }
        }
    }

    /// Queued by an intent, which may be running anywhere.
    nonisolated func queue(question: String) {
        ChartCache.shared.setPendingDestination("ask:\(question)")
    }

    nonisolated func queueKundli() {
        ChartCache.shared.setPendingDestination("kundli")
    }

    /// Whether this URL is ours to route, as opposed to an auth callback.
    nonisolated static func isDeepLink(_ url: URL) -> Bool {
        url.scheme?.lowercased() == scheme
    }

    /// `sanchara://timeline` and friends. A widget tap opens the app through
    /// the URL directly, so there is no app-group hop here — the destination
    /// is set straight away. Unknown paths are ignored rather than guessed.
    ///
    /// `sanchara://alert/<id>` and `sanchara://reading/<id>` come from the
    /// alert and reading widgets. They open exactly what a tapped notification
    /// for the same row opens, through the same path.
    func handle(url: URL) {
        guard Self.isDeepLink(url) else { return }
        switch url.host?.lowercased() {
        case "timeline": pending = .timeline
        case "kundli": pending = .kundli
        case "alert":
            if let id = Self.itemID(url) { deliver(TappedNotification(id: id, kind: .alert)) }
        case "reading":
            if let id = Self.itemID(url) { deliver(TappedNotification(id: id, kind: .daily)) }
        default: break
        }
    }

    /// The `<id>` in `sanchara://alert/<id>`.
    nonisolated static func itemID(_ url: URL) -> String? {
        let id = url.pathComponents.first { $0 != "/" }
        return (id?.isEmpty ?? true) ? nil : id
    }

    /// Hands a tapped alert or reading to the tab view via `PushStore.pending`.
    ///
    /// The tab view watches that value with `onChange`, which never fires for
    /// a value set before the view existed — a tap that cold-launches the app.
    /// So until the view clears it (which is how it says "handled"), the value
    /// is briefly withdrawn and set again, which reads as a change once the
    /// view is on screen. Gives up after ten seconds.
    func deliver(_ tapped: TappedNotification) {
        relay?.cancel()
        PushStore.shared.pending = tapped
        relay = Task { @MainActor in
            for _ in 0..<20 {
                try? await Task.sleep(for: .milliseconds(400))
                guard !Task.isCancelled, PushStore.shared.pending == tapped else { return }
                PushStore.shared.pending = nil
                try? await Task.sleep(for: .milliseconds(100))
                guard !Task.isCancelled, PushStore.shared.pending == nil else { return }
                PushStore.shared.pending = tapped
            }
        }
    }
}
