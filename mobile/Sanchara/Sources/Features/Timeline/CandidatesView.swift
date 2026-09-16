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
                Theme.bg.ignoresSafeArea()
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
                        .foregroundStyle(Theme.muted)
                }
            }
        }
        .tint(Theme.fg)
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
            .font(.system(size: 13))
            .foregroundStyle(Theme.muted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 12)
    }

    @ViewBuilder
    private var list: some View {
        if store.candidates.isEmpty {
            VStack(spacing: 8) {
                Spacer()
                Text("Nothing to add yet")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.fg)
                Text("I couldn't find dated events in our conversations. You can pin moments yourself with the + button.")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 280)
                Spacer()
            }
        } else {
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(store.candidates) { candidate in
                        row(candidate)
                        Divider().overlay(Theme.hairline)
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
                    Image(systemName: isChosen ? "checkmark.circle.fill" : "circle")
                        .font(.system(size: 20))
                        .foregroundStyle(isChosen ? Theme.accent : Theme.muted.opacity(0.5))
                    VStack(alignment: .leading, spacing: 3) {
                        Text(candidate.title)
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(Theme.fg)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                        if let date = candidate.dateLabel {
                            Text(date)
                                .font(.system(size: 11))
                                .foregroundStyle(Theme.muted)
                        } else {
                            Text("When was this?")
                                .font(.system(size: 11))
                                .foregroundStyle(Theme.accent)
                        }
                        if !candidate.evidence.isEmpty {
                            Text("“\(candidate.evidence)”")
                                .font(.system(size: 12).italic())
                                .foregroundStyle(Theme.muted.opacity(0.8))
                                .multilineTextAlignment(.leading)
                                .fixedSize(horizontal: false, vertical: true)
                                .padding(.top, 2)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if candidate.isUndated {
                yearPicker(for: candidate)
                    .padding(.leading, 32)
            }
        }
        .padding(.vertical, 12)
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
        .font(.system(size: 13))
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
