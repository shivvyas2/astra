import SwiftUI

/// The Chart tab's way into matching: the people the user has saved, each
/// one tap from their Guna Milan, and a row to add someone new.
///
/// Lives inside the Chart tab's navigation stack, so a match opens as a
/// pushed screen with a back button rather than a sheet.
struct MatchSection: View {
    @State private var people = PeopleStore()
    @State private var selected: Person?
    @State private var adding = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Matching").eyebrow()
                .padding(.bottom, 6)
            Text("Compare your kundli with someone else's: the 36 gunas, the doshas, and how your two charts meet.")
                .font(.brutBody(14))
                .foregroundStyle(Theme.muted)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.bottom, 12)

            if !people.available {
                BrutNotice(text: "Matching isn't switched on for this account yet.")
            } else {
                ForEach(people.people) { person in
                    BrutDivider()
                    Button { selected = person } label: { row(person) }
                        .buttonStyle(.plain)
                        .accessibilityHint("Opens your match with \(person.label)")
                }
                BrutDivider()
                Button { adding = true } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "plus")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Theme.ink)
                            .frame(width: 36, height: 36)
                            .background(Circle().fill(Theme.accent))
                        Text(people.people.isEmpty ? "Add someone to compare with" : "Add someone")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(Theme.fg)
                        Spacer(minLength: 8)
                    }
                    .padding(.vertical, 12)
                    .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                BrutDivider()
            }

            if let error = people.errorMessage {
                BrutNotice(text: error)
                    .padding(.top, 12)
            }
        }
        .task { await people.load() }
        .navigationDestination(item: $selected) { person in
            CompatibilityView(person: person, people: people)
        }
        .sheet(isPresented: $adding) {
            PersonFormView(people: people) { person in
                adding = false
                selected = person
            }
        }
    }

    private func row(_ person: Person) -> some View {
        HStack(spacing: 12) {
            Text(person.initials)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.fg)
                .frame(width: 36, height: 36)
                .background(Circle().fill(Theme.fg.opacity(0.08)))
            VStack(alignment: .leading, spacing: 2) {
                Text(person.label)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.fg)
                Text([person.relationship.label, person.moonSign.map { "Moon in \($0)" }].compactMap { $0 }.joined(separator: ", "))
                    .font(.brutBody(13))
                    .foregroundStyle(Theme.muted)
            }
            Spacer(minLength: 8)
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.muted)
                .accessibilityHidden(true)
        }
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
        .contentShape(Rectangle())
    }
}
