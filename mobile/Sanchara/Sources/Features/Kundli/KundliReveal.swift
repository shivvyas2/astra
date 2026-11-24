import SwiftUI

/// The kundli drawing itself: the sky, the chart sketched, the planets landing,
/// and everything settling into the chart that is always there.
///
/// Planets land where the chart says they are; nothing here is decoration.
/// See docs/design/2026-11-17-signature-motion.md, moment 2.
enum KundliReveal {
    static let duration: Double = 4.9
    /// When the real chart starts to take over, and how long it takes.
    static let settleAt: Double = 4.1
    static let settleFor: Double = 0.8
    static let lastLanding: Double = 3.75
    /// Planets closer than this fan out along the radius.
    static let crowded: Double = 8

    /// The order planets reach their places: the quick ones first.
    static let order = ["Moon", "Mercury", "Venus", "Sun", "Mars", "Jupiter", "Saturn", "Rahu", "Ketu"]

    /// Absolute sidereal longitude: thirty degrees a sign, from 0 Aries.
    static func longitude(of planet: ChartPlanet) -> Double? {
        Rashi(english: planet.sign).map { Double($0.rawValue) * 30 + planet.degree }
    }

    /// Which ring each planet rides on, so none hides another. The outermost
    /// is 0; a planet within `crowded` degrees of one already there moves in.
    static func rings(_ planets: [ChartPlanet]) -> [String: Int] {
        var rings: [String: Int] = [:]
        var placed: [(longitude: Double, ring: Int)] = []
        for planet in planets.sorted(by: { (longitude(of: $0) ?? 0) < (longitude(of: $1) ?? 0) }) {
            let here = longitude(of: planet) ?? 0
            let taken = Set(placed.filter { other in
                let gap = abs(other.longitude - here).truncatingRemainder(dividingBy: 360)
                return min(gap, 360 - gap) < crowded
            }.map(\.ring))
            let ring = (0...).first { !taken.contains($0) } ?? 0
            rings[planet.name] = ring
            placed.append((here, ring))
        }
        return rings
    }

    /// The same for the same chart on every launch, and different when a birth
    /// time is corrected, so the corrected chart draws itself again.
    static func key(for chart: NatalChart) -> String {
        let text = ([chart.ascendant.sign, String(format: "%.2f", chart.ascendant.degree)]
            + chart.planets.map { "\($0.name)\($0.sign)\(String(format: "%.2f", $0.degree))\($0.house)" }).joined(separator: "|")
        var hash: UInt64 = 0xcbf2_9ce4_8422_2325
        for byte in text.utf8 { hash = (hash ^ UInt64(byte)) &* 0x100_0000_01b3 }
        return "kundli.\(String(hash, radix: 16))"
    }

    // MARK: - Drawing

    static func draw(_ chart: NatalChart, script: NameScript, glyphSize: CGFloat, numeralSize: CGFloat, in context: GraphicsContext, size: CGSize, at t: Double) {
        let side = min(size.width, size.height)
        let origin = CGPoint(x: (size.width - side) / 2, y: (size.height - side) / 2)
        let at = { (p: CGPoint) in CGPoint(x: origin.x + p.x * side, y: origin.y + p.y * side) }
        let centre = at(CGPoint(x: 0.5, y: 0.5))
        let hand = 1 - Ink.easeInOut(Ink.phase(t, settleAt, settleAt + settleFor))
        // The real chart fades in under the ink as it straightens.
        let ink = 1 - Ink.phase(t, settleAt + settleFor * 0.45, settleAt + settleFor)

        sky(centre, radius: side * 0.43, in: context, at: t)
        frame(at, in: context, at: t, hand: hand, opacity: ink)

        let numeral = min(numeralSize, side * 0.034)
        let label = min(glyphSize, side * (script == .english ? 0.046 : 0.04))
        let rings = rings(chart.planets)
        for house in chart.houses {
            let places = slots(house, script: script, numeral: numeral, label: label, anchor: at(KundliGeometry.labelAnchor(house: house.number)), in: context)
            let shown = Ink.phase(t, 2.9 + Double(house.number) * 0.03, 3.2 + Double(house.number) * 0.03)
            let tint: Color = house.isLagna ? Theme.accent : Theme.muted
            let figure = Text(verbatim: "\(house.rashi.number)")
                .font(font(numeral, .medium, in: context))
                .foregroundStyle(tint.opacity(shown * ink))
            context.draw(figure, at: places.numeral)
            for (index, planet) in house.planets.enumerated() {
                self.planet(
                    planet, landing: places.planets[index], ring: rings[planet.name] ?? 0,
                    centre: centre, side: side, radius: label * 0.5, in: context, at: t,
                    // Gone before the labels it becomes are more than a shadow.
                    opacity: 1 - Ink.phase(t, settleAt, settleAt + settleFor * 0.5)
                )
            }
        }
    }

    private static func sky(_ centre: CGPoint, radius: CGFloat, in context: GraphicsContext, at t: Double) {
        let fade = 1 - Ink.phase(t, 1.75, 2.35)
        guard fade > 0 else { return }
        Ink.draw(
            Ink.circle(centre, radius: radius, from: .pi, steps: 60), in: context,
            progress: Ink.easeOut(Ink.phase(t, 0, 0.85)),
            style: .init(color: Theme.fg, opacity: 0.55 * fade, wobble: 1.6, overshoot: 8, seed: 4)
        )
        for tick in 0..<12 {
            let a = Double.pi + Double(tick) * .pi / 6
            let start = 0.15 + Double(tick) * 0.05
            let out = { (r: CGFloat) in CGPoint(x: centre.x + CGFloat(cos(a)) * r, y: centre.y - CGFloat(sin(a)) * r) }
            Ink.draw(
                [out(radius), out(radius + 8)], in: context, progress: Ink.phase(t, start, start + 0.25),
                style: .init(color: Theme.fg, opacity: 0.5 * fade, wobble: 0.6, overshoot: 1, seed: 30 + Double(tick))
            )
        }
    }

    private static func frame(_ at: @escaping (CGPoint) -> CGPoint, in context: GraphicsContext, at t: Double, hand: Double, opacity: Double) {
        let p = { (x: CGFloat, y: CGFloat) in at(CGPoint(x: x, y: y)) }
        let lines: [(points: [CGPoint], from: Double, to: Double, closed: Bool, seed: Double)] = [
            ([p(0, 0), p(1, 0), p(1, 1), p(0, 1)], 1.7, 2.35, true, 11),
            ([p(0, 0), p(1, 1)], 2.15, 2.55, false, 12),
            ([p(1, 0), p(0, 1)], 2.3, 2.7, false, 13),
            ([p(0.5, 0), p(1, 0.5), p(0.5, 1), p(0, 0.5)], 2.45, 3.05, true, 14),
        ]
        for line in lines {
            Ink.draw(
                line.points, in: context, progress: Ink.easeInOut(Ink.phase(t, line.from, line.to)), hand: hand,
                style: .init(color: Theme.fg, opacity: 0.82 * opacity, restWidth: Theme.lineWidth, restOpacity: 0.55 * opacity, seed: line.seed, closed: line.closed)
            )
        }
        Ink.draw(
            KundliGeometry.polygon(house: 1).map(at), in: context, progress: Ink.easeInOut(Ink.phase(t, 3.45, 4.05)), hand: hand,
            style: .init(color: Theme.accent, opacity: 0.95 * opacity, restOpacity: 0.55 * opacity, width: 1.9, seed: 22, closed: true)
        )
    }

    private static func planet(_ planet: ChartPlanet, landing: CGPoint, ring: Int, centre: CGPoint, side: CGFloat, radius: CGFloat, in context: GraphicsContext, at t: Double, opacity: Double) {
        let place = Double(order.firstIndex(of: planet.name) ?? order.count)
        let start = 0.35 + place * 0.04, arrive = 1.05 + place * 0.085
        let sweep = Ink.phase(t, start, arrive)
        guard sweep > 0, let target = longitude(of: planet) else { return }
        var lon = target * Ink.easeOut(sweep)
        if planet.retrograde { lon += sin(Ink.phase(t, arrive - 0.25, arrive + 0.3) * .pi) * 7 }
        let a = Double.pi + lon * .pi / 180
        let r = side * (0.38 - CGFloat(ring) * 0.062)
        let inSky = CGPoint(x: centre.x + CGFloat(cos(a)) * r, y: centre.y - CGFloat(sin(a)) * r)
        let land = Ink.easeInOut(Ink.phase(t, 2.65 + place * 0.06, 3.2 + place * 0.06))
        let here = CGPoint(
            x: Ink.mix(inSky.x, landing.x, land),
            y: Ink.mix(inSky.y, landing.y, land) - CGFloat(sin(land * .pi)) * 14
        )
        PlanetInk.draw(
            planet.name, at: here, radius: radius, in: context, progress: Ink.phase(t, start, start + 0.3),
            color: land > 0.5 ? Theme.fg : Theme.ember, opacity: opacity, seed: 50 + place * 7
        )
    }

    private static func font(_ size: CGFloat, _ weight: Font.Weight, in context: GraphicsContext) -> Font {
        BrutFont.scaled(size: size, weight: weight).font(at: context.environment.dynamicTypeSize)
    }

    /// Where the chart's own layout puts a house's numeral and planets, so the
    /// ink lands on the labels it becomes. Mirrors `KundliChartView.contents`.
    private static func slots(_ house: KundliHouse, script: NameScript, numeral: CGFloat, label: CGFloat, anchor: CGPoint, in context: GraphicsContext) -> (numeral: CGPoint, planets: [CGPoint]) {
        let room = CGSize(width: 400, height: 400)
        func size(_ text: String, _ points: CGFloat, _ weight: Font.Weight) -> CGSize {
            let styled = Text(verbatim: text).font(font(points, weight, in: context))
            return context.resolve(styled).measure(in: room)
        }
        let weight: Font.Weight = script == .english ? .regular : .semibold
        let top: CGSize = size("\(house.rashi.number)", numeral, .medium)
        let labels: [CGSize] = house.planets.map { size($0.chartLabel(in: script), label, weight) }
        let rows = stride(from: 0, to: labels.count, by: 2).map { Array($0..<min($0 + 2, labels.count)) }
        let heights: [CGFloat] = rows.map { row in row.map { labels[$0].height }.max() ?? 0 }
        var total: CGFloat = top.height
        if !rows.isEmpty { total += 2 + heights.reduce(0, +) + CGFloat(rows.count - 1) }
        var y = anchor.y - total / 2
        let numeralAt = CGPoint(x: anchor.x, y: y + top.height / 2)
        y += top.height + 2
        var planets: [CGPoint] = []
        for (row, height) in zip(rows, heights) {
            let widths: [CGFloat] = row.map { labels[$0].width }
            let rowWidth: CGFloat = widths.reduce(0, +) + 5 * CGFloat(row.count - 1)
            var x: CGFloat = anchor.x - rowWidth / 2
            for index in row {
                planets.append(CGPoint(x: x + labels[index].width / 2, y: y + height / 2))
                x += labels[index].width + 5
            }
            y += height + 1
        }
        return (numeralAt, planets)
    }
}

/// The kundli, drawing itself the first time it is seen and again when the
/// chart changes or someone asks. At rest it is `KundliChartView` and nothing else.
struct KundliChartMoment: View {
    let chart: NatalChart
    @Binding var selected: KundliHouse?
    var script: NameScript = .english

    private enum Phase: Equatable { case waiting, playing(Date), resting }

    @State private var phase: Phase
    @State private var rest: Double
    @State private var run: Task<Void, Never>?
    @Environment(\.pageIsShowing) private var pageIsShowing
    @ScaledMetric(relativeTo: .footnote) private var glyphSize: CGFloat = 15
    @ScaledMetric(relativeTo: .caption2) private var numeralSize: CGFloat = 11

    init(chart: NatalChart, selected: Binding<KundliHouse?>, script: NameScript = .english) {
        self.chart = chart
        _selected = selected
        self.script = script
        let waits = MotionGate.shouldPlay(KundliReveal.key(for: chart), .onceEver)
        _phase = State(initialValue: waits ? .waiting : .resting)
        _rest = State(initialValue: waits ? 0 : 1)
    }

    var body: some View {
        KundliChartView(chart: chart, selected: $selected, script: script, rest: rest)
            .overlay {
                if case .playing(let start) = phase {
                    InkCanvas(start: start) { context, size, t in
                        KundliReveal.draw(chart, script: script, glyphSize: glyphSize, numeralSize: numeralSize, in: context, size: size, at: t)
                    }
                    Color.clear
                        .contentShape(Rectangle())
                        .onTapGesture(perform: finish)
                        .accessibilityHidden(true)
                }
            }
            .onFirstVisible(0.8) { if phase == .waiting { play() } }
            .onChange(of: pageIsShowing) { _, showing in
                if !showing, case .playing = phase { finish() }
            }
            .onChange(of: KundliReveal.key(for: chart)) { _, key in
                // A corrected birth time: the new chart draws itself.
                if MotionGate.shouldPlay(key, .onceEver), pageIsShowing { play() }
            }
            .contextMenu {
                if phase == .resting, !Theme.reducesMotion {
                    Button("Draw it again", systemImage: "pencil.and.outline", action: play)
                }
            }
            .accessibilityAction(named: L10n.string("Draw it again")) { play() }
            .onDisappear(perform: finish)
    }

    private func play() {
        guard !Theme.reducesMotion else { return finish() }
        run?.cancel()
        MotionGate.recordPlayed(KundliReveal.key(for: chart), .onceEver)
        selected = nil
        rest = 0
        phase = .playing(.now)
        withAnimation(.easeInOut(duration: KundliReveal.settleFor * 0.7).delay(KundliReveal.settleAt + KundliReveal.settleFor * 0.3)) {
            rest = 1
        }
        run = Task {
            try? await Task.sleep(for: .seconds(KundliReveal.lastLanding))
            guard !Task.isCancelled else { return }
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            try? await Task.sleep(for: .seconds(KundliReveal.duration - KundliReveal.lastLanding))
            guard !Task.isCancelled else { return }
            phase = .resting
        }
    }

    private func finish() {
        guard phase != .waiting else { return }
        run?.cancel()
        var plain = Transaction()
        plain.disablesAnimations = true
        withTransaction(plain) {
            phase = .resting
            rest = 1
        }
    }
}
