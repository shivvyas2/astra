import SwiftUI

/// The life map: every Vimshottari period from birth, with the moments the
/// user has pinned into them.
///
/// The bands are laid out in *information* proportion, not time proportion: a
/// period is as tall as what happened in it. A 20-year mahadasha with nothing
/// pinned should not dwarf the year the user got married. Time is carried by
/// the year range and the "N years" caption instead.
struct TimelineView: View {
    @State private var store = TimelineStore()
    @State private var expanded: Set<String> = []
    @State private var showAdd = false
    @State private var pendingDelete: LifeEvent?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.bg.ignoresSafeArea()
                content
            }
            .navigationTitle("Your life")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") { dismiss() }.foregroundStyle(Theme.muted)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showAdd = true } label: { Image(systemName: "plus") }
                        .accessibilityLabel("Pin a moment")
                        .disabled(store.state != .ready)
                }
            }
        }
        .tint(Theme.fg)
        .task { await store.load() }
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
            message("Add your birth details first — the timeline is computed from them.")
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
                LazyVStack(alignment: .leading, spacing: 0) {
                    if store.canOfferScan { scanOffer }
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
                    }
                    footer
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 32)
            }
            .onAppear {
                // Open on the present, not on birth — "where am I now" is the
                // question people arrive with. The past is one scroll up.
                guard let current = store.currentBand else { return }
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

    private func toggle(_ band: DashaBand) {
        withAnimation(Theme.ease) {
            if expanded.contains(band.id) { expanded.remove(band.id) } else { expanded.insert(band.id) }
        }
    }

    /// The first-open offer: the timeline seeds itself from what the user has
    /// already told us, so it is never an empty grid asking for homework.
    private var scanOffer: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Fill this in from our conversations")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.fg)
            Text("You've mentioned things that happened to you. I can find them and place them against your chart — you decide what stays.")
                .font(.system(size: 13))
                .foregroundStyle(Theme.muted)
            SancharaPrimaryButton(title: "Find my moments", isLoading: store.isScanning) {
                Task { await store.scan() }
            }
        }
        .padding(16)
        .background(Theme.fieldFill)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.accent.opacity(0.35), lineWidth: 1))
        .padding(.bottom, 20)
    }

    private var footer: some View {
        Text("Periods are Vimshottari dasha, computed from your Moon's exact position at birth.")
            .font(.system(size: 11))
            .foregroundStyle(Theme.muted.opacity(0.7))
            .padding(.top, 20)
            .padding(.leading, 28)
    }

    private func message(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 14))
            .foregroundStyle(Theme.muted)
            .multilineTextAlignment(.center)
            .frame(maxWidth: 300)
            .padding(.horizontal, 24)
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
                if isExpanded { antardashaList.padding(.top, 12) }
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

    /// The continuous line down the left, with a node at each period.
    private var spine: some View {
        VStack(spacing: 0) {
            Circle()
                .fill(band.isCurrent ? Theme.accent : Theme.muted.opacity(0.6))
                .frame(width: band.isCurrent ? 10 : 6, height: band.isCurrent ? 10 : 6)
                .padding(.top, 6)
            Rectangle()
                .fill(Theme.hairline)
                .frame(width: 1)
                .frame(maxHeight: .infinity)
        }
        .frame(width: 20)
        .padding(.trailing, 8)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(band.lord.uppercased())
                    .font(.system(size: 15, weight: .bold))
                    .tracking(1.5)
                    .foregroundStyle(tint)
                if band.isCurrent {
                    Text("NOW")
                        .font(.system(size: 9, weight: .bold))
                        .tracking(1)
                        .foregroundStyle(Theme.bg)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Theme.accent)
                        .clipShape(Capsule())
                }
                Spacer(minLength: 0)
                Text("\(band.startYear) – \(band.endYear)")
                    .font(.system(size: 13, weight: .medium).monospacedDigit())
                    .foregroundStyle(Theme.muted)
            }
            HStack(spacing: 6) {
                Text("\(band.years) years")
                if band.eventCount > 0 {
                    Text("·")
                    Text(band.eventCount == 1 ? "1 moment" : "\(band.eventCount) moments")
                }
                Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                    .font(.system(size: 9, weight: .semibold))
            }
            .font(.system(size: 11))
            .foregroundStyle(Theme.muted.opacity(0.8))
        }
    }

    private var progressBar: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.hairline)
                Capsule()
                    .fill(Theme.accent)
                    .frame(width: geo.size.width * band.progress(today: today))
            }
        }
        .frame(height: 2)
        .accessibilityLabel("\(Int(band.progress(today: today) * 100)) percent through this period")
    }

    private var antardashaList: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("SUB-PERIODS")
                .font(.system(size: 9, weight: .semibold))
                .tracking(1.4)
                .foregroundStyle(Theme.muted.opacity(0.6))
            ForEach(band.antardashas, id: \.self) { sub in
                let isNow = sub.start <= today && today < sub.end
                HStack {
                    Text("\(band.lord)–\(sub.lord)")
                        .font(.system(size: 12, weight: isNow ? .semibold : .regular))
                        .foregroundStyle(isNow ? Theme.accent : Theme.muted)
                    Spacer(minLength: 8)
                    Text("\(String(sub.start.prefix(7))) – \(String(sub.end.prefix(7)))")
                        .font(.system(size: 11).monospacedDigit())
                        .foregroundStyle(Theme.muted.opacity(0.7))
                }
            }
        }
        .padding(12)
        .background(Theme.fieldFill)
        .clipShape(RoundedRectangle(cornerRadius: 10))
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
                .frame(width: 7, height: 7)
                .padding(.top, 5)
            VStack(alignment: .leading, spacing: 2) {
                Text(event.title)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Theme.fg)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 6) {
                    Text(event.dateLabel)
                    if let during = event.duringLabel {
                        Text("·")
                        Text(during)
                    }
                }
                .font(.system(size: 11))
                .foregroundStyle(Theme.muted)
                if let note = event.note, !note.isEmpty {
                    Text(note)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.muted.opacity(0.85))
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
