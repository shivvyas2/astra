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
    }

    /// Read and cleared by the view that handles it. Nil when nothing is waiting.
    var pending: Destination?

    private init() {}

    /// Called on launch and on every return to the foreground.
    func drain() {
        guard let raw = ChartCache.shared.takePendingDestination() else { return }
        if raw == "kundli" {
            pending = .kundli
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
}
