import SwiftUI

/// Adds someone to compare charts with: who they are to the user, and the
/// same birth fields the user filled in for themselves. Their chart is
/// computed on the server before the sheet closes.
struct PersonFormView: View {
    let people: PeopleStore
    let onSaved: (Person) -> Void

    @State private var form: IntakeStore = {
        let store = IntakeStore()
        store.requiresLastName = false
        return store
    }()
    @State private var relationship: Relationship = .partner
    @State private var isSaving = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                Atmosphere(mood: .dusk)
                ScrollView {
                    VStack(alignment: .leading, spacing: 28) {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Matching").eyebrow()
                            Text("Who are you comparing with?")
                                .brutHeading(32)
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        HStack(alignment: .top, spacing: 16) {
                            SancharaField(placeholder: "First", text: $form.firstName, label: "First name")
                            SancharaField(placeholder: "Optional", text: $form.lastName, label: "Last name")
                        }

                        VStack(alignment: .leading, spacing: 10) {
                            Text("They are your").eyebrow()
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 8) {
                                    ForEach(Relationship.allCases) { option in
                                        BrutChip(text: option.label, active: relationship == option) {
                                            relationship = option
                                        }
                                    }
                                }
                            }
                        }

                        BirthDetailsFields(form: form, someoneElse: true)

                        if let error = people.errorMessage {
                            BrutNotice(text: error)
                        }

                        SancharaPrimaryButton(title: "Save and compare", isLoading: isSaving) {
                            Task { await save() }
                        }
                        .disabled(!form.isComplete || isSaving)
                        .opacity(form.isComplete ? 1 : 0.4)
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 24)
                    .frame(maxWidth: 480)
                    .frame(maxWidth: .infinity)
                }
                .scrollDismissesKeyboard(.interactively)
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(Theme.fg)
                }
            }
            .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
        }
        .presentationBackground(Theme.bg)
    }

    private func save() async {
        guard let place = form.place else { return }
        isSaving = true
        defer { isSaving = false }
        let draft = PersonDraft(
            label: form.firstName.trimmingCharacters(in: .whitespaces),
            relationship: relationship,
            birth: form.birthInput(for: place)
        )
        if let person = await people.add(draft) { onSaved(person) }
    }
}
