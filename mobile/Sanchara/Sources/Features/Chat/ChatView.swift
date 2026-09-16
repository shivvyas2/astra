import SwiftUI

/// The reading screen — the native counterpart of `components/Chat.tsx`.
struct ChatView: View {
    let profile: ProfileStore

    @Environment(AuthStore.self) private var auth
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var chat = ChatStore()
    @State private var alerts = AlertsStore()
    @State private var daily = DailyStore()
    @State private var inboxTab: InboxView.Tab = .daily
    @State private var suggestions = SuggestionEngine()
    @State private var showKundli = false
    @Environment(\.scenePhase) private var scenePhase
    @State private var showHistory = false
    @State private var showAlerts = false
    @State private var showProfile = false
    @State private var showTimeline = false
    @FocusState private var inputFocused: Bool

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.bg.ignoresSafeArea()
                GlowBackdrop(active: !reduceMotion)

                if chat.messages.isEmpty {
                    openingScreen
                } else {
                    VStack(spacing: 0) {
                        transcript
                        suggestionChips
                        composer
                            .padding(.horizontal, 16)
                            .padding(.top, 8)
                            .padding(.bottom, 8)
                    }
                }
            }
            .toolbar { toolbar }
            .toolbarBackground(.hidden, for: .navigationBar)
            .navigationBarTitleDisplayMode(.inline)
        }
        .tint(Theme.fg)
        .sheet(isPresented: $showHistory) {
            HistoryView(chat: chat)
        }
        .sheet(isPresented: $showProfile) {
            ProfileView(profile: profile)
        }
        .sheet(isPresented: $showKundli) {
            if let details = profile.details, let chart = profile.chart {
                KundliView(details: details, chart: chart)
            }
        }
        .sheet(isPresented: $showTimeline) {
            TimelineView()
        }
        .sheet(isPresented: $showAlerts) {
            InboxView(daily: daily, alerts: alerts, tab: $inboxTab) { question in
                startNewReading()
                chat.send(question)
            }
        }
        .task {
            suggestions.showStarters(for: chat.mode)
            chat.chart = profile.chart
            await chat.start()
        }
        .onChange(of: profile.chart) { _, chart in
            chat.chart = chart
        }
        .task {
            await daily.load()
            await alerts.load()
            // Asked here rather than at launch: by this point the user has a
            // chart, so "we'll tell you when a dosha starts" means something.
            await PushStore.shared.requestAuthorization()
            await PushStore.shared.register()
        }
        .onChange(of: chat.isStreaming) { _, streaming in
            guard !streaming else { return }
            if let last = chat.messages.last, last.role == .assistant, !last.content.isEmpty {
                suggestions.refresh(after: last.content, mode: chat.mode)
            }
        }
        .onChange(of: chat.mode) { _, mode in
            if chat.messages.isEmpty { suggestions.showStarters(for: mode) }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { DeepLink.shared.drain() }
        }
        .onChange(of: DeepLink.shared.pending) { _, destination in
            guard let destination else { return }
            DeepLink.shared.pending = nil
            switch destination {
            case .kundli:
                showKundli = true
            case .ask(let question):
                // The question Siri declined to answer, asked here for real.
                startNewReading()
                chat.send(question, forceServer: true)
            }
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
                showAlerts = true
            }
        }
    }

    // MARK: - Screens

    private var openingScreen: some View {
        VStack(spacing: 32) {
            Spacer()
            Text(greeting)
                .font(.system(size: 28, weight: .light))
                .tracking(-0.5)
                .multilineTextAlignment(.center)
                .foregroundStyle(Theme.fg.opacity(0.9))
            composer
            suggestionChips
            Spacer()
            Spacer()
        }
        .padding(.horizontal, 16)
    }

    private var unreadCount: Int { daily.unreadCount + alerts.unreadCount }

    /// Clears the transcript for a fresh reading. The previous one stays
    /// saved and is one tap away under Readings.
    private func startNewReading() {
        chat.newReading()
        suggestions.showStarters(for: chat.mode)
    }

    private var greeting: String {
        if let firstName = profile.details?.firstName, !firstName.isEmpty {
            return "Let's read your stars, \(firstName)"
        }
        return "Let's read your stars"
    }

    private var transcript: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 24) {
                    ForEach(Array(chat.messages.enumerated()), id: \.element.id) { index, message in
                        row(for: message, isLast: index == chat.messages.count - 1)
                            .frame(maxWidth: .infinity, alignment: message.role == .user ? .trailing : .leading)
                            .id(message.id)
                    }
                    Color.clear.frame(height: 1).id(Self.bottomAnchor)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 24)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: chat.messages.last?.content) { _, _ in
                proxy.scrollTo(Self.bottomAnchor, anchor: .bottom)
            }
            .onChange(of: chat.messages.count) { _, _ in
                proxy.scrollTo(Self.bottomAnchor, anchor: .bottom)
            }
        }
    }

    @ViewBuilder
    private func row(for message: ChatMessage, isLast: Bool) -> some View {
        switch message.role {
        case .user:
            Text(message.content)
                .font(.system(size: 15))
                .foregroundStyle(Theme.fg)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Color.white.opacity(0.06))
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .frame(maxWidth: 300, alignment: .trailing)
        case .assistant:
            if message.content.isEmpty {
                ShimmerText("Reading your chart…", active: !reduceMotion)
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .bottom, spacing: 0) {
                        MarkdownText(markdown: message.content)
                        if isLast && chat.isStreaming {
                            StreamingCaret(active: !reduceMotion)
                        }
                    }
                    if message.source == .onDevice {
                        onDeviceFooter(isLast: isLast)
                    }
                }
            }
        }
    }

    /// Marks an answer the phone wrote, and offers the full reading instead.
    ///
    /// Two things have to be said here and neither is optional. The disclosure
    /// is required — `generative-ai.md › Transparency`, "Clearly identify when
    /// and where you use AI" — and the escape hatch is what makes routing
    /// acceptable at all: if the router guesses wrong about a question, one tap
    /// undoes it (`generative-ai.md › Outputs`, "Make it easy for people to
    /// refine or revert generated results").
    @ViewBuilder
    private func onDeviceFooter(isLast: Bool) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Read from your chart on this device", systemImage: "iphone")
                .font(.system(size: 11))
                .foregroundStyle(Theme.muted.opacity(0.8))
                .labelStyle(.titleAndIcon)

            if isLast && !chat.isStreaming {
                Button("Ask for a full reading") { chat.expandLastAnswer() }
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.accent)
            }
        }
        .accessibilityElement(children: .contain)
    }

    /// Suggested next questions. Generated on-device by Apple Intelligence
    /// after each reading, with written starters where that is unavailable.
    @ViewBuilder
    private var suggestionChips: some View {
        if suggestions.isThinking {
            HStack {
                ShimmerText("Thinking of what to ask next…", active: !reduceMotion)
                Spacer()
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 6)
        } else if !suggestions.suggestions.isEmpty, !chat.isStreaming {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(suggestions.suggestions, id: \.self) { question in
                        Button {
                            suggestions.clear()
                            chat.send(question)
                        } label: {
                            Text(question)
                                .font(.system(size: 13))
                                .foregroundStyle(Theme.fg.opacity(0.9))
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(Color.white.opacity(0.05))
                                .clipShape(Capsule())
                                .overlay(Capsule().stroke(Theme.hairline, lineWidth: 1))
                        }
                    }
                }
                .padding(.horizontal, 20)
            }
            .padding(.bottom, 8)
        }
    }

    // MARK: - Composer

    private var composer: some View {
        @Bindable var chat = chat

        return VStack(spacing: 8) {
            if let error = chat.errorMessage {
                Text(error)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.accent)
                    .multilineTextAlignment(.center)
            }

            HStack(spacing: 6) {
                TextField("", text: $chat.input, prompt: Text("Ask Sanchara…").foregroundStyle(Theme.muted), axis: .vertical)
                    .lineLimit(1...4)
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.fg)
                    .textInputAutocapitalization(.sentences)
                    .focused($inputFocused)
                    .submitLabel(.send)
                    .onSubmit { chat.sendCurrentInput() }
                    .padding(.vertical, 6)

                Button {
                    chat.mode = chat.mode.next
                } label: {
                    HStack(spacing: 6) {
                        Circle().fill(chat.mode.dot).frame(width: 6, height: 6)
                        Text(chat.mode.label)
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.muted)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .contentShape(Rectangle())
                }
                .accessibilityLabel("Reading mode: \(chat.mode.label). Tap to switch.")

                Button {
                    chat.deep.toggle()
                } label: {
                    Text("Deep")
                        .font(.system(size: 12))
                        .foregroundStyle(chat.deep ? Theme.accent : Theme.muted)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(chat.deep ? Theme.accent.opacity(0.15) : .clear)
                        .clipShape(Capsule())
                }
                .accessibilityLabel(chat.deep ? "Deep reading on" : "Deep reading off")

                Button {
                    inputFocused = false
                    chat.sendCurrentInput()
                } label: {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.bg)
                        .frame(width: 34, height: 34)
                        .background(Theme.fg)
                        .clipShape(Circle())
                }
                .disabled(chat.isStreaming || chat.input.trimmingCharacters(in: .whitespaces).isEmpty)
                .opacity(chat.isStreaming || chat.input.trimmingCharacters(in: .whitespaces).isEmpty ? 0.3 : 1)
                .accessibilityLabel("Send")
            }
            .padding(.leading, 16)
            .padding(.trailing, 6)
            .padding(.vertical, 4)
            .background(Theme.fieldFill)
            .clipShape(RoundedRectangle(cornerRadius: 24))
            .overlay(
                RoundedRectangle(cornerRadius: 24)
                    .stroke(Theme.hairline, lineWidth: 1)
            )

            Text("For guidance and reflection. Not a substitute for professional advice.")
                .font(.system(size: 11))
                .foregroundStyle(Theme.muted.opacity(0.7))
                .multilineTextAlignment(.center)
        }
    }

    // MARK: - Toolbar

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Button {
                showHistory = true
            } label: {
                Image(systemName: "clock")
                    .font(.system(size: 16, weight: .light))
                    .foregroundStyle(Theme.muted)
            }
            .accessibilityLabel("Past readings")
        }

        ToolbarItem(placement: .principal) {
            // Just the wordmark. The mode already reads from the composer's
            // pill, and saying it twice made the bar busier, not clearer.
            Text("SANCHARA")
                .font(.system(size: 12, weight: .light))
                .tracking(3.6)
                .foregroundStyle(Theme.fg.opacity(0.85))
        }

        ToolbarItem(placement: .topBarTrailing) {
            Button {
                startNewReading()
            } label: {
                Image(systemName: "square.and.pencil")
                    .font(.system(size: 16, weight: .light))
                    .foregroundStyle(Theme.muted)
            }
            .accessibilityLabel("New reading")
        }

        ToolbarItem(placement: .topBarTrailing) {
            Button {
                showAlerts = true
            } label: {
                Image(systemName: "bell")
                    .font(.system(size: 16, weight: .light))
                    .foregroundStyle(Theme.muted)
                    .overlay(alignment: .topTrailing) {
                        if unreadCount > 0 {
                            Circle()
                                .fill(Theme.accent)
                                .frame(width: 7, height: 7)
                                // A ring in the bar's own colour separates the
                                // dot from the bell's strokes.
                                .overlay(Circle().stroke(Theme.bg, lineWidth: 1.5))
                                .offset(x: 4, y: -3)
                        }
                    }
            }
            .accessibilityLabel(unreadCount > 0 ? "Inbox, \(unreadCount) unread" : "Inbox")
        }

        // The avatar replaces an overflow menu: it is the account, and it looks
        // like the account, rather than three dots that could mean anything.
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                Button("Your timeline") { showTimeline = true }
                Button("Profile & birth details") { showProfile = true }
                Button("New reading") { startNewReading() }
                Button("Sign out", role: .destructive) { Task { await auth.signOut() } }
            } label: {
                AvatarBadge(details: profile.details)
            }
            .accessibilityLabel("Account")
        }
    }

    private static let bottomAnchor = "sanchara-transcript-bottom"
}

// MARK: - Motion

/// The radial glow behind the transcript (`animate-glow` on the web).
struct GlowBackdrop: View {
    var active: Bool
    @State private var pulse = false

    var body: some View {
        RadialGradient(
            colors: [
                Color(hex: 0x635BFF).opacity(0.28),
                Color(hex: 0xE8663D).opacity(0.07),
                .clear,
            ],
            center: .center,
            startRadius: 0,
            endRadius: 260
        )
        .frame(height: 420)
        .blur(radius: 40)
        .opacity(pulse ? 0.9 : 0.55)
        .frame(maxHeight: .infinity, alignment: .top)
        .padding(.top, 120)
        .allowsHitTesting(false)
        .onAppear {
            guard active else { return }
            withAnimation(.easeInOut(duration: 6).repeatForever(autoreverses: true)) { pulse = true }
        }
    }
}

/// `animate-shimmer` — the "Reading your chart…" placeholder.
struct ShimmerText: View {
    let text: String
    var active: Bool
    @State private var dim = false

    init(_ text: String, active: Bool) {
        self.text = text
        self.active = active
    }

    var body: some View {
        Text(text)
            .font(.system(size: 14))
            .foregroundStyle(Theme.muted)
            .opacity(dim ? 0.4 : 1)
            .onAppear {
                guard active else { return }
                withAnimation(.easeInOut(duration: 1.1).repeatForever(autoreverses: true)) { dim = true }
            }
    }
}

/// The blinking `.caret` shown while text is still arriving.
struct StreamingCaret: View {
    var active: Bool
    @State private var visible = true

    var body: some View {
        Text("▍")
            .font(.system(size: 15))
            .foregroundStyle(Theme.fg.opacity(0.9))
            .opacity(visible ? 1 : 0)
            .onAppear {
                guard active else { return }
                withAnimation(.easeInOut(duration: 0.6).repeatForever(autoreverses: true)) { visible = false }
            }
    }
}
