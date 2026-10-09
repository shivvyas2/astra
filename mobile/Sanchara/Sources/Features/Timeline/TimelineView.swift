import SwiftUI

/// The life map: every Vimshottari period from birth, with the moments the
/// user has pinned into them.
///
/// The bands are laid out in *information* proportion, not time proportion: a
/// period is as tall as what happened in it. A 20-year mahadasha with nothing
/// pinned should not dwarf the year the user got married. Time is carried by
/// the year range and the "N years" caption instead.
struct TimelineView: View {
    /// True when this screen sits in the tab bar rather than in a sheet: no
    /// "Done" button, no navigation title, and a header at the top of the
    /// scroll that says what the screen is for.
    var embedded = false

    @State private var store = TimelineStore()
    @State private var expanded: Set<String> = []
    @State private var showAdd = false
    @State private var pendingDelete: LifeEvent?
    @State private var showExplainer = false
    @State private var showKeyDates = false
    /// The period last chosen in the scrubber; nil means "the one running now".
    @State private var scrubbed: String?
    @Environment(\.dismiss) private var dismiss
    @Environment(\.navigator) private var navigator

    /// How much of the top the pinned scrubber covers, so a period scrolled
    /// to from it lands just below it rather than underneath.
    private static let scrubberHeight: CGFloat = 64

    var body: some View {
        NavigationStack {
            ZStack {
                Atmosphere(mood: .violet)
                content
            }
            .clearsTabBar(active: embedded)
            .navigationTitle(embedded ? "" : "Your life")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if !embedded {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Done") { dismiss() }
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(Theme.fg)
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    HStack(spacing: 8) {
                        BrutIconButton(systemImage: "calendar", label: "Key dates") { showKeyDates = true }
                        BrutIconButton(systemImage: "plus", label: "Pin a moment") { showAdd = true }
                            .disabled(store.state != .ready)
                    }
                }
            }
            .toolbarBackground(Theme.bg, for: .navigationBar)
        }
        .tint(Theme.fg)
        .presentationBackground(Theme.bg)
        .task { await store.load() }
        .sheet(isPresented: $showKeyDates) {
            KeyDatesView()
        }
        .sheet(isPresented: $showExplainer) {
            PeriodExplainerView()
        }
        .sheet(isPresented: $showAdd) {
            AddMomentView(birthDate: store.birthDate, today: store.today) { event in
                Task { await store.add(event) }
            }
        }
        .sheet(isPresented: Binding(
            get: { !store.candidates.isEmpty },
            set: { if !$0 { store.candidates = [] } }
        )) {
            CandidatesView(store: store)
        }
    }

    @ViewBuilder
    private var content: some View {
        switch store.state {
        case .loading:
            ProgressView().tint(Theme.muted)
        case .needsProfile:
            VStack(spacing: 16) {
                message("Add your birth details first — the timeline is computed from them.")
                SancharaSecondaryButton(title: "Add birth details in You") {
                    if !embedded { dismiss() }
                    navigator.open(.you)
                }
                .frame(maxWidth: 280)
            }
        case .failed(let text):
            VStack(spacing: 16) {
                message(text)
                SancharaSecondaryButton(title: "Try again") { Task { await store.load() } }
                    .frame(maxWidth: 240)
            }
        case .ready:
            timeline
        }
    }

    private var timeline: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0, pinnedViews: [.sectionHeaders]) {
                    if embedded {
                        ScreenHeader(
                            eyebrow: "Life map",
                            title: "Your life in periods",
                            blurb: "Vimshottari dasha periods from birth onward. Pin what really happened and the readings get sharper.",
                            accent: Theme.violet,
                            titleSize: 36,
                            trailingArrow: true
                        )
                        .padding(.bottom, 20)
                    }
                    if store.canOfferScan { scanOffer }
                    if let now = store.now, let band = store.currentBand {
                        NowCard(
                            now: now,
                            band: band,
                            today: store.today,
                            isWriting: store.isExplaining,
                            onExplain: { showExplainer = true },
                            onAsk: { askAbout(now) }
                        )
                        .padding(.bottom, 24)
                    }
                    if hasNoMoments { firstMomentHint }
                    Section {
                        // One plain stack, not lazy rows: there are only nine
                        // or ten periods, and every one must exist for the
                        // scrubber to be able to scroll to it.
                        VStack(alignment: .leading, spacing: 0) {
                            ForEach(store.periods) { band in
                                BandRow(
                                    band: band,
                                    today: store.today,
                                    events: store.eventsIn(band),
                                    isExpanded: expanded.contains(band.id),
                                    onToggle: { toggle(band) },
                                    onDelete: { pendingDelete = $0 }
                                )
                                .id(band.id)
                                .overlay(alignment: .top) {
                                    // The scrubber's landing mark: starts a
                                    // scrubber's height above the band.
                                    Color.clear
                                        .frame(height: Self.scrubberHeight + 1)
                                        .id(Self.landing(band.id))
                                        .padding(.top, -Self.scrubberHeight)
                                        .allowsHitTesting(false)
                                        .accessibilityHidden(true)
                                }
                            }
                        }
                        footer
                    } header: {
                        if store.periods.count > 1 {
                            periodScrubber(proxy)
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, embedded ? 8 : 0)
                .padding(.bottom, 32)
            }
            .refreshable { await store.load() }
            .onAppear {
                // Open on the present, not on birth — "where am I now" is the
                // question people arrive with. The past is one scroll up.
                // With the card on top the present is already at the top of
                // the scroll; jump only when the offer pushes it down.
                guard store.now == nil, let current = store.currentBand else { return }
                proxy.scrollTo(current.id, anchor: .center)
            }
        }
        .confirmationDialog(
            pendingDelete.map { "Remove “\($0.title)”?" } ?? "",
            isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }),
            titleVisibility: .visible
        ) {
            Button("Remove", role: .destructive) {
                if let event = pendingDelete { Task { await store.remove(event) } }
                pendingDelete = nil
            }
            Button("Keep", role: .cancel) { pendingDelete = nil }
        }
    }

    /// True once the periods have loaded and not one moment is pinned in any
    /// of them: the moment to say what the "+" is for.
    private var hasNoMoments: Bool {
        !store.periods.isEmpty && store.periods.allSatisfy { store.eventsIn($0).isEmpty }
    }

    /// The empty timeline's way forward: pin one real moment.
    private var firstMomentHint: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Pin your first moment")
                .font(.brutTitle(18))
                .foregroundStyle(Theme.fg)
            Text("A move, a job, a loss, a wedding. Each one you place sharpens the readings for the periods around it.")
                .font(.brutBody(14))
                .foregroundStyle(Theme.muted)
                .fixedSize(horizontal: false, vertical: true)
            SancharaPrimaryButton(title: "Pin a moment", kind: .accent) { showAdd = true }
                .padding(.top, 4)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .brutCard()
        .padding(.bottom, 28)
    }

    private static func landing(_ id: String) -> String { "landing-\(id)" }

    /// The periods as a strip of names and years, pinned above the list as
    /// it scrolls. Choosing one scrolls the list to it and opens it.
    private func periodScrubber(_ proxy: ScrollViewProxy) -> some View {
        MonthScrubber(
            items: store.periods.map { (id: $0.id, label: "\($0.lord) \($0.startYear)") },
            selection: Binding(
                get: { scrubbed ?? store.currentBand?.id ?? store.periods.first?.id ?? "" },
                set: { id in
                    scrubbed = id
                    withAnimation(Theme.ease) {
                        expanded.insert(id)
                        proxy.scrollTo(Self.landing(id), anchor: .top)
                    }
                }
            ),
            tint: Theme.violet,
            accessibilityName: "Jump to a period"
        )
        .padding(.top, 6)
        .frame(height: Self.scrubberHeight, alignment: .bottom)
        .background {
            // Full-bleed, past the list's side padding, so rows scroll
            // cleanly under it.
            Theme.bg.opacity(0.96)
                .padding(.horizontal, -16)
                .overlay(alignment: .bottom) {
                    BrutDivider().padding(.horizontal, -16)
                }
        }
        .padding(.bottom, 16)
    }

    /// Carries the running period to Ask as a question, sent at once.
    private func askAbout(_ now: NowPeriod) {
        if !embedded { dismiss() }
        navigator.ask(
            "I'm in my \(now.lord) mahadasha, \(now.antardasha) sub-period. What does it mean for me right now, and what should I do with it?",
            true
        )
    }

    private func toggle(_ band: DashaBand) {
        withAnimation(Theme.ease) {
            if expanded.contains(band.id) { expanded.remove(band.id) } else { expanded.insert(band.id) }
        }
    }

    /// The offer to seed the timeline from what the user has already told us,
    /// so it is never an empty grid asking for homework. It comes back once
    /// they have said enough new things for another look to be worth it.
    private var scanOffer: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(store.isRescan ? "You've told me more since last time" : "Fill this in from our conversations")
                .font(.brutTitle(16))
                .foregroundStyle(Theme.fg)
                .fixedSize(horizontal: false, vertical: true)
            Text(store.isRescan
                 ? "I can look through the new conversations for moments to add — you decide what stays."
                 : "You've mentioned things that happened to you. I can find them and place them against your chart — you decide what stays.")
                .font(.brutBody(13))
                .foregroundStyle(Theme.muted)
                .fixedSize(horizontal: false, vertical: true)
            SancharaPrimaryButton(title: store.isRescan ? "Find new moments" : "Find my moments", isLoading: store.isScanning) {
                Task { await store.scan() }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .brutCard(line: Theme.accent.opacity(0.6))
        .padding(.bottom, 20)
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Periods are Vimshottari dasha, computed from your Moon's exact position at birth.")
                .font(.brutMono(11, weight: .regular))
                .foregroundStyle(Theme.muted)
                .fixedSize(horizontal: false, vertical: true)
            Button { showExplainer = true } label: {
                HStack(spacing: 6) {
                    Text("What are these periods?")
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.muted)
                        .accessibilityHidden(true)
                }
                .frame(minHeight: 44)
            }
            .buttonStyle(BrutButtonStyle(kind: .quiet, fullWidth: false))
        }
        .padding(.top, 20)
        .padding(.leading, 28)
    }

    private func message(_ text: String) -> some View {
        Text(text)
            .font(.brutBody(14))
            .foregroundStyle(Theme.muted)
            .multilineTextAlignment(.center)
            .frame(maxWidth: 300)
            .padding(.horizontal, 24)
    }
}

// MARK: - Where you are now

/// The present, answered before anything else: the pair running today, how far
/// through it is, and what it means for this person. The band below repeats
/// the dates; this card is the one place the meaning of *now* is spelled out.
private struct NowCard: View {
    let now: NowPeriod
    let band: DashaBand
    let today: String
    /// True while the server is writing meanings, so an empty card can say
    /// "writing" rather than looking broken.
    let isWriting: Bool
    var onExplain: () -> Void = {}
    var onAsk: () -> Void = {}

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Where you are now").eyebrow()

            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    lordText
                    subText
                }
                VStack(alignment: .leading, spacing: 2) {
                    lordText
                    subText
                }
            }
            .padding(.top, 10)
            .padding(.bottom, 8)
            .accessibilityElement(children: .combine)
            .accessibilityLabel(now.pairLabel)

            DataRow(label: "Main period", value: "\(band.startYear) – \(band.endYear)", valueSize: 22)
            StatRow(
                label: "Progress",
                systemImage: "chart.line.uptrend.xyaxis",
                value: "\(percent)",
                unit: "%",
                showsRule: false
            )

            BrutProgressBar(progress: band.progress(today: today))
                .accessibilityHidden(true)
                .padding(.bottom, 4)

            StatRow(
                label: "Years left",
                systemImage: "hourglass",
                value: yearsLeft,
                unit: "years",
                caption: "until \(band.endYear)"
            )
            .padding(.bottom, 16)

            if let meaning = now.meaning, !meaning.isEmpty {
                Text(meaning)
                    .font(.brutBody(15))
                    .foregroundStyle(Theme.fg)
                    .lineSpacing(2)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                Text(isWriting ? "Writing what this means for you…" : "A meaning for this period will appear here.")
                    .font(.brutBody(13))
                    .foregroundStyle(Theme.muted)
            }

            VStack(spacing: 0) {
                ViewMoreRow(title: "Why this period matters", action: onExplain)
                ViewMoreRow(
                    title: "Ask about \(now.lord)–\(now.antardasha)",
                    systemImage: "arrow.up.right",
                    showsTopRule: false,
                    tint: Theme.accent,
                    action: onAsk
                )
            }
            .padding(.top, 16)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var percent: Int { Int(band.progress(today: today) * 100) }

    /// Years until the main period ends, to one decimal: "6.4".
    private var yearsLeft: String {
        guard let end = TimelineDate.parse(band.end), let now = TimelineDate.parse(today) else {
            return "–"
        }
        let years = max(0, end.timeIntervalSince(now) / (365.25 * 86_400))
        return String(format: "%.1f", years)
    }

    private var lordText: some View {
        Text(now.lord)
            .font(.brutDisplay(56))
            .tracking(-56 * 0.035)
            .foregroundStyle(Theme.accent)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
    }

    private var subText: some View {
        Text("– \(now.antardasha)")
            .font(.brutDisplay(24))
            .tracking(-24 * 0.03)
            .foregroundStyle(Theme.muted)
            .lineLimit(1)
    }
}

// MARK: - One mahadasha

private struct BandRow: View {
    let band: DashaBand
    let today: String
    let events: [LifeEvent]
    let isExpanded: Bool
    let onToggle: () -> Void
    let onDelete: (LifeEvent) -> Void

    /// Periods that have not happened yet recede rather than disappear: seeing
    /// the shape of the rest of your life is part of the point.
    private var isFuture: Bool { !band.isPast && !band.isCurrent }
    private var tint: Color { band.isCurrent ? Theme.accent : Theme.fg }

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            spine
            VStack(alignment: .leading, spacing: 0) {
                header
                if band.isCurrent { progressBar.padding(.top, 10) }
                if isExpanded {
                    if let meaning = band.meaning, !meaning.isEmpty {
                        Text(meaning)
                            .font(.brutBody(13))
                            .foregroundStyle(Theme.fg)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, 10)
                            // A meaning written before the moments changed is
                            // still shown — dimmed, and about to be replaced.
                            .opacity(band.stale ? 0.6 : 1)
                    }
                    antardashaList.padding(.top, 14)
                }
                if !events.isEmpty {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(events) { event in
                            EventRow(event: event, onDelete: { onDelete(event) })
                        }
                    }
                    .padding(.top, 12)
                }
            }
            .padding(.bottom, 28)
        }
        .opacity(isFuture ? 0.45 : 1)
        .contentShape(Rectangle())
        .onTapGesture(perform: onToggle)
    }

    /// The continuous line down the left, with a round node at each period:
    /// lime and filled for the one running now, outlined otherwise.
    private var spine: some View {
        ZStack(alignment: .top) {
            Rectangle()
                .fill(Theme.line)
                .frame(width: Theme.lineWidth)
                .frame(maxHeight: .infinity)
            Group {
                if band.isCurrent {
                    Circle().fill(Theme.accent)
                } else {
                    Circle()
                        .fill(Theme.bg)
                        .overlay(Circle().strokeBorder(Theme.lineStrong.opacity(0.6), lineWidth: Theme.lineWidth))
                }
            }
            .frame(width: 10, height: 10)
            .padding(.top, 12)
        }
        .frame(width: 20)
        .padding(.trailing, 10)
        .accessibilityHidden(true)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(band.lord)
                    .font(.brutDisplay(26))
                    .tracking(-26 * 0.03)
                    .foregroundStyle(tint)
                if band.isCurrent {
                    BrutTag(text: "Now")
                }
                Spacer(minLength: 8)
                Text("\(band.startYear) – \(band.endYear)")
                    .font(.brutMono(13))
                    .foregroundStyle(Theme.muted)
            }
            if let theme = band.theme, !theme.isEmpty {
                Text(theme)
                    .font(.brutBody(14))
                    .foregroundStyle(Theme.fg)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: 6) {
                Text("\(band.years) years")
                if band.eventCount > 0 {
                    Text("·")
                    Text(band.eventCount == 1 ? "1 moment" : "\(band.eventCount) moments")
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.down")
                    .font(.system(size: 12, weight: .semibold))
                    .rotationEffect(.degrees(isExpanded ? 180 : 0))
                    .frame(width: 28, height: 28)
                    .accessibilityHidden(true)
            }
            .font(.brutMono(11, weight: .regular))
            .foregroundStyle(Theme.muted)
            .frame(minHeight: 32)
        }
        .padding(.top, 2)
    }

    private var progressBar: some View {
        BrutProgressBar(progress: band.progress(today: today))
            .accessibilityLabel("\(Int(band.progress(today: today) * 100)) percent through this period")
    }

    private var antardashaList: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Sub-periods").eyebrow()
                .padding(.bottom, 6)
            ForEach(Array(band.antardashas.enumerated()), id: \.offset) { index, sub in
                let isNow = sub.start <= today && today < sub.end
                HStack(alignment: .firstTextBaseline) {
                    if isNow {
                        Circle().fill(Theme.accent).frame(width: 6, height: 6)
                            .accessibilityHidden(true)
                    }
                    Text("\(band.lord)–\(sub.lord)")
                        .font(.system(size: 14, weight: isNow ? .semibold : .regular))
                        .foregroundStyle(isNow ? Theme.accent : Theme.fg)
                    Spacer(minLength: 8)
                    Text("\(String(sub.start.prefix(7))) – \(String(sub.end.prefix(7)))")
                        .font(.brutMono(11, weight: .regular))
                        .foregroundStyle(isNow ? Theme.accent : Theme.muted)
                }
                .padding(.vertical, 10)
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(isNow ? .isSelected : [])
                if index < band.antardashas.count - 1 {
                    BrutDivider()
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .brutBordered()
    }
}

// MARK: - One pinned moment

private struct EventRow: View {
    let event: LifeEvent
    let onDelete: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Circle()
                .strokeBorder(Theme.accent, lineWidth: 1.5)
                .frame(width: 9, height: 9)
                .padding(.top, 5)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(event.title)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.fg)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 6) {
                    Text(event.dateLabel)
                    if let during = event.duringLabel {
                        Text("·")
                        Text(during)
                    }
                }
                .font(.brutMono(11, weight: .regular))
                .foregroundStyle(Theme.muted)
                if let note = event.note, !note.isEmpty {
                    Text(note)
                        .font(.brutBody(12))
                        .foregroundStyle(Theme.muted)
                        .padding(.top, 2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 7)
        .contentShape(Rectangle())
        .contextMenu {
            Button("Remove", systemImage: "trash", role: .destructive, action: onDelete)
        }
    }
}
