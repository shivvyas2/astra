import SwiftUI

/// A chart inside a reading: the kundli, drawn by hand the first time it is
/// seen, the ashtakavarga points, or the dasha timeline.
struct ChartBlockView: View {
    let block: ChartBlock
    @AppStorage(NameScript.storageKey) private var chosenNames: NameScript?
    private var script: NameScript { chosenNames ?? .followingLanguage }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(title)
                    .font(.scaled(size: 14, weight: .medium))
                    .foregroundStyle(Theme.fg)
                Spacer(minLength: 8)
                if block.name != "-" {
                    Text(block.name)
                        .font(.brutBody(13))
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1)
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)

            switch block.content {
            case .houses(let houses):
                drawing(houses)
                    .frame(maxWidth: 380)
                    .frame(maxWidth: .infinity)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(spoken(houses))
                ChartKey(
                    planets: houses.flatMap(\.items).map { $0.replacingOccurrences(of: " (R)", with: "") },
                    hasRetrograde: houses.contains { $0.items.contains { $0.hasSuffix("(R)") } },
                    points: block.id == "SAV",
                    fromMoon: block.id == "Moon",
                    script: script
                )
            case .dasha(let periods):
                dashas(periods)
                Text("Each bar is one main period of your life; a longer bar is a longer period. The bright one is now.")
                    .font(.brutBody(12))
                    .foregroundStyle(Theme.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            ChartNamesMenu()
        }
        .padding(14)
        .brutBordered(fill: Theme.fg.opacity(0.03))
    }

    private var title: String {
        switch block.id {
        case "D1": L10n.string("Birth chart")
        case "Moon": L10n.string("Chart from the Moon")
        case "SAV": L10n.string("Ashtakavarga")
        case "Dasha": L10n.string("Dasha timeline")
        case "D7": L10n.string("D7 Saptamsa, children")
        case "D9": L10n.string("D9 Navamsa, marriage")
        case "D10": L10n.string("D10 Dasamsa, career")
        default: L10n.string("\(block.id) chart")
        }
    }

    @ViewBuilder
    private func drawing(_ houses: [ChartBlock.House]) -> some View {
        if let natal = block.natal {
            KundliChartMoment(chart: natal, selected: .constant(nil), script: script)
        } else {
            points(houses)
        }
    }

    /// Each house's points, in the kundli's own places.
    private func points(_ houses: [ChartBlock.House]) -> some View {
        GeometryReader { proxy in
            let side = min(proxy.size.width, proxy.size.height)
            ZStack {
                KundliFrame().stroke(Theme.chartLine, lineWidth: Theme.lineWidth)
                ForEach(Array(houses.enumerated()), id: \.offset) { index, house in
                    let anchor = KundliGeometry.labelAnchor(house: index + 1)
                    VStack(spacing: 1) {
                        Text("\(house.rashi.number)")
                            .font(.scaled(size: min(11, side * 0.034), weight: .medium))
                            .foregroundStyle(index == 0 ? Theme.accent : Theme.muted)
                        Text(house.items.first ?? "")
                            .font(.scaled(size: min(16, side * 0.05), weight: .semibold))
                            .foregroundStyle((Int(house.items.first ?? "") ?? 0) >= 30 ? Theme.accent : Theme.fg)
                    }
                    .fixedSize()
                    .position(x: anchor.x * side, y: anchor.y * side)
                }
            }
            .frame(width: side, height: side)
        }
        .aspectRatio(1, contentMode: .fit)
    }

    private func spoken(_ houses: [ChartBlock.House]) -> String {
        houses.enumerated().map { index, house in
            let place = L10n.string("House \(index + 1), \(house.rashi.name(in: script)), \(house.rashi.english)")
            if block.id == "SAV" { return "\(place): \(house.items.first ?? "0")" }
            let names = house.items.map { ChartPlanet.name(english: $0.replacingOccurrences(of: " (R)", with: ""), in: script) }
            return names.isEmpty ? L10n.string("\(place). Empty.") : "\(place): \(names.joined(separator: ", "))"
        }
        .joined(separator: ". ")
    }

    private func dashas(_ periods: [ChartBlock.Period]) -> some View {
        let today = Self.today()
        return VStack(alignment: .leading, spacing: 4) {
            ForEach(periods, id: \.start) { period in
                let now = period.start <= today && today < period.end
                HStack(spacing: 10) {
                    Capsule()
                        .fill(now ? Theme.accent : Theme.fg.opacity(period.end <= today ? 0.2 : 0.5))
                        .frame(width: 4)
                    Text(now ? "\(lord(period.lord)) · \(L10n.string("now"))" : lord(period.lord))
                        .font(.scaled(size: 14, weight: now ? .semibold : .regular))
                        .foregroundStyle(now ? Theme.accent : Theme.fg)
                    Spacer(minLength: 8)
                    Text("\(period.start.prefix(7)) – \(period.end.prefix(7))")
                        .font(.brutMono(12))
                        .foregroundStyle(Theme.muted)
                }
                // A longer period is a taller bar, as on the Life page.
                .frame(minHeight: max(26, years(period) * 2.2))
                .accessibilityElement(children: .combine)
            }
        }
        // The bars are as tall as their rows, not as whatever room there is.
        .fixedSize(horizontal: false, vertical: true)
    }

    private func lord(_ name: String) -> String {
        ChartPlanet.name(english: name, in: script)
    }

    private func years(_ period: ChartBlock.Period) -> Double {
        guard let s = PeriodProgress.parse(period.start), let e = PeriodProgress.parse(period.end) else { return 1 }
        return e.timeIntervalSince(s) / 31_557_600
    }

    private static func today() -> String {
        Date.now.formatted(.iso8601.year().month().day())
    }
}
