import SwiftUI

/// "Is this right?": the birth details Astrya understood, confirmed before
/// anyone is saved or matched. The counterpart of `components/MatchCard.tsx`.
struct MatchCardView: View {
    let card: MatchCard
    /// The saved person and the match question to ask about them.
    let onMatched: (Person, String) -> Void
    let onDismiss: () -> Void

    @State private var people = PeopleStore()
    @State private var relationship: Relationship
    @State private var birthDate: String?
    @State private var place: GeoResult?
    /// Kept across a failed second step, so trying again does not save them twice.
    @State private var saved: Person?
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var showForm = false

    init(card: MatchCard, onMatched: @escaping (Person, String) -> Void, onDismiss: @escaping () -> Void) {
        self.card = card
        self.onMatched = onMatched
        self.onDismiss = onDismiss
        _relationship = State(initialValue: card.relationship)
        _birthDate = State(initialValue: card.altBirthDate == nil ? card.birthDate : nil)
        _place = State(initialValue: card.placeAmbiguous ? nil : card.places.first)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if card.isEmpty {
                SancharaPrimaryButton(title: L10n.string("Add their birth details")) { showForm = true }
            } else {
                details
            }
            if let errorMessage {
                BrutNotice(text: errorMessage)
            }
            HStack(spacing: 20) {
                if !card.isEmpty {
                    Button("Edit details") { showForm = true }
                        .buttonStyle(BrutButtonStyle(kind: .quiet))
                        .frame(minHeight: 44)
                }
                Button("Not now", action: onDismiss)
                    .buttonStyle(BrutButtonStyle(kind: .quiet))
                    .frame(minHeight: 44)
            }
            .disabled(isSaving)
        }
        .padding(18)
        .frame(maxWidth: 440, alignment: .leading)
        .brutCard(fill: Theme.fg.opacity(0.06), radius: 22)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Match details")
        .sheet(isPresented: $showForm) {
            PersonFormView(people: people, prefill: card, relationship: relationship) { person in
                saved = person
                Task { await ask(about: person) }
            }
        }
    }

    @ViewBuilder private var details: some View {
        Text(card.name).brutHeading(26)
        VStack(alignment: .leading, spacing: 8) {
            Text("They are your").eyebrow()
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(Relationship.allCases) { option in
                        BrutChip(text: option.label, active: relationship == option) { relationship = option }
                            .accessibilityAddTraits(relationship == option ? .isSelected : [])
                    }
                }
            }
            .disabled(isSaving || saved != nil)
        }
        VStack(alignment: .leading, spacing: 8) {
            Text("Born").eyebrow()
            if let first = card.birthDate, let second = card.altBirthDate {
                choices([first, second], label: Self.pretty, isOn: { birthDate == $0 }) { birthDate = $0 }
            }
            Text([birthDate.map(Self.pretty), timeText].compactMap { $0 }.joined(separator: ", "))
                .font(.brutBody(15))
                .foregroundStyle(Theme.fg)
        }
        VStack(alignment: .leading, spacing: 8) {
            Text("Place of birth").eyebrow()
            if card.placeAmbiguous {
                choices(card.places, label: \.name, isOn: { place == $0 }) { place = $0 }
            } else if let place {
                Text(place.name).font(.brutBody(15)).foregroundStyle(Theme.fg)
            }
        }
        SancharaPrimaryButton(title: L10n.string("Match our charts"), isLoading: isSaving) {
            Task { await confirm() }
        }
        .disabled(isSaving || birthDate == nil || place == nil)
        .opacity(birthDate == nil || place == nil ? 0.4 : 1)
    }

    private func choices<T: Hashable>(
        _ options: [T], label: @escaping (T) -> String, isOn: @escaping (T) -> Bool, pick: @escaping (T) -> Void
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(options, id: \.self) { option in
                BrutChip(text: label(option), active: isOn(option)) { pick(option) }
                    .accessibilityAddTraits(isOn(option) ? .isSelected : [])
            }
        }
        .disabled(isSaving || saved != nil)
    }

    private var timeText: String {
        guard card.timeKnown, let raw = card.birthTime, let time = Self.clock.date(from: raw) else {
            return L10n.string("Time unknown")
        }
        return Self.time.string(from: time)
    }

    private func confirm() async {
        guard let birthDate, let place else { return }
        isSaving = true
        errorMessage = nil
        if saved == nil {
            saved = await people.add(card.draft(relationship: relationship, birthDate: birthDate, place: place))
        }
        guard let saved else {
            isSaving = false
            errorMessage = people.errorMessage
            return
        }
        await ask(about: saved)
    }

    /// The match screen's own question, scores included, asked here instead.
    private func ask(about person: Person) async {
        isSaving = true
        defer { isSaving = false }
        do {
            let report = try await PeopleAPI.compatibility(with: person.id)
            onMatched(person, report.askPrompt)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private static func pretty(_ iso: String) -> String {
        guard let date = day.date(from: iso) else { return iso }
        let f = DateFormatter()
        f.locale = L10n.locale
        f.timeZone = TimeZone(identifier: "UTC")
        f.setLocalizedDateFormatFromTemplate("dMMMyyyy")
        return f.string(from: date)
    }

    private static func fixed(_ format: String) -> DateFormatter {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = format
        return f
    }
    private static let day = fixed("yyyy-MM-dd")
    private static let clock = fixed("HH:mm")
    private static let time = fixed("h:mm a")
}
