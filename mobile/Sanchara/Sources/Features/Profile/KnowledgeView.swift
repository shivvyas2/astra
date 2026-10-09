import SwiftUI

/// "What Astrya knows": the standing facts learned from the user's
/// readings — their job, relationships, plans — grouped by category; the
/// summaries of past conversations; and the predictions readings made, with
/// "Did this happen?" once a window has begun. Every row has a delete button,
/// and a quiet "Forget everything" sits at the foot. The native counterpart
/// of `components/KnowledgeList.tsx`.
///
/// Has no `NavigationStack` of its own, so it can be pushed from the profile's
/// stack. To present it as a sheet, wrap it in one.
struct KnowledgeView: View {
    @State private var store = KnowledgeStore()
    @State private var confirmForgetAll = false

    var body: some View {
        ZStack {
            Atmosphere(mood: .dusk)
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    ScreenHeader(
                        eyebrow: "Memory",
                        title: "What Astrya knows",
                        blurb: "What you've told Astrya, what you talked about, and what it predicted. Every reading uses it.",
                        titleSize: 34
                    )

                    if let message = store.errorMessage {
                        BrutNotice(text: message)
                    }

                    content
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 24)
                .frame(maxWidth: 420)
                .frame(maxWidth: .infinity)
            }
            .refreshable { await store.load() }
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Theme.bg, for: .navigationBar)
        .tint(Theme.fg)
        .task { await store.load() }
        .alert("Forget everything?", isPresented: $confirmForgetAll) {
            Button("Cancel", role: .cancel) {}
            Button("Forget everything", role: .destructive) {
                Task { await store.deleteAll() }
            }
        } message: {
            Text("Astrya will no longer know any of this in your readings. It can't be undone.")
        }
    }

    @ViewBuilder
    private var content: some View {
        switch store.state {
        case .loading:
            ProgressView()
                .tint(Theme.muted)
                .frame(maxWidth: .infinity)
                .padding(.top, 24)
        case .failed(let message):
            VStack(alignment: .leading, spacing: 12) {
                BrutNotice(text: message)
                SancharaPrimaryButton(title: "Try again", kind: .secondary) {
                    Task { await store.load() }
                }
            }
        case .ready:
            if store.isEmpty {
                BrutEmptyState(
                    title: "Nothing yet",
                    message: "Tell Astrya about your life in a reading — your job, relationships, plans — and it'll remember here. You can delete anything.",
                    systemImage: "brain"
                )
            } else {
                VStack(alignment: .leading, spacing: 28) {
                    if !store.predictions.isEmpty {
                        AccuracyCard(card: Scorecard(store.predictions, today: Self.today))
                    }
                    ForEach(store.groups) { group in
                        section(group)
                    }
                    if !store.summaries.isEmpty { conversationsSection }
                    if !store.predictions.isEmpty { predictionsSection }
                    forgetAllButton
                }
                .animation(Theme.snap, value: store.facts)
                .animation(Theme.snap, value: store.summaries)
                .animation(Theme.snap, value: store.predictions)
            }
        }
    }

    private func section(_ group: FactGroup) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(group.category.label).eyebrow()
                .padding(.bottom, 4)
                .accessibilityAddTraits(.isHeader)
            BrutDivider()
            ForEach(group.facts) { fact in
                row(fact)
            }
        }
    }

    private func row(_ fact: UserFact) -> some View {
        VStack(spacing: 0) {
            HStack(alignment: .center, spacing: 14) {
                Text(fact.fact)
                    .font(.brutBody(16))
                    .foregroundStyle(Theme.fg)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
                CircleButton(systemImage: "xmark", label: "Forget: \(fact.fact)", size: 34) {
                    Task { await store.delete(fact) }
                }
            }
            .padding(.vertical, 12)
            BrutDivider()
        }
        .transition(.opacity)
    }

    private func heading(_ title: String) -> some View {
        Text(title).eyebrow()
            .padding(.bottom, 4)
            .accessibilityAddTraits(.isHeader)
    }

    private var conversationsSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            heading("Past conversations")
            BrutDivider()
            ForEach(store.summaries) { memory in
                VStack(spacing: 0) {
                    HStack(alignment: .center, spacing: 14) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(memory.summary)
                                .font(.brutBody(16))
                                .foregroundStyle(Theme.fg)
                                .fixedSize(horizontal: false, vertical: true)
                            Text(([Self.shortDate(memory.lastMessageAt)] + memory.topics.map(\.label))
                                .filter { !$0.isEmpty }.joined(separator: " · "))
                                .font(.system(size: 12))
                                .foregroundStyle(Theme.muted)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        CircleButton(systemImage: "xmark", label: "Forget this conversation", size: 34) {
                            Task { await store.delete(memory) }
                        }
                    }
                    .padding(.vertical, 12)
                    BrutDivider()
                }
                .transition(.opacity)
            }
        }
    }

    private var predictionsSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            heading("Predictions")
            BrutDivider()
            ForEach(store.orderedPredictions) { prediction in
                predictionRow(prediction)
            }
        }
    }

    private func predictionRow(_ p: PredictionItem) -> some View {
        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: 14) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(p.claim)
                        .font(.brutBody(16))
                        .foregroundStyle(Theme.fg)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 8) {
                        Text([p.topic.label, p.windowLabel, p.confidence].joined(separator: " · "))
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.muted)
                        if p.status != .open {
                            BrutTag(text: p.status.label, fill: p.status == .happened ? Theme.accent : Theme.fg)
                        }
                    }
                    if p.canCheck(today: Self.today) {
                        Text("Did this happen?")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Theme.fg)
                            .padding(.top, 4)
                        HStack(spacing: 8) {
                            BrutChip(text: "Yes") { Task { await store.mark(p, .happened) } }
                            BrutChip(text: "No") { Task { await store.mark(p, .didnt) } }
                            BrutChip(text: "Not sure") { Task { await store.mark(p, .unsure) } }
                        }
                    } else if p.status != .open {
                        Button("Undo") { Task { await store.mark(p, .open) } }
                            .buttonStyle(BrutButtonStyle(kind: .quiet, fullWidth: false))
                            .foregroundStyle(Theme.muted)
                            .accessibilityHint("Marks this prediction as open again")
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                CircleButton(systemImage: "xmark", label: "Forget: \(p.claim)", size: 34) {
                    Task { await store.delete(p) }
                }
            }
            .padding(.vertical, 12)
            BrutDivider()
        }
        .transition(.opacity)
    }

    /// The user's own calendar date, `yyyy-MM-dd`, to compare with a window.
    private static var today: String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: .now)
    }

    private static func shortDate(_ iso: String) -> String {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = parser.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
        guard let date else { return "" }
        return date.formatted(.dateTime.day().month(.abbreviated).year())
    }

    private var forgetAllButton: some View {
        Button {
            confirmForgetAll = true
        } label: {
            ZStack {
                Text("Forget everything").opacity(store.isForgettingAll ? 0 : 1)
                if store.isForgettingAll { ProgressView().tint(Theme.ember) }
            }
            .foregroundStyle(Theme.ember)
        }
        .buttonStyle(BrutButtonStyle(kind: .quiet, fullWidth: false))
        .disabled(store.isForgettingAll)
        .accessibilityHint("Deletes everything Astrya has learned about you")
    }
}

#Preview {
    NavigationStack { KnowledgeView() }
}
