import SwiftUI

/// The reading screen — the "Ask" tab, and the native counterpart of
/// `components/Chat.tsx`.
///
/// The store is owned by `MainTabView` so that the Today tab can send a
/// question into a fresh reading and the tab bar can switch here to show it.
struct ChatView: View {
    let profile: ProfileStore
    let chat: ChatStore

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var suggestions = SuggestionEngine()
    @State private var showHistory = false
    @FocusState private var inputFocused: Bool
    /// Whether the reader is at (or within a few lines of) the latest text.
    @State private var isNearBottom = true
    /// Raw scroll geometry. A reference type on purpose: it changes on every
    /// scrolled frame and must not invalidate the view when it does.
    @State private var scrollMetrics = TranscriptScrollMetrics()

    var body: some View {
        NavigationStack {
            ZStack {
                Atmosphere(mood: .ember)

                VStack(spacing: 0) {
                    header
                    if chat.messages.isEmpty {
                        openingScreen
                    } else {
                        transcript
                        suggestionChips
                        composer
                            .padding(.horizontal, 16)
                            .padding(.top, 8)
                            .padding(.bottom, 12)
                    }
                }
            }
            .clearsTabBar()
            // A header of our own rather than the system toolbar, which on
            // iOS 26 wraps each button in a glass bubble of its own.
            .toolbar(.hidden, for: .navigationBar)
        }
        .tint(Theme.fg)
        .sheet(isPresented: $showHistory) {
            HistoryView(chat: chat)
        }
        .task {
            suggestions.showStarters(for: chat.mode)
            chat.chart = profile.chart
            await chat.start()
        }
        .onChange(of: profile.chart) { _, chart in
            chat.chart = chart
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
        .onChange(of: chat.messages.isEmpty) { _, empty in
            // A new reading started from anywhere (toolbar, history, another
            // tab) brings the starters back.
            if empty { suggestions.showStarters(for: chat.mode) }
        }
    }

    // MARK: - Screens

    private var openingScreen: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 26) {
                hero

                modeRow

                composer

                if suggestions.isThinking {
                    ShimmerText("Thinking of what to ask…", active: !reduceMotion)
                } else if !suggestions.suggestions.isEmpty {
                    VStack(alignment: .leading, spacing: 0) {
                        Text("Try asking").eyebrow()
                            .padding(.bottom, 4)
                        ForEach(Array(suggestions.suggestions.enumerated()), id: \.element) { index, question in
                            if index > 0 { BrutDivider() }
                            Button {
                                suggestions.clear()
                                chat.send(question)
                            } label: {
                                HStack(spacing: 12) {
                                    Text(question)
                                        .font(.brutBody(16))
                                        .foregroundStyle(Theme.fg)
                                        .multilineTextAlignment(.leading)
                                        .fixedSize(horizontal: false, vertical: true)
                                    Spacer(minLength: 8)
                                    Image(systemName: "arrow.up.right")
                                        .font(.system(size: 13, weight: .semibold))
                                        .foregroundStyle(Theme.accent)
                                        .accessibilityHidden(true)
                                }
                                .padding(.vertical, 14)
                                .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityHint("Asks this question")
                        }
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 24)
            .padding(.bottom, 36)
            .frame(maxWidth: 520)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .mask(EdgeFade())
    }

    /// One large phrase, a line saying what the screen is for, and an orbit
    /// in the empty space above them — never behind the words.
    private var hero: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Ask").eyebrow()
            greeting.headlineArrow()
                .brutHeading(40)
                .fixedSize(horizontal: false, vertical: true)
            Text("Ask about work, love, money, a decision, a year. Every answer is read from your real birth chart, not your Sun sign.")
                .font(.brutBody(15))
                .foregroundStyle(Theme.muted)
                .lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, 92)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(alignment: .topTrailing) {
            OrbitDecoration(color: Theme.fg.opacity(0.3))
                .frame(width: 170, height: 120)
                .offset(x: 18, y: -18)
        }
        .accessibilityElement(children: .combine)
        // Spelled out so the arrow glyph is not read aloud.
        .accessibilityLabel(heroSpoken)
    }

    private var heroSpoken: String {
        let name = profile.details?.firstName ?? ""
        let title = name.isEmpty ? "Read your stars." : "Read your stars, \(name)."
        return "Ask. \(title) Ask about work, love, money, a decision, a year. Every answer is read from your real birth chart, not your Sun sign."
    }

    private var greeting: Text {
        if let firstName = profile.details?.firstName, !firstName.isEmpty {
            return Text("Read your stars,\n") + Text(firstName).foregroundStyle(Theme.accent)
        }
        return Text("Read your stars.")
    }

    /// Clears the transcript for a fresh reading. The previous one stays
    /// saved and is one tap away under Past readings.
    private func startNewReading() {
        chat.newReading()
        suggestions.showStarters(for: chat.mode)
    }

    /// The three modes, each named and explained. On the opening screen there
    /// is room to say what they are; in the composer the same choice is a menu.
    private var modeRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                ForEach(ChatMode.allCases) { mode in
                    BrutChip(text: mode.label, active: chat.mode == mode, color: mode.dot) {
                        chat.mode = mode
                    }
                    .accessibilityLabel("\(mode.label) mode. \(mode.blurb)")
                    .accessibilityAddTraits(chat.mode == mode ? .isSelected : [])
                }
            }
            Text(chat.mode.blurb)
                .font(.brutMono(11, weight: .regular))
                .foregroundStyle(Theme.muted)
        }
    }

    // MARK: - Transcript

    /// The transcript follows the reading only while the reader is already at
    /// the bottom. The previous version scrolled to the end on every streamed
    /// chunk, which fought any attempt to scroll up mid-reading and, because
    /// the last row kept growing after each jump landed, often left the final
    /// lines just out of view. Growth is now handled by the scroll anchor, a
    /// jump happens only on a new turn, and a reader who has scrolled away
    /// gets a button back to the latest text instead of being dragged there.
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
                // Both edges clear the fade, so at rest nothing is dimmed.
                .padding(.top, 24)
                // Room under the last line so it clears the chips and composer.
                .padding(.bottom, 40)
                .frame(maxWidth: 560)
                .frame(maxWidth: .infinity)
                .background(
                    GeometryReader { geo in
                        Color.clear.preference(
                            key: TranscriptContentBottomKey.self,
                            value: geo.frame(in: .named(Self.transcriptSpace)).maxY
                        )
                    }
                )
            }
            .coordinateSpace(name: Self.transcriptSpace)
            .defaultScrollAnchor(.bottom)
            .scrollDismissesKeyboard(.interactively)
            // Text scrolls out under the toolbar and into the composer; fade
            // it at both edges so no line is ever sliced in half.
            .mask(EdgeFade())
            .background(
                GeometryReader { geo in
                    Color.clear.preference(key: TranscriptViewportKey.self, value: geo.size.height)
                }
            )
            .onPreferenceChange(TranscriptContentBottomKey.self) { bottom in
                scrollMetrics.contentBottom = bottom
                updateNearBottom()
            }
            .onPreferenceChange(TranscriptViewportKey.self) { height in
                scrollMetrics.viewportHeight = height
                updateNearBottom()
            }
            .overlay(alignment: .bottom) {
                if !isNearBottom {
                    Button {
                        withAnimation(.easeOut(duration: 0.25)) {
                            proxy.scrollTo(Self.bottomAnchor, anchor: .bottom)
                        }
                    } label: {
                        Label("Jump to latest", systemImage: "arrow.down")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Theme.ink)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 9)
                            .background(Capsule().fill(Theme.fg))
                            .frame(minHeight: 44)
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .padding(.bottom, 10)
                    .transition(.opacity)
                }
            }
            .animation(.easeInOut(duration: 0.2), value: isNearBottom)
            .onChange(of: chat.messages.count) { _, _ in
                // A new turn, which the reader either sent or asked for. One
                // jump, not one per chunk.
                proxy.scrollTo(Self.bottomAnchor, anchor: .bottom)
            }
            .onChange(of: chat.isStreaming) { _, streaming in
                // When the reading finishes the chips appear under it and the
                // transcript shortens; settle on the end once, if they were
                // following along.
                guard !streaming, isNearBottom else { return }
                Task { @MainActor in
                    try? await Task.sleep(nanoseconds: 50_000_000)
                    proxy.scrollTo(Self.bottomAnchor, anchor: .bottom)
                }
            }
        }
    }

    /// Flips the published flag only when it changes, so scrolling does not
    /// re-render the transcript on every frame.
    private func updateNearBottom() {
        let distance = scrollMetrics.contentBottom - scrollMetrics.viewportHeight
        let near = distance < 80
        if near != isNearBottom { isNearBottom = near }
    }

    @ViewBuilder
    private func row(for message: ChatMessage, isLast: Bool) -> some View {
        switch message.role {
        case .user:
            Text(message.content)
                .font(.brutBody(15))
                .foregroundStyle(Theme.fg)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .brutCard(fill: Theme.fg.opacity(0.06), radius: 22)
                .frame(maxWidth: 300, alignment: .trailing)
                .accessibilityLabel("You asked: \(message.content)")
        case .assistant:
            HStack(alignment: .top, spacing: 12) {
                Capsule()
                    .fill(message.source == .onDevice ? Theme.muted : Theme.accent)
                    .frame(width: 2)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 10) {
                    if message.content.isEmpty {
                        ShimmerText("Reading your chart…", active: !reduceMotion)
                    } else {
                        MarkdownText(markdown: message.content)
                        if isLast && chat.isStreaming {
                            StreamingCaret(active: !reduceMotion)
                        }
                        if message.source == .onDevice {
                            onDeviceFooter(isLast: isLast)
                        }
                    }
                }
            }
            .fixedSize(horizontal: false, vertical: true)
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
                .font(.brutMono(10, weight: .regular))
                .foregroundStyle(Theme.muted)
                .labelStyle(.titleAndIcon)

            if isLast && !chat.isStreaming {
                Button("Ask for a full reading") { chat.expandLastAnswer() }
                    .buttonStyle(BrutButtonStyle(kind: .quiet, fullWidth: false))
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
                        BrutChip(text: question) {
                            suggestions.clear()
                            chat.send(question)
                        }
                    }
                }
                .padding(.horizontal, 16)
            }
            // A fade at the trailing edge says the row scrolls, where a chip
            // sliced off by the screen edge only looked broken.
            .mask(
                HStack(spacing: 0) {
                    Color.black
                    LinearGradient(colors: [.black, .clear], startPoint: .leading, endPoint: .trailing)
                        .frame(width: 28)
                }
            )
            .padding(.bottom, 8)
        }
    }

    // MARK: - Composer

    private var composer: some View {
        @Bindable var chat = chat
        let canSend = !chat.isStreaming && !chat.input.trimmingCharacters(in: .whitespaces).isEmpty

        return VStack(spacing: 8) {
            if let error = chat.errorMessage {
                BrutNotice(text: error)
            }

            HStack(alignment: .bottom, spacing: 8) {
                TextField("", text: $chat.input, prompt: Text("Ask Astrya…").foregroundStyle(Theme.muted), axis: .vertical)
                    .lineLimit(1...5)
                    .font(.brutBody(15))
                    .foregroundStyle(Theme.fg)
                    .textInputAutocapitalization(.sentences)
                    .focused($inputFocused)
                    .submitLabel(.send)
                    .onSubmit { chat.sendCurrentInput() }
                    .padding(.vertical, 10)

                CircleButton(systemImage: "arrow.up", label: "Send", fill: .accent, size: 40) {
                    inputFocused = false
                    chat.sendCurrentInput()
                }
                .disabled(!canSend)
                .opacity(canSend ? 1 : 0.35)
                .padding(.bottom, 4)
            }
            .padding(.leading, 18)
            .padding(.trailing, 4)
            .padding(.vertical, 0)
            .background {
                RoundedRectangle(cornerRadius: 28, style: .continuous)
                    .fill(Theme.fg.opacity(0.04))
                RoundedRectangle(cornerRadius: 28, style: .continuous)
                    .strokeBorder(Theme.line, lineWidth: Theme.lineWidth)
            }

            HStack(spacing: 8) {
                modeMenu
                BrutChip(text: "Deep", active: chat.deep, color: Theme.fg) {
                    chat.deep.toggle()
                }
                .accessibilityLabel(chat.deep ? "Deep reading on" : "Deep reading off")
                .accessibilityHint("A bigger model and a longer answer")
                Spacer(minLength: 0)
                // Always the same two lines, so the row looks the same in every
                // mode instead of wrapping wherever the mode name leaves room.
                Text("Guidance, not\nprofessional advice.")
                    .font(.brutMono(9, weight: .regular))
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.trailing)
                    .lineLimit(2)
                    .fixedSize()
                    .accessibilityLabel("Guidance, not professional advice.")
            }
        }
    }

    /// The mode, as a labelled menu with one line per option.
    private var modeMenu: some View {
        Menu {
            ForEach(ChatMode.allCases) { mode in
                Button {
                    chat.mode = mode
                } label: {
                    Label {
                        Text(mode.label)
                        Text(mode.blurb)
                    } icon: {
                        Image(systemName: chat.mode == mode ? "checkmark.circle.fill" : "circle")
                    }
                }
            }
        } label: {
            HStack(spacing: 7) {
                Circle().fill(chat.mode.dot).frame(width: 8, height: 8)
                Text(chat.mode.label)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.fg)
                Image(systemName: "chevron.down")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(Theme.muted)
            }
            // One line in every mode: "Numerology" wrapped at 375pt.
            .lineLimit(1)
            .fixedSize()
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .background {
                Capsule().fill(Theme.fg.opacity(0.04))
                Capsule().strokeBorder(Theme.line, lineWidth: Theme.lineWidth)
            }
            // A taller hit area than the capsule shows.
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .accessibilityLabel("Reading mode: \(chat.mode.label). \(chat.mode.blurb). Opens a list of modes.")
    }

    // MARK: - Header

    /// Left: the way out of a conversation (back to the Ask screen, which
    /// keeps the reading in Past readings), or the wordmark when there is no
    /// conversation to leave. Right: past readings and a new one, together.
    private var header: some View {
        HStack(spacing: 12) {
            if chat.messages.isEmpty {
                HStack(spacing: 8) {
                    AstraMark(size: 14)
                    Text("ASTRYA")
                        .font(.brutMono(11, weight: .bold))
                        .tracking(3)
                        .foregroundStyle(Theme.fg)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Astrya")
                .accessibilityAddTraits(.isHeader)
            } else {
                CircleButton(systemImage: "chevron.left", label: "Back to Ask", size: 40) {
                    startNewReading()
                }
                .accessibilityHint("Leaves this reading. It stays in Past readings.")
                HStack(spacing: 7) {
                    Circle().fill(chat.mode.dot).frame(width: 8, height: 8)
                    Text(chat.mode.label)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.fg)
                    if chat.deep {
                        BrutTag(text: "Deep", fill: Theme.fg, textColor: Theme.ink)
                    }
                }
                .lineLimit(1)
                .accessibilityElement(children: .combine)
            }

            Spacer(minLength: 8)

            HeaderActions(
                onHistory: { showHistory = true },
                onNew: chat.messages.isEmpty ? nil : { startNewReading() }
            )
        }
        .padding(.horizontal, 16)
        .frame(height: 56)
    }

    private static let bottomAnchor = "sanchara-transcript-bottom"
    private static let transcriptSpace = "sanchara-transcript"
}

// MARK: - Scroll tracking

/// Scroll geometry that changes every frame. Kept off SwiftUI state so that
/// reading it never re-renders the transcript; only the derived "near the
/// bottom" flag is published, and only when it flips.
final class TranscriptScrollMetrics {
    var contentBottom: CGFloat = 0
    var viewportHeight: CGFloat = 0
}

/// A mask that is opaque except for a short fade at the top and bottom, so
/// scrolled text dissolves at an edge instead of being cut off at it.
private struct EdgeFade: View {
    var top: CGFloat = 18
    var bottom: CGFloat = 28

    var body: some View {
        VStack(spacing: 0) {
            LinearGradient(colors: [.clear, .black], startPoint: .top, endPoint: .bottom)
                .frame(height: top)
            Color.black
            LinearGradient(colors: [.black, .clear], startPoint: .top, endPoint: .bottom)
                .frame(height: bottom)
        }
    }
}

private struct TranscriptContentBottomKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

private struct TranscriptViewportKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

// MARK: - Motion

/// `animate-shimmer` — the "Reading your chart…" placeholder.
///
/// Driven by a `TimelineView` rather than `withAnimation(.repeatForever)`.
/// A repeating animation started in `onAppear` is a transaction that leaks
/// into every later layout change in the same hierarchy; inside a streaming
/// transcript that meant each arriving chunk was laid out with an eased,
/// repeating animation, which read as the text juddering.
struct ShimmerText: View {
    let text: String
    var active: Bool

    init(_ text: String, active: Bool) {
        self.text = text
        self.active = active
    }

    var body: some View {
        SwiftUI.TimelineView(.periodic(from: .now, by: 1.1)) { context in
            let phase = Int(context.date.timeIntervalSinceReferenceDate / 1.1)
            let dim = active && phase.isMultiple(of: 2)
            Text(text)
                .font(.brutMono(12, weight: .regular))
                .foregroundStyle(Theme.muted)
                .opacity(dim ? 0.4 : 1)
                .animation(active ? .easeInOut(duration: 1.0) : nil, value: dim)
        }
    }
}

/// The blinking block shown while text is still arriving. Time-driven for
/// the same reason as `ShimmerText`.
struct StreamingCaret: View {
    var active: Bool

    var body: some View {
        SwiftUI.TimelineView(.periodic(from: .now, by: 0.6)) { context in
            let phase = Int(context.date.timeIntervalSinceReferenceDate / 0.6)
            let visible = !active || phase.isMultiple(of: 2)
            Capsule()
                .fill(Theme.accent)
                .frame(width: 3, height: 17)
                .opacity(visible ? 1 : 0)
                .accessibilityHidden(true)
        }
    }
}

/// Past readings and a new reading in one outlined capsule, split by a
/// hairline: the two things you do with conversations, kept together.
private struct HeaderActions: View {
    let onHistory: () -> Void
    /// Nil when there is nothing to start over from; the button then shows
    /// as unavailable rather than disappearing, so the capsule keeps its size.
    let onNew: (() -> Void)?

    var body: some View {
        HStack(spacing: 0) {
            button("clock.arrow.circlepath", label: "Past readings", action: onHistory)
            Rectangle().fill(Theme.line).frame(width: Theme.lineWidth, height: 20)
            button("square.and.pencil", label: "New reading", action: onNew ?? {})
                .disabled(onNew == nil)
                .opacity(onNew == nil ? 0.35 : 1)
        }
        .background {
            Capsule().fill(Theme.fg.opacity(0.04))
            Capsule().strokeBorder(Theme.line, lineWidth: Theme.lineWidth)
        }
    }

    private func button(_ systemImage: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.fg)
                .frame(width: 48, height: 40)
                .contentShape(Rectangle())
        }
        .buttonStyle(DipButtonStyle())
        .accessibilityLabel(label)
    }
}
