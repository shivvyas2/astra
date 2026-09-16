import SwiftUI

/// The confirmation step for moments mined from past conversations.
///
/// Nothing reaches the timeline without passing through here. These are
/// inferred claims about someone's own life — a wrong one is not a wrong
/// prediction, it is the app telling a person something untrue about their
/// father's death — so every candidate is opt-in rather than opt-out.
struct CandidatesView: View {
    let store: TimelineStore

    @State private var chosen: Set<String> = []
    @Environment(\.dismiss) private var dismiss

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
            chosen = Set(store.candidates.map(\.id))
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
        Button {
            if chosen.contains(candidate.id) { chosen.remove(candidate.id) } else { chosen.insert(candidate.id) }
        } label: {
            HStack(spacing: 12) {
                Image(systemName: chosen.contains(candidate.id) ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 20))
                    .foregroundStyle(chosen.contains(candidate.id) ? Theme.accent : Theme.muted.opacity(0.5))
                VStack(alignment: .leading, spacing: 2) {
                    Text(candidate.title)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(Theme.fg)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(candidate.dateLabel)
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.muted)
                }
                Spacer(minLength: 0)
            }
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
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
                    let picked = store.candidates.filter { chosen.contains($0.id) }
                    Task {
                        await store.confirm(picked)
                        dismiss()
                    }
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
        .padding(.bottom, 8)
    }
}
