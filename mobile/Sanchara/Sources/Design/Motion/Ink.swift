import SwiftUI

/// A hand-drawn line.
///
/// A path is sampled every few points and pushed sideways by seeded noise, with
/// a width that swells and thins and a fainter second stroke beside it. The
/// seed is fixed, so the ink never shimmers between frames.
///
/// Two numbers drive it: `progress`, how much has been drawn, and `hand`, how
/// hand-drawn it is. At `hand` 0 the line lies exactly on the clean path, which
/// is how a drawing settles into the screen it belongs to.
/// See docs/design/2026-11-17-signature-motion.md.
enum Ink {
    struct Style {
        var color: Color
        var opacity: Double = 1
        /// Width and opacity once settled, when they differ from the ink's.
        var restWidth: CGFloat = 1
        var restOpacity: Double?
        var width: CGFloat = 1.6
        /// How far the line wanders, in points.
        var wobble: CGFloat = 2
        /// How far it runs past its ends, in points.
        var overshoot: CGFloat = 5
        var seed: Double = 1
        var closed = false
    }

    struct Sample: Equatable {
        var point: CGPoint
        var width: CGFloat
    }

    // MARK: - Maths

    static func hash(_ n: Double) -> Double {
        let s = sin(n * 127.1 + 311.7) * 43758.5453
        return s - s.rounded(.down)
    }

    /// Smooth noise in -1...1, the same for the same place and seed.
    static func noise(_ x: Double, seed: Double) -> Double {
        let i = x.rounded(.down), f = x - i
        let u = f * f * (3 - 2 * f)
        let a = hash(i + seed * 57), b = hash(i + 1 + seed * 57)
        return (a + (b - a) * u) * 2 - 1
    }

    /// Where `t` falls between `a` and `b`, clamped to 0...1.
    static func phase(_ t: Double, _ a: Double, _ b: Double) -> Double {
        b <= a ? (t >= b ? 1 : 0) : min(1, max(0, (t - a) / (b - a)))
    }
    static func easeOut(_ x: Double) -> Double { 1 - pow(1 - x, 3.2) }
    static func easeInOut(_ x: Double) -> Double { x < 0.5 ? 4 * x * x * x : 1 - pow(-2 * x + 2, 3) / 2 }
    static func mix(_ a: CGFloat, _ b: CGFloat, _ x: Double) -> CGFloat { a + (b - a) * CGFloat(x) }

    /// The points of one pass of the line, as far as it has been drawn.
    static func samples(_ input: [CGPoint], progress: Double, hand: Double, style: Style, pass: Int = 0) -> [Sample] {
        let points = style.closed ? input + input.prefix(1) : input
        guard points.count > 1, progress > 0 else { return [] }
        var lengths: [CGFloat] = [0]
        for (a, b) in zip(points, points.dropFirst()) {
            lengths.append(lengths.last! + hypot(b.x - a.x, b.y - a.y))
        }
        let total = lengths.last!
        guard total > 0 else { return [] }
        let over = (style.closed ? min(3, style.overshoot) : style.overshoot) * CGFloat(hand)
        let from = -over, end = from + (total + 2 * over) * CGFloat(min(1, progress))
        let step = max(2.4, min(5, total / 14))

        var out: [Sample] = []
        var d = from
        var segment = 1
        while true {
            let at = min(d, end)
            while segment < points.count - 1, lengths[segment] < at { segment += 1 }
            let a = points[segment - 1], b = points[segment]
            let span = max(lengths[segment] - lengths[segment - 1], 0.0001)
            let f = (at - lengths[segment - 1]) / span
            let normal = CGPoint(x: -(b.y - a.y) / span, y: (b.x - a.x) / span)
            let x = Double(at), s = style.seed + Double(pass) * 9
            let wander = noise(x / 34, seed: s) + noise(x / 9, seed: s + 3) * 0.32
            let drift = pass == 0 ? 0 : noise(x / 70, seed: style.seed + 21) * 1.8
            let push = (CGFloat(wander) * style.wobble + CGFloat(drift)) * CGFloat(hand)
            let swell = 1 + noise(x / 26, seed: style.seed + 5) * 0.38
            out.append(Sample(
                point: CGPoint(
                    x: a.x + (b.x - a.x) * f + normal.x * push,
                    y: a.y + (b.y - a.y) * f + normal.y * push
                ),
                width: mix(style.restWidth, style.width * CGFloat(swell) * (pass == 0 ? 1 : 0.6), hand)
            ))
            if d >= end { break }
            d += step
        }
        return out
    }

    // MARK: - Drawing

    static func draw(_ points: [CGPoint], in context: GraphicsContext, progress: Double = 1, hand: Double = 1, style: Style) {
        guard progress > 0, style.opacity > 0 else { return }
        let opacity = style.opacity * hand + (style.restOpacity ?? style.opacity) * (1 - hand)
        for pass in hand > 0.02 ? [0, 1] : [0] {
            let line = samples(points, progress: progress, hand: hand, style: style, pass: pass)
            let shade = GraphicsContext.Shading.color(style.color.opacity(opacity * (pass == 0 ? 1 : 0.34 * hand)))
            context.fill(outline(of: line), with: shade)
        }
    }

    /// The line as one filled shape. Strokes laid end to end would darken
    /// wherever they overlap, and a see-through line would look beaded.
    static func outline(of line: [Sample]) -> Path {
        guard line.count > 1 else { return Path() }
        var left: [CGPoint] = [], right: [CGPoint] = []
        for index in line.indices {
            let before = line[max(0, index - 1)].point, after = line[min(line.count - 1, index + 1)].point
            let length = max(hypot(after.x - before.x, after.y - before.y), 0.0001)
            let half = line[index].width / 2
            let offset = CGPoint(x: -(after.y - before.y) / length * half, y: (after.x - before.x) / length * half)
            let p = line[index].point
            left.append(CGPoint(x: p.x + offset.x, y: p.y + offset.y))
            right.append(CGPoint(x: p.x - offset.x, y: p.y - offset.y))
        }
        var path = Path()
        path.addLines(left + right.reversed())
        path.closeSubpath()
        return path
    }

    static func circle(_ centre: CGPoint, radius: CGFloat, from start: Double = 0, steps: Int = 40) -> [CGPoint] {
        arc(centre, radius, start, start + 2 * .pi, steps)
    }

    static func arc(_ c: CGPoint, _ r: CGFloat, _ a: Double, _ b: Double, _ steps: Int = 18) -> [CGPoint] {
        (0...steps).map { i in
            let t = a + (b - a) * Double(i) / Double(steps)
            return CGPoint(x: c.x + CGFloat(cos(t)) * r, y: c.y + CGFloat(sin(t)) * r)
        }
    }
}

/// The nine grahas as pen strokes in a box from -1 to 1, y running down.
enum PlanetInk {
    private static func a(_ x: Double, _ y: Double, _ r: Double, _ from: Double, _ to: Double, _ n: Int = 18) -> [CGPoint] {
        Ink.arc(CGPoint(x: x, y: y), CGFloat(r), from, to, n)
    }
    private static func l(_ points: (Double, Double)...) -> [CGPoint] { points.map { CGPoint(x: $0.0, y: $0.1) } }

    static func strokes(for planet: String) -> [[CGPoint]] {
        let p = Double.pi
        switch planet {
        case "Sun": return [a(0, 0, 0.8, 0, 2 * p, 26), a(0, 0, 0.1, 0, 2 * p, 6)]
        case "Moon": return [a(0, 0, 0.88, 0.9, 2 * p - 0.9, 24) + a(0.46, 0, 0.69, 2 * p - 1.45, 1.45, 20)]
        case "Mercury": return [a(0, -0.15, 0.42, 0, 2 * p), a(0, -0.95, 0.42, 0.15, p - 0.15), l((0, 0.27), (0, 1)), l((-0.35, 0.66), (0.35, 0.66))]
        case "Venus": return [a(0, -0.4, 0.5, 0, 2 * p), l((0, 0.1), (0, 1)), l((-0.4, 0.58), (0.4, 0.58))]
        case "Mars": return [a(-0.2, 0.25, 0.58, 0, 2 * p), l((0.2, -0.18), (0.8, -0.8)), l((0.3, -0.82), (0.82, -0.82), (0.82, -0.3))]
        case "Jupiter": return [a(-0.2, -0.45, 0.45, -2.6, 1.2) + l((-0.7, 0.4), (0.75, 0.4)), l((0.4, -0.3), (0.4, 1))]
        case "Saturn": return [l((-0.25, -1), (-0.25, 0.6)), l((-0.65, -0.65), (0.2, -0.65)), a(0.12, 0.02, 0.38, -2.6, 1.3) + l((0.1, 0.75), (0.4, 0.95))]
        case "Rahu": return [a(-0.55, 0.65, 0.25, 0.2, 2 * p - 0.3) + a(0, -0.1, 0.72, 2.4, 2 * p + 0.75) + a(0.55, 0.65, 0.25, -2.8, 2.9)]
        case "Ketu": return [a(-0.55, -0.65, 0.25, 0, 2 * p - 0.4) + a(0, 0.1, 0.72, 2 * p - 2.4, -0.75, 20) + a(0.55, -0.65, 0.25, 2.8, -2.9)]
        default: return [a(0, 0, 0.5, 0, 2 * p)]
        }
    }

    static func draw(_ planet: String, at centre: CGPoint, radius: CGFloat, in context: GraphicsContext, progress: Double, color: Color, opacity: Double, seed: Double) {
        for (index, stroke) in strokes(for: planet).enumerated() {
            Ink.draw(
                stroke.map { CGPoint(x: centre.x + $0.x * radius, y: centre.y + $0.y * radius) },
                in: context,
                progress: progress,
                style: .init(color: color, opacity: opacity, width: 1.5, wobble: 0.5, overshoot: 0.6, seed: seed + Double(index) * 3)
            )
        }
    }
}
