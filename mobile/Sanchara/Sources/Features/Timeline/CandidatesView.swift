import SwiftUI

/// The confirmation step for moments mined from past conversations.
///
/// Nothing reaches the timeline without passing through here. These are
/// inferred claims about someone's own life — a wrong one is not a wrong
/// prediction, it is the app telling a person something untrue about their
/// father's death — so every candidate is opt-in rather than opt-out.
///
/// Each row shows the words it was read from, so the check is against the
/// user's own sentence rather than against memory. A moment the scan could not
/// date asks for a year in place of a date, and cannot be added without one.
struct CandidatesView: View {
    let store: TimelineStore

    @State private var chosen: Set<String> = []
    /// Years picked for undated candidates, by candidate id.
    @State private var years: [String: Int] = [:]
    @Environment(\.dismiss) private var dismiss

    private var chosenCandidates: [CandidateEvent] {
        store.candidates.filter { chosen.contains($0.id) }
    }

    private var canAdd: Bool {
        CandidateResolver.canAdd(chosen: chosenCandidates, years: years)
    }

    private var yearRange: ClosedRange<Int> {
        CandidateResolver.yearRange(birthDate: store.birthDate, today: store.today)
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Atmosphere(mood: .violet)
                VStack(spacing: 0) {
                    header
                    list
                    actions
                }
            }
            .navigationTitle("Moments found")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { store.candidates = []; dismiss() }
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(Theme.fg)
                }
            }
            .toolbarBackground(Theme.bg, for: .navigationBar)
        }
        .tint(Theme.fg)
        .presentationBackground(Theme.bg)
        .onAppear {
            // Pre-selected: the common case is that they are right, and the
            // work of confirming a good list should be one tap, not twelve.
            // Undated ones are not — they need a year first, and pre-ticking
            // them would only hold the button hostage.
            chosen = Set(store.candidates.filter { !$0.isUndated }.map(\.id))
        }
    }

    private var header: some View {
        Text("From things you've told me. Untick anything that isn't right — nothing is saved until you tap add.")
            .font(.brutBody(13))
            .foregroundStyle(Theme.muted)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 12)
    }

    @ViewBuilder
    private var list: some View {
        if store.candidates.isEmpty {
            VStack(spacing: 0) {
                Spacer()
                BrutEmptyState(
                    title: "Nothing to add yet",
                    message: "I couldn't find dated events in our conversations. You can pin moments yourself with the + button.",
                    systemImage: "magnifyingglass"
                )
                Spacer()
                Spacer()
            }
            .padding(.horizontal, 20)
        } else {
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(Array(store.candidates.enumerated()), id: \.element.id) { index, candidate in
                        if index > 0 { BrutDivider() }
                        row(candidate)
                    }
                }
                .padding(.horizontal, 20)
            }
        }
    }

    private func row(_ candidate: CandidateEvent) -> some View {
        let isChosen = chosen.contains(candidate.id)
        return VStack(alignment: .leading, spacing: 8) {
            Button {
                if isChosen { chosen.remove(candidate.id) } else { chosen.insert(candidate.id) }
            } label: {
                HStack(alignment: .top, spacing: 12) {
                    checkbox(isChosen)
                        .padding(.top, -3)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(candidate.title)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Theme.fg)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                        if let date = candidate.dateLabel {
                            Text(date)
                                .font(.brutMono(11, weight: .regular))
                                .foregroundStyle(Theme.muted)
                        } else {
                            Text("When was this?")
                                .font(.brutMono(11))
                                .foregroundStyle(Theme.accent)
                        }
                        if !candidate.evidence.isEmpty {
                            Text("“\(candidate.evidence)”")
                                .font(.system(size: 12).italic())
                                .foregroundStyle(Theme.muted)
                                .multilineTextAlignment(.leading)
                                .fixedSize(horizontal: false, vertical: true)
                                .padding(.top, 2)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .frame(minHeight: 44, alignment: .top)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(isChosen ? .isSelected : [])

            if candidate.isUndated {
                yearPicker(for: candidate)
                    .padding(.leading, 36)
            }
        }
        .padding(.vertical, 12)
    }

    /// A round tick box: lime-filled with an ink mark when chosen, outlined
    /// when not.
    private func checkbox(_ isChosen: Bool) -> some View {
        ZStack {
            if isChosen {
                Circle().fill(Theme.accent)
                Image(systemName: "checkmark")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Theme.ink)
            } else {
                Circle().fill(Theme.fg.opacity(0.04))
                Circle().strokeBorder(Theme.lineStrong.opacity(0.6), lineWidth: Theme.lineWidth)
            }
        }
        .frame(width: 24, height: 24)
        .animation(Theme.snap, value: isChosen)
        .accessibilityHidden(true)
    }

    /// A year, not a date: the scan only knew that it happened, and asking for
    /// a day would invite a guess the timeline would then present as fact.
    private func yearPicker(for candidate: CandidateEvent) -> some View {
        Picker(
            "Year",
            selection: Binding(
                get: { years[candidate.id] ?? 0 },
                set: { value in
                    if value == 0 {
                        years.removeValue(forKey: candidate.id)
                    } else {
                        years[candidate.id] = value
                        chosen.insert(candidate.id)
                    }
                }
            )
        ) {
            Text("Choose a year").tag(0)
            ForEach(Array(yearRange.reversed()), id: \.self) { year in
                Text(String(year)).tag(year)
            }
        }
        .pickerStyle(.menu)
        .font(.brutMono(13))
        .tint(years[candidate.id] == nil ? Theme.accent : Theme.fg)
    }

    private var actions: some View {
        VStack(spacing: 10) {
            if store.candidates.isEmpty {
                SancharaPrimaryButton(title: "Done") { store.candidates = []; dismiss() }
            } else {
                SancharaPrimaryButton(
                    title: chosen.isEmpty ? "Add none" : "Add \(chosen.count) to timeline",
                    isLoading: store.isSaving
                ) {
                    let picked = chosenCandidates
                    let pickedYears = years
                    Task {
                        await store.confirm(picked, years: pickedYears)
                        dismiss()
                    }
                }
                .disabled(!chosen.isEmpty && !canAdd)
                .opacity(!chosen.isEmpty && !canAdd ? 0.5 : 1)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
        .padding(.bottom, 8)
    }
}
