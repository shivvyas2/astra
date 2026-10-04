import SwiftUI

/// The North Indian kundli, drawn natively.
///
/// The diagram is the one fixed thing in Vedic chart-reading: a square, its two
/// diagonals, and a diamond joining the midpoints of the sides, cutting the
/// page into twelve houses whose *positions never move*. House 1 is always the
/// kite at the top; the rest run anticlockwise from it. What rotates is the
/// rashi that lands in each house, which is why the lagna is the only input the
/// layout needs.
///
/// Geometry is expressed in a unit square and scaled at draw time, so the same
/// definitions serve the on-screen chart, the share card, and the accessibility
/// descriptions without three sets of magic numbers.
enum KundliGeometry {
    /// The twelve house polygons, anticlockwise from the top kite, in unit
    /// coordinates with y running down (SwiftUI's convention).
    static func polygon(house: Int) -> [CGPoint] {
        // Named vertices, so the table below reads like the drawing.
        let tl = CGPoint(x: 0, y: 0), tr = CGPoint(x: 1, y: 0)
        let bl = CGPoint(x: 0, y: 1), br = CGPoint(x: 1, y: 1)
        let t = CGPoint(x: 0.5, y: 0), r = CGPoint(x: 1, y: 0.5)
        let b = CGPoint(x: 0.5, y: 1), l = CGPoint(x: 0, y: 0.5)
        let c = CGPoint(x: 0.5, y: 0.5)
        // Where each diagonal crosses the inner diamond.
        let tlq = CGPoint(x: 0.25, y: 0.25), trq = CGPoint(x: 0.75, y: 0.25)
        let blq = CGPoint(x: 0.25, y: 0.75), brq = CGPoint(x: 0.75, y: 0.75)

        switch house {
        case 1: return [tlq, t, trq, c]
        case 2: return [tl, t, tlq]
        case 3: return [tl, tlq, l]
        case 4: return [l, tlq, c, blq]
        case 5: return [l, blq, bl]
        case 6: return [bl, blq, b]
        case 7: return [blq, b, brq, c]
        case 8: return [b, brq, br]
        case 9: return [br, brq, r]
        case 10: return [r, trq, c, brq]
        case 11: return [r, trq, tr]
        default: return [tr, trq, t]
        }
    }

    /// Where a house's contents are centred.
    ///
    /// The polygon centroid is right for the four kites. For the eight
    /// triangles it is not quite: a triangle's centroid already sits two-thirds
    /// of the way towards its long outer edge, so a stack of a numeral and a
    /// row of glyphs centred there overhangs the border of the chart — which is
    /// exactly what the first render did, clipping the retrograde marks off
    /// Mercury and half of Jupiter. They are pulled back towards the middle by
    /// a modest fraction, which clears the edge without crowding the diagonals.
    static func labelAnchor(house: Int) -> CGPoint {
        let points = polygon(house: house)
        let centroid = CGPoint(
            x: points.map(\.x).reduce(0, +) / CGFloat(points.count),
            y: points.map(\.y).reduce(0, +) / CGFloat(points.count)
        )
        guard points.count == 3 else { return centroid }
        let centre = CGPoint(x: 0.5, y: 0.5)
        let pullIn: CGFloat = 0.12
        return CGPoint(
            x: centroid.x + (centre.x - centroid.x) * pullIn,
            y: centroid.y + (centre.y - centroid.y) * pullIn
        )
    }

    static func path(house: Int, in rect: CGRect) -> Path {
        var path = Path()
        let points = polygon(house: house).map {
            CGPoint(x: rect.minX + $0.x * rect.width, y: rect.minY + $0.y * rect.height)
        }
        path.addLines(points)
        path.closeSubpath()
        return path
    }
}

/// The square, its diagonals, and the inner diamond — every line of the chart,
/// as one stroked path.
struct KundliFrame: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let p = { (x: CGFloat, y: CGFloat) in
            CGPoint(x: rect.minX + x * rect.width, y: rect.minY + y * rect.height)
        }
        path.addRect(rect)
        path.move(to: p(0, 0)); path.addLine(to: p(1, 1))
        path.move(to: p(1, 0)); path.addLine(to: p(0, 1))
        path.move(to: p(0.5, 0))
        path.addLine(to: p(1, 0.5))
        path.addLine(to: p(0.5, 1))
        path.addLine(to: p(0, 0.5))
        path.closeSubpath()
        return path
    }
}

/// One house, as a tappable region.
private struct HouseRegion: Shape {
    let house: Int
    func path(in rect: CGRect) -> Path { KundliGeometry.path(house: house, in: rect) }
}

// MARK: - The chart

struct KundliChartView: View {
    let chart: NatalChart
    @Binding var selected: KundliHouse?

    /// Glyphs stay legible when Dynamic Type grows, but the diagram has fixed
    /// geometry, so the scaling is capped. The full table underneath the chart
    /// carries unbounded Dynamic Type — no one has to read the diagram to get
    /// at the numbers.
    @ScaledMetric(relativeTo: .footnote) private var glyphSize: CGFloat = 15
    @ScaledMetric(relativeTo: .caption2) private var numeralSize: CGFloat = 11

    var body: some View {
        GeometryReader { proxy in
            let side = min(proxy.size.width, proxy.size.height)
            let rect = CGRect(x: 0, y: 0, width: side, height: side)

            ZStack {
                ForEach(chart.houses) { house in
                    HouseRegion(house: house.number)
                        .fill(fill(for: house))
                        .overlay {
                            if house.isLagna || selected?.number == house.number {
                                HouseRegion(house: house.number)
                                    .stroke(stroke(for: house), lineWidth: selected?.number == house.number ? 1.5 : 1)
                            }
                        }
                        .contentShape(HouseRegion(house: house.number))
                        .onTapGesture { select(house) }
                        .accessibilityElement()
                        .accessibilityLabel(house.accessibilityLabel)
                        .accessibilityHint("Opens this house's details")
                        .accessibilityAddTraits(.isButton)
                }

                KundliFrame()
                    .stroke(Theme.chartLine, lineWidth: Theme.lineWidth)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)

                ForEach(chart.houses) { house in
                    contents(house)
                        .position(
                            x: KundliGeometry.labelAnchor(house: house.number).x * side,
                            y: KundliGeometry.labelAnchor(house: house.number).y * side
                        )
                        .allowsHitTesting(false)
                        .accessibilityHidden(true)
                }
            }
            .frame(width: rect.width, height: rect.height)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .animation(Theme.ease, value: selected?.number)
            .accessibilityElement(children: .contain)
            .accessibilityLabel("North Indian kundli. Twelve houses, lagna \(chart.ascendantRashi.sanskrit) at the top.")
        }
        .aspectRatio(1, contentMode: .fit)
    }

    private func select(_ house: KundliHouse) {
        selected = selected?.number == house.number ? nil : house
    }

    /// The lagna is marked, not spotlit.
    ///
    /// The first version gave house 1 a full-strength accent outline, and the
    /// result was a large glowing diamond that read as "this house is selected"
    /// — which is precisely the meaning selection needs for itself. The lagna
    /// now gets a half-strength line, and full accent is kept for the house the
    /// person actually tapped.
    private func stroke(for house: KundliHouse) -> Color {
        selected?.number == house.number ? Theme.accent : Theme.accent.opacity(0.55)
    }

    private func fill(for house: KundliHouse) -> Color {
        if selected?.number == house.number { return Theme.accent.opacity(0.28) }
        if house.isLagna { return Theme.accent.opacity(0.10) }
        // Alternating houses get the faintest wash, so the twelve regions read
        // as distinct areas without twelve visible borders.
        return house.number.isMultiple(of: 2) ? Theme.fg.opacity(0.03) : .clear
    }

    private func contents(_ house: KundliHouse) -> some View {
        VStack(spacing: 2) {
            // The rashi numeral is how a kundli is read — it identifies the sign
            // sitting in a fixed house. Set in the text face at medium weight,
            // in step with the rest of the screen's numerals.
            Text("\(house.rashi.number)")
                .font(.system(size: numeralSize, weight: .medium))
                .foregroundStyle(house.isLagna ? Theme.accent : Theme.muted)

            if !house.planets.isEmpty {
                // Two per row keeps a four-planet house inside the narrowest
                // triangle without shrinking the glyphs below legibility.
                let rows = stride(from: 0, to: house.planets.count, by: 2).map {
                    Array(house.planets[$0..<min($0 + 2, house.planets.count)])
                }
                VStack(spacing: 1) {
                    ForEach(rows, id: \.first?.id) { row in
                        HStack(spacing: 5) {
                            ForEach(row) { planet in
                                Text(planet.glyph)
                                    .font(.system(size: glyphSize))
                                    .foregroundStyle(Theme.fg)
                                    .overlay(alignment: .topTrailing) {
                                        if planet.retrograde {
                                            Text("R")
                                                .font(.system(size: max(7, numeralSize - 3), weight: .medium))
                                                .foregroundStyle(Theme.accent)
                                                .offset(x: 5, y: -3)
                                        }
                                    }
                            }
                        }
                    }
                }
            }
        }
        .fixedSize()
    }
}
