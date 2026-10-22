import SwiftUI

/// One match: the Guna Milan total out of 36 as the screen's large figure,
/// the eight kootas with both people's categories, the doshas, and how the
/// two Western charts meet. Ask about this match carries both charts into a
/// reading that keeps them for every follow-up.
struct CompatibilityView: View {
    let person: Person
    let people: PeopleStore

    @State private var report: CompatibilityReport?
    @State private var errorMessage: String?
    @State private var groomIsThem = false
    @State private var confirmDelete = false
    @Environment(\.navigator) private var navigator
    @Environment(\.dismiss) private var dismiss

    /// `report` shows a result straight away: for previews and snapshots.
    init(person: Person, people: PeopleStore, report: CompatibilityReport? = nil) {
        self.person = person
        self.people = people
        _report = State(initialValue: report)
    }

    var body: some View {
        ZStack {
            Atmosphere(mood: .dusk)
            ScrollView { page }
        }
        .clearsTabBar()
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button(L10n.string("Remove \(person.label)"), role: .destructive) { confirmDelete = true }
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.fg)
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel(L10n.string("More"))
            }
        }
        .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
        .alert(L10n.string("Remove \(person.label)?"), isPresented: $confirmDelete) {
            Button(L10n.string("Cancel"), role: .cancel) {}
            Button(L10n.string("Remove"), role: .destructive) {
                Task { if await people.remove(person.id) { dismiss() } }
            }
        } message: {
            Text(L10n.string("Their birth details and chart are deleted. Readings about the two of you stay in your history."))
        }
        .task(id: groomIsThem) {
            if report == nil || groomIsThem { await load() }
        }
    }

    /// Everything under the bar. Not private, so a snapshot can render it
    /// without the scroll view around it.
    var page: some View {
        VStack(alignment: .leading, spacing: 28) {
            VStack(alignment: .leading, spacing: 10) {
                Text("Matching").eyebrow()
                Text("You & \(person.label)")
                    .brutHeading(36)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if let report {
                summary(report)
                kootas(report)
                doshas(report)
                synastry(report)
            } else if let errorMessage {
                BrutNotice(text: errorMessage)
                SancharaSecondaryButton(title: L10n.string("Try again")) { Task { await load() } }
            } else {
                ProgressView()
                    .tint(Theme.accent)
                    .frame(maxWidth: .infinity, minHeight: 200)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 24)
        .frame(maxWidth: 480)
        .frame(maxWidth: .infinity)
    }

    private func load() async {
        errorMessage = nil
        do {
            report = try await PeopleAPI.compatibility(with: person.id, groomIsThem: groomIsThem)
        } catch {
            report = nil
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Sections

    private func summary(_ r: CompatibilityReport) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            BigNumber(value: GunaFormat.points(r.guna.total), unit: L10n.string("of 36 gunas"), caption: r.guna.verdict, color: Theme.accent)
            Text(r.summary)
                .font(.brutBody(15))
                .foregroundStyle(Theme.fg)
                .lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
            SancharaPrimaryButton(title: L10n.string("Ask about this match"), kind: .accent) {
                navigator.askAboutMatch(person.id, person.label, r.askPrompt)
            }
            Text("Opens a reading with both charts. Every follow-up question keeps them.")
                .font(.brutBody(12))
                .foregroundStyle(Theme.muted)
        }
    }

    private func kootas(_ r: CompatibilityReport) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("The eight kootas").eyebrow()
                .padding(.bottom, 4)
            ForEach(r.guna.kootas) { k in
                BrutDivider()
                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(k.name)
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(Theme.fg)
                        Spacer(minLength: 8)
                        Text("\(GunaFormat.points(k.score)) / \(GunaFormat.points(k.max))")
                            .font(.brutMono(14, weight: .semibold))
                            .foregroundStyle(k.score == 0 ? Theme.ember : Theme.fg)
                    }
                    Capsule()
                        .fill(Theme.rule)
                        .frame(height: 3)
                        .overlay(alignment: .leading) {
                            GeometryReader { geo in
                                Capsule()
                                    .fill(k.score == 0 ? Theme.ember : Theme.accent)
                                    .frame(width: geo.size.width * (k.max > 0 ? k.score / k.max : 0))
                            }
                        }
                    Text("You: \(GunaFormat.category(k.you, koota: k.key)). \(person.label): \(GunaFormat.category(k.them, koota: k.key)).")
                        .font(.brutBody(13))
                        .foregroundStyle(Theme.muted)
                    Text(k.note)
                        .font(.brutBody(14))
                        .foregroundStyle(Theme.fg)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.vertical, 14)
                .accessibilityElement(children: .combine)
            }
            BrutDivider()
            Button {
                groomIsThem.toggle()
            } label: {
                Text(groomIsThem ? L10n.string("Read your chart as the groom's") : L10n.string("Read \(person.label)'s chart as the groom's"))
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.fg)
                    .underline()
                    .frame(minHeight: 44)
            }
            .buttonStyle(.plain)
            Text("A few kootas read differently with the roles swapped. That way round: \(GunaFormat.points(r.guna.swappedTotal)) of 36.")
                .font(.brutBody(12))
                .foregroundStyle(Theme.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func doshas(_ r: CompatibilityReport) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Doshas").eyebrow()
                .padding(.bottom, 4)
            ForEach(r.guna.doshas) { d in
                BrutDivider()
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text(d.title)
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(Theme.fg)
                        Spacer(minLength: 8)
                        BrutTag(
                            text: d.present ? L10n.string("Present") : L10n.string("Absent"),
                            fill: d.present ? Theme.ember : Theme.fg.opacity(0.12),
                            textColor: d.present ? Theme.ink : Theme.muted
                        )
                    }
                    Text(d.note)
                        .font(.brutBody(14))
                        .foregroundStyle(Theme.fg)
                        .fixedSize(horizontal: false, vertical: true)
                    ForEach(d.exceptions, id: \.self) { exception in
                        Text(exception)
                            .font(.brutBody(13))
                            .foregroundStyle(Theme.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.vertical, 14)
            }
            BrutDivider()
        }
    }

    private func synastry(_ r: CompatibilityReport) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("How your charts meet").eyebrow()
                .padding(.bottom, 4)
            DataRow(label: L10n.string("Western synastry"), value: "\(r.synastry.score0to100)", detail: L10n.string("out of 100"))
            ForEach(r.synastry.aspects.prefix(6)) { a in
                HStack(alignment: .firstTextBaseline) {
                    Text("Your \(GunaFormat.planet(a.a)) \(GunaFormat.aspect(a.aspect)) \(person.label)'s \(GunaFormat.planet(a.b))")
                        .font(.brutBody(14))
                        .foregroundStyle(Theme.fg)
                    Spacer(minLength: 8)
                    Text(GunaFormat.tone(a.tone))
                        .font(.brutBody(13))
                        .foregroundStyle(a.tone == "harmonious" ? Theme.accent : a.tone == "challenging" ? Theme.ember : Theme.muted)
                }
                .padding(.vertical, 10)
                BrutDivider()
            }
        }
    }
}
