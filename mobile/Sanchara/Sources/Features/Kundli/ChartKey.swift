import SwiftUI

/// "How to read this chart": everything printed on a kundli spelled out, with
/// the English names beside the others so any reader can match them up.
struct ChartKey: View {
    let planets: [String]
    var hasRetrograde = false
    /// Points rather than planets: the ashtakavarga.
    var points = false
    /// The Moon's sign is drawn as house 1.
    var fromMoon = false
    let script: NameScript
    @State var open = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(Theme.snap) { open.toggle() }
            } label: {
                HStack(spacing: 8) {
                    Text("How to read this chart")
                        .font(.scaled(size: 14, weight: .medium))
                        .foregroundStyle(Theme.fg)
                    Spacer(minLength: 8)
                    Image(systemName: "plus")
                        .font(.scaled(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.muted)
                        .rotationEffect(.degrees(open ? 45 : 0))
                        .accessibilityHidden(true)
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityValue(open ? L10n.string("Open") : L10n.string("Closed"))

            if open {
                VStack(alignment: .leading, spacing: 10) {
                    if fromMoon { note("Your birth time is not known, so the Moon's sign is counted as house 1.") }
                    note("Houses never move: house 1 is the top diamond, and the rest run anticlockwise.")
                    note("The number in a house is the sign sitting in it:")
                    grid(Rashi.allCases.map { ("\($0.number)", $0.name(in: script), script == .english ? nil : $0.english) })
                    if points {
                        note("The large number is that house's points. 28 is average, 30 or more is strong, 25 or fewer is weak.")
                    } else {
                        note("Planets:")
                        grid(planets.map { (label($0), ChartPlanet.name(english: $0, in: script), script == .english ? nil : $0) })
                        if hasRetrograde { note("A small R means retrograde.") }
                    }
                }
                .padding(.bottom, 10)
            }
        }
    }

    private func label(_ name: String) -> String {
        ChartPlanet(name: name, sign: "", degree: 0, house: 0, retrograde: false, nakshatra: nil).chartLabel(in: script)
    }

    private func note(_ key: LocalizedStringKey) -> some View {
        Text(key)
            .font(.brutBody(13))
            .foregroundStyle(Theme.muted)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func grid(_ rows: [(String, String, String?)]) -> some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 140), spacing: 12, alignment: .leading)], alignment: .leading, spacing: 6) {
            ForEach(rows, id: \.0) { short, name, english in
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(short)
                        .font(.scaled(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.accent)
                        .frame(minWidth: 22, alignment: .leading)
                    Text(name)
                        .font(.brutBody(14))
                        .foregroundStyle(Theme.fg)
                    if let english {
                        Text(english)
                            .font(.brutBody(12))
                            .foregroundStyle(Theme.muted)
                    }
                }
                .accessibilityElement(children: .combine)
            }
        }
    }
}

/// The names a chart is drawn with, changed where the chart is.
struct ChartNamesMenu: View {
    @AppStorage(NameScript.storageKey) private var chosen: NameScript?
    private var current: NameScript { chosen ?? .followingLanguage }

    var body: some View {
        Menu {
            Picker("Names", selection: Binding(get: { current }, set: { chosen = $0 })) {
                ForEach(NameScript.allCases) { Text($0.label).tag($0) }
            }
        } label: {
            HStack(spacing: 6) {
                Text("Names").foregroundStyle(Theme.muted)
                Text(current.label).foregroundStyle(Theme.fg)
                Image(systemName: "chevron.down")
                    .font(.scaled(size: 10, weight: .bold))
                    .foregroundStyle(Theme.muted)
            }
            .font(.scaled(size: 13, weight: .semibold))
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .accessibilityLabel(L10n.string("Planet and sign names: \(current.label)"))
        .accessibilityHint("Choose Sanskrit, Hindi, Gujarati or English")
    }
}
