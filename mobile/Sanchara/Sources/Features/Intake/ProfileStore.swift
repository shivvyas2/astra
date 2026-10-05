import Foundation
import Supabase

/// Whether this account has a computed chart yet, the details behind it, and
/// the chart itself.
///
/// `/api/chat` refuses to read for a user without a chart, and the web app
/// redirects to intake in the same case (`app/(app)/app/chat/page.tsx`).
///
/// The `chart` jsonb is fetched separately from the details, and only once the
/// details say there is one. It is roughly 4 KB and changes only when birth
/// details are re-saved, so it is cached to disk: the kundli, the Siri intents,
/// and the widget all read it, and none of them should have to wait on the
/// network to draw a chart that was fixed at birth.
@Observable
@MainActor
final class ProfileStore {
    enum State {
        case loading
        case needsIntake
        case ready
        case failed(String)
    }

    var state: State = .loading
    var details: BirthProfileDetails?
    /// The vedic chart, once loaded. Nil until the first successful fetch, or
    /// on a device that has never been online since signing in.
    var chart: NatalChart?

    @ObservationIgnored private var savedObserver: NSObjectProtocol?

    init() {
        // Birth details can be saved from more than one place — the profile,
        // and the kundli's "Add birth time" — so the store listens rather
        // than relying on every caller to reload it.
        savedObserver = NotificationCenter.default.addObserver(
            forName: .birthDetailsSaved, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in await self?.load() }
        }
    }

    func load() async {
        // A cached chart draws immediately; the fetch below refreshes it.
        if chart == nil { chart = ChartCache.shared.load() }
        if details == nil { details = ChartCache.shared.loadDetails() }
        mergeTimeKnown()

        do {
            let rows: [BirthProfileDetails] = try await Supa.client
                .from("birth_profiles")
                .select("first_name, last_name, birth_date, birth_time, place_name, lat, lng, timezone, avatar_url")
                .not("chart", operator: .is, value: "null")
                .limit(1)
                .execute()
                .value
            details = rows.first
            state = rows.isEmpty ? .needsIntake : .ready
            if let details { ChartCache.shared.save(details: details) }
            if !rows.isEmpty { await loadChart() }
        } catch {
            // An offline launch with a cached chart is still a usable app, so
            // only a device that has never loaded one gets the failure screen.
            if chart != nil, details != nil {
                state = .ready
            } else {
                state = .failed("Could not load your chart. Check your connection and try again.")
            }
        }
    }

    /// Pulls the chart jsonb. Failure is quiet: everything on screen that needs
    /// the chart is additive, and a cached copy usually covers it.
    private func loadChart() async {
        struct Row: Decodable { let chart: ChartBundle }
        do {
            let rows: [Row] = try await Supa.client
                .from("birth_profiles")
                .select("chart")
                .not("chart", operator: .is, value: "null")
                .limit(1)
                .execute()
                .value
            guard let fetched = rows.first?.chart.vedic else { return }
            chart = fetched
            ChartCache.shared.save(chart: fetched)
            mergeTimeKnown()
        } catch {
            // Keep whatever the cache gave us.
        }
    }

    /// The birth details do not select `birth_time_known` (the column may
    /// not exist in production yet); the chart carries the same flag, so it
    /// is copied across whenever both are present.
    private func mergeTimeKnown() {
        guard let chart, var merged = details else { return }
        let known = chart.isTimeKnown
        guard merged.isTimeKnown != known else { return }
        merged.birthTimeKnown = known
        details = merged
    }
}

extension Notification.Name {
    /// Posted after `POST /api/profile` succeeds, so every `ProfileStore`
    /// reloads the details and the chart.
    static let birthDetailsSaved = Notification.Name("com.shivvyas.astra.birthDetailsSaved")
}
