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
            case .today: Theme.accent
            case .ask: Theme.ember
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
    /// While the keyboard is up the tab bar stays where it is and the
    /// keyboard covers it, so whatever is being typed into sits directly on
    /// the keys instead of on top of the tabs.
    @State private var keyboardUp = false

    private var unreadCount: Int { daily.unreadCount + alerts.unreadCount }

    var body: some View {
        // Not a `TabView`: its bar cannot be reliably hidden from outside the
        // pages' own navigation stacks, and a system bar under a custom one
        // is worse than either. All five pages stay mounted so each keeps
        // its scroll position and loaded state; only the chosen one is
        // visible, hit-testable, and read by VoiceOver.
        ZStack(alignment: .bottom) {
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
            // The pages keep clear of the bar only while it can be seen; with
            // the keyboard up they end at the keyboard. Handed down rather
            // than set here as an inset: each page has its own navigation
            // stack, and an inset from outside one does not reach inside it.
            .environment(\.tabBarClearance, keyboardUp ? 0 : BrutTabBar.height)
            // Lets any page (or a sheet it opens) jump to another tab, or
            // carry a question over to Ask, without threading closures.
            .environment(\.navigator, SancharaNavigator(
                ask: { question, send in ask(question, send: send) },
                open: { page in withAnimation(Theme.snap) { tab = page } }
            ))

            // Its own layer, pinned to the bottom of the screen: the keyboard
            // slides over it rather than pushing it up. It also fades, for
            // the short bar a hardware keyboard shows, which would not cover it.
            BrutTabBar(selection: $tab, badge: { $0 == .today ? unreadCount : 0 })
                .opacity(keyboardUp ? 0 : 1)
                .allowsHitTesting(!keyboardUp)
                .accessibilityHidden(keyboardUp)
                .ignoresSafeArea(.keyboard, edges: .bottom)
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
            withAnimation(.easeOut(duration: 0.25)) { keyboardUp = true }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
            withAnimation(.easeOut(duration: 0.25)) { keyboardUp = false }
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
            // Same for a notification tap that launched the app.
            openPushed(PushStore.shared.pending)
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { DeepLink.shared.drain() }
        }
        .onChange(of: DeepLink.shared.pending) { _, destination in
            handle(destination)
        }
        .onChange(of: PushStore.shared.pending) { _, tapped in
            openPushed(tapped)
        }
        .onReceive(NotificationCenter.default.publisher(for: WelcomeTour.didReset)) { _ in
            showTour = true
        }
    }

    /// Opens the reading or alert a notification pointed at, on Today.
    private func openPushed(_ tapped: TappedNotification?) {
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
                    Atmosphere(mood: .dusk)
                    ScrollView {
                        VStack(alignment: .leading, spacing: 20) {
                            ScreenHeader(
                                eyebrow: "Birth chart",
                                title: "Your kundli",
                                blurb: "Where every planet sat the moment you were born."
                            )
                            BrutEmptyState(
                                title: "Loading your chart",
                                message: "Your kundli draws from the chart we computed at sign-up. If this stays empty, check your connection and pull down or tap Try again.",
                                systemImage: "square.split.diagonal.2x2"
                            )
                            SancharaSecondaryButton(title: "Try again") {
                                Task { await profile.load() }
                            }
                        }
                        .padding(20)
                    }
                    .refreshable { await profile.load() }
                }
                .clearsTabBar()
                .navigationTitle("")
                .toolbarBackground(.hidden, for: .navigationBar)
            }
        }
    }

    /// Sends a question from another tab into a fresh reading.
    private func ask(_ question: String) {
        ask(question, send: true)
    }

    /// Carries a question to the Ask tab in a fresh reading: sent at once,
    /// or left in the composer for the person to edit and send.
    private func ask(_ question: String, send: Bool) {
        tab = .ask
        chat.newReading()
        if send {
            chat.send(question)
        } else {
            chat.input = question
        }
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

/// A floating capsule of five places, the selected one filled in its own
/// colour. Labels are always shown: an icon alone is the thing people could
/// not read.
///
/// Placed with `safeAreaInset`, so every page's content stops above it and
/// nothing is hidden behind the bar; the pages' colour fields still run
/// underneath, which is what lets it read as floating.
// MARK: - Navigation between tabs

/// Moves between tabs from inside one: "Ask Astrya about my 7th house"
/// from a kundli sheet, "Go to You" from an empty timeline. Handed down
/// through the environment by `MainTabView`; outside it (a preview, a test)
/// every action does nothing.
struct SancharaNavigator {
    /// Opens Ask in a fresh reading with `question` — sent when `send` is
    /// true, otherwise waiting in the composer.
    var ask: (_ question: String, _ send: Bool) -> Void = { _, _ in }
    /// Switches to another tab.
    var open: (MainTabView.Tab) -> Void = { _ in }
}

private struct NavigatorKey: EnvironmentKey {
    static let defaultValue = SancharaNavigator()
}

extension EnvironmentValues {
    var navigator: SancharaNavigator {
        get { self[NavigatorKey.self] }
        set { self[NavigatorKey.self] = newValue }
    }
}

// MARK: - Clearance

private struct TabBarClearanceKey: EnvironmentKey {
    static let defaultValue: CGFloat = 0
}

extension EnvironmentValues {
    /// How much of the bottom edge the floating tab bar covers right now:
    /// its height, or zero while the keyboard is up.
    var tabBarClearance: CGFloat {
        get { self[TabBarClearanceKey.self] }
        set { self[TabBarClearanceKey.self] = newValue }
    }
}

extension View {
    /// Keeps a tab page's content clear of the floating tab bar. Apply it
    /// inside the page's `NavigationStack`, to the screen's root. `active`
    /// is false when the same screen is shown as a sheet, which sits above
    /// the bar and must not leave room for it.
    func clearsTabBar(active: Bool = true) -> some View {
        modifier(TabBarClearance(active: active))
    }
}

private struct TabBarClearance: ViewModifier {
    let active: Bool
    @Environment(\.tabBarClearance) private var clearance

    func body(content: Content) -> some View {
        content.safeAreaInset(edge: .bottom, spacing: 0) {
            Color.clear.frame(height: active ? clearance : 0)
        }
    }
}

struct BrutTabBar: View {
    /// The 52pt items, 5pt of capsule padding either side, and the 10pt gap
    /// above the bar. The pages reserve exactly this much while it shows.
    static let height: CGFloat = 52 + 5 * 2 + 10 + 2

    @Binding var selection: MainTabView.Tab
    var badge: (MainTabView.Tab) -> Int = { _ in 0 }

    var body: some View {
        HStack(spacing: 2) {
            ForEach(MainTabView.Tab.allCases) { tab in
                let selected = selection == tab
                let count = badge(tab)
                Button {
                    withAnimation(Theme.snap) { selection = tab }
                } label: {
                    VStack(spacing: 3) {
                        Image(systemName: tab.symbol)
                            .font(.system(size: 16, weight: .semibold))
                            .frame(height: 20)
                            .overlay(alignment: .topTrailing) {
                                if count > 0 {
                                    Text(count > 9 ? "9+" : "\(count)")
                                        .font(.system(size: 9, weight: .bold).monospacedDigit())
                                        .foregroundStyle(Theme.ink)
                                        .padding(.horizontal, 4)
                                        .frame(minWidth: 15, minHeight: 15)
                                        .background(Capsule().fill(Theme.accent))
                                        .overlay(Capsule().stroke(Theme.surface, lineWidth: 2))
                                        .offset(x: 11, y: -6)
                                        .accessibilityHidden(true)
                                }
                            }
                        Text(tab.title)
                            .font(.system(size: 11, weight: .semibold))
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    }
                    .foregroundStyle(selected ? Theme.ink : Theme.muted)
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                    .background {
                        if selected {
                            Capsule().fill(tab.color)
                        }
                    }
                    .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(count > 0 ? "\(tab.title), \(count) unread" : tab.title)
                .accessibilityHint(tab.blurb)
                .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
            }
        }
        .padding(5)
        .background {
            Capsule().fill(Theme.surface.opacity(0.92))
            Capsule().strokeBorder(Theme.line, lineWidth: Theme.lineWidth)
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 2)
        .frame(height: Self.height, alignment: .bottom)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Tabs")
    }
}
