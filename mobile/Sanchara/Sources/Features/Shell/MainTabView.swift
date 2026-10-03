import SwiftUI

/// The signed-in app: five named places, always visible.
///
/// Before this, the app opened straight into the chat and everything else hung
/// off a clock icon, a bell, and a menu behind the user's avatar. People did
/// not find the kundli (it was reachable only from Siri and the widget) or the
/// timeline, and asked what the bell was for. A tab bar answers that with
/// words: Today, Ask, Kundli, Life, You. Each screen then opens with one line
/// saying what it is, so nothing has to be explained in person.
struct MainTabView: View {
    let profile: ProfileStore

    enum Tab: String, CaseIterable, Identifiable {
        case today, ask, kundli, life, you

        var id: String { rawValue }

        var title: String {
            switch self {
            case .today: "Today"
            case .ask: "Ask"
            case .kundli: "Kundli"
            case .life: "Life"
            case .you: "You"
            }
        }

        var symbol: String {
            switch self {
            case .today: "sun.max.fill"
            case .ask: "text.bubble.fill"
            case .kundli: "square.split.diagonal.2x2.fill"
            case .life: "point.topleft.down.to.point.bottomright.curvepath.fill"
            case .you: "person.fill"
            }
        }

        /// The fill behind the selected tab. Each place has its own colour,
        /// which is also the colour of its screen header.
        var color: Color {
            switch self {
            case .today: Theme.yellow
            case .ask: Theme.accent
            case .kundli: Theme.fg
            case .life: Theme.violet
            case .you: Theme.fg
            }
        }

        /// What the tab is for, in the tour and for VoiceOver.
        var blurb: String {
            switch self {
            case .today: "Your morning and night readings, and alerts when a dosha or hard transit starts."
            case .ask: "Ask anything. Every answer is read from your real birth chart."
            case .kundli: "Your birth chart: where every planet sat when you were born."
            case .life: "Your life in dasha periods. Pin what happened and the readings sharpen."
            case .you: "Birth details, photo, and your account."
            }
        }
    }

    @Environment(AuthStore.self) private var auth
    @Environment(\.scenePhase) private var scenePhase

    @State private var tab: Tab = .ask
    @State private var chat = ChatStore()
    @State private var daily = DailyStore()
    @State private var alerts = AlertsStore()
    @State private var inboxTab: InboxView.Tab = .daily
    @State private var showTour = !WelcomeTour.seen

    private var unreadCount: Int { daily.unreadCount + alerts.unreadCount }

    var body: some View {
        // Not a `TabView`: its bar cannot be reliably hidden from outside the
        // pages' own navigation stacks, and a system bar under a custom one
        // is worse than either. All five pages stay mounted so each keeps
        // its scroll position and loaded state; only the chosen one is
        // visible, hit-testable, and read by VoiceOver.
        ZStack {
            ForEach(Tab.allCases) { page in
                let selected = tab == page
                content(for: page)
                    .opacity(selected ? 1 : 0)
                    .allowsHitTesting(selected)
                    .accessibilityHidden(!selected)
                    .zIndex(selected ? 1 : 0)
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            BrutTabBar(selection: $tab, badge: { $0 == .today ? unreadCount : 0 })
        }
        .tint(Theme.fg)
        .sheet(isPresented: $showTour) {
            WelcomeTourView { showTour = false }
        }
        .task {
            await daily.load()
            await alerts.load()
            // Asked here rather than at launch: by this point the user has a
            // chart, so "we'll tell you when a dosha starts" means something.
            await PushStore.shared.requestAuthorization()
            await PushStore.shared.register()
        }
        .task {
            // For the period widget: it draws from the cache, and the cache is
            // only written when a timeline arrives. Fetching once here means
            // the widget fills in without the timeline ever being opened.
            await TimelineStore.warmCache()
        }
        .onAppear {
            // A widget tap on a cold launch sets the destination before this
            // view exists, so `onChange` below never fires for it.
            handle(DeepLink.shared.pending)
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { DeepLink.shared.drain() }
        }
        .onChange(of: DeepLink.shared.pending) { _, destination in
            handle(destination)
        }
        .onChange(of: PushStore.shared.pending) { _, tapped in
            guard let tapped else { return }
            PushStore.shared.pending = nil
            Task {
                switch tapped.kind {
                case .daily:
                    inboxTab = .daily
                    await daily.open(id: tapped.id)
                case .alert:
                    inboxTab = .alerts
                    await alerts.open(id: tapped.id)
                }
                tab = .today
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: WelcomeTour.didReset)) { _ in
            showTour = true
        }
    }

    @ViewBuilder
    private func content(for page: Tab) -> some View {
        switch page {
        case .today:
            InboxView(daily: daily, alerts: alerts, tab: $inboxTab, onAsk: ask, embedded: true)
        case .ask:
            ChatView(profile: profile, chat: chat)
        case .kundli:
            kundli
        case .life:
            TimelineView(embedded: true)
        case .you:
            ProfileView(profile: profile, embedded: true)
        }
    }

    /// The kundli needs a chart. Until one has loaded (first launch offline,
    /// say) the tab explains itself rather than showing nothing.
    @ViewBuilder
    private var kundli: some View {
        if let details = profile.details, let chart = profile.chart {
            KundliView(details: details, chart: chart, embedded: true)
        } else {
            NavigationStack {
                ZStack {
                    Theme.bg.ignoresSafeArea()
                    VStack(alignment: .leading, spacing: 20) {
                        ScreenHeader(
                            eyebrow: "Birth chart",
                            title: "Your kundli",
                            blurb: "Where every planet sat the moment you were born."
                        )
                        BrutEmptyState(
                            title: "Loading your chart",
                            message: "Your kundli draws from the chart we computed at sign-up. If this stays empty, check your connection and pull to retry.",
                            systemImage: "square.split.diagonal.2x2"
                        )
                        SancharaSecondaryButton(title: "Try again") {
                            Task { await profile.load() }
                        }
                        Spacer()
                    }
                    .padding(20)
                }
                .navigationTitle("")
                .toolbarBackground(Theme.bg, for: .navigationBar)
            }
        }
    }

    /// Sends a question from another tab into a fresh reading.
    private func ask(_ question: String) {
        tab = .ask
        chat.newReading()
        chat.send(question)
    }

    private func handle(_ destination: DeepLink.Destination?) {
        guard let destination else { return }
        DeepLink.shared.pending = nil
        switch destination {
        case .kundli:
            tab = .kundli
        case .timeline:
            tab = .life
        case .ask(let question):
            // The question Siri declined to answer, asked here for real.
            tab = .ask
            chat.newReading()
            chat.send(question, forceServer: true)
        }
    }
}

// MARK: - The bar

/// Five blocks in a row, the selected one filled. Labels are always shown:
/// an icon alone is the thing people could not read.
struct BrutTabBar: View {
    @Binding var selection: MainTabView.Tab
    var badge: (MainTabView.Tab) -> Int = { _ in 0 }

    var body: some View {
        HStack(spacing: 0) {
            ForEach(MainTabView.Tab.allCases) { tab in
                let selected = selection == tab
                let count = badge(tab)
                Button {
                    withAnimation(Theme.snap) { selection = tab }
                } label: {
                    VStack(spacing: 4) {
                        Image(systemName: tab.symbol)
                            .font(.system(size: 16, weight: .bold))
                        Text(tab.title)
                            .font(.brutMono(9, weight: .bold))
                            .textCase(.uppercase)
                            .tracking(0.8)
                    }
                    .foregroundStyle(selected ? Theme.ink : Theme.fg)
                    .frame(maxWidth: .infinity)
                    .frame(height: 54)
                    .background(selected ? tab.color : Theme.bg)
                    .overlay(alignment: .topTrailing) {
                        if count > 0 {
                            Text(count > 9 ? "9+" : "\(count)")
                                .font(.brutMono(9, weight: .bold))
                                .foregroundStyle(Theme.ink)
                                .padding(.horizontal, 4)
                                .padding(.vertical, 1)
                                .background(Theme.accent)
                                .overlay(Rectangle().stroke(Theme.ink, lineWidth: 1.5))
                                .padding(6)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(count > 0 ? "\(tab.title), \(count) unread" : tab.title)
                .accessibilityHint(tab.blurb)
                .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)

                if tab != MainTabView.Tab.allCases.last {
                    Rectangle().fill(Theme.line).frame(width: Theme.lineWidth)
                }
            }
        }
        .overlay(alignment: .top) {
            Rectangle().fill(Theme.line).frame(height: Theme.lineWidth)
        }
        .background(Theme.bg.ignoresSafeArea(edges: .bottom))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Tabs")
    }
}
