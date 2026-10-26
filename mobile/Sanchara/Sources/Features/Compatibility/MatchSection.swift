import SwiftUI

/// The Chart tab's way into matching: the people the user has saved, each
/// one tap from their Guna Milan, and a row to add someone new.
///
/// Lives inside the Chart tab's navigation stack, so a match opens as a
/// pushed screen with a back button rather than a sheet.
struct MatchSection: View {
    /// The user's first name, for the heading.
    var firstName: String = ""

    @State private var people = PeopleStore()
    @State private var selected: Person?
    @State private var adding = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Its own section, headed like a screen: the kundli above is
            // about one chart, this is about two.
            Text("Matching")
                .font(.scaled(size: 13, weight: .semibold))
                .foregroundStyle(Theme.accent)
                .padding(.bottom, 8)
            Text(firstName.isEmpty ? L10n.string("Match your stars") : L10n.string("Match your stars, \(firstName)"))
                .headlineArrow()
                .brutHeading(32)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.bottom, 10)
            Text("Compare your kundli with someone else's: the 36 gunas, the doshas, and how your two charts meet.")
                .font(.brutBody(15))
                .foregroundStyle(Theme.muted)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.bottom, 16)

            if !people.available {
                BrutNotice(text: L10n.string("Matching isn't switched on for this account yet."))
            } else {
                ForEach(people.people) { person in
                    BrutDivider()
                    Button { selected = person } label: { row(person) }
                        .buttonStyle(.plain)
                        .accessibilityHint(L10n.string("Opens your match with \(person.label)"))
                }
                BrutDivider()
                Button { adding = true } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "plus")
                            .font(.scaled(size: 14, weight: .semibold))
                            .foregroundStyle(Theme.ink)
                            .frame(width: 36, height: 36)
                            .background(Circle().fill(Theme.accent))
                        Text(people.people.isEmpty ? "Add someone to compare with" : "Add someone")
                            .font(.scaled(size: 16, weight: .semibold))
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
                .font(.scaled(size: 13, weight: .semibold))
                .foregroundStyle(Theme.fg)
                .frame(width: 36, height: 36)
                .background(Circle().fill(Theme.fg.opacity(0.08)))
            VStack(alignment: .leading, spacing: 2) {
                Text(person.label)
                    .font(.scaled(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.fg)
                Text([person.relationship.label, person.moonSign.map { L10n.string("Moon in \(GunaFormat.sign($0))") }].compactMap { $0 }.joined(separator: ", "))
                    .font(.brutBody(13))
                    .foregroundStyle(Theme.muted)
            }
            Spacer(minLength: 8)
            Image(systemName: "chevron.right")
                .font(.scaled(size: 12, weight: .semibold))
                .foregroundStyle(Theme.muted)
                .accessibilityHidden(true)
        }
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
        .contentShape(Rectangle())
    }
}
