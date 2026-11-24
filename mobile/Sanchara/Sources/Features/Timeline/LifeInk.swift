import SwiftUI

/// The dasha timeline drawing itself, a row at a time as each comes into view.
/// See docs/design/2026-11-17-signature-motion.md, moment 4.
enum LifeInk {
    static let duration: Double = 2.6
    static let settleAt: Double = 1.8
    static let settleFor: Double = 0.7
    static let barFrom: Double = 0.2
    static let barTo: Double = 1.4

    /// One row's stretch of spine and its node; the running period's node
    /// drops in, hatched in lime, and pulses once.
    static func drawRow(in context: GraphicsContext, size: CGSize, at t: Double, current: Bool, seed: Double) {
        let hand = 1 - Ink.easeInOut(Ink.phase(t, settleAt, settleAt + settleFor))
        let opacity = 1 - Ink.phase(t, settleAt + settleFor * 0.45, settleAt + settleFor)
        let x = size.width / 2
        let node = CGPoint(x: x, y: 17)
        Ink.draw(
            [CGPoint(x: x, y: 0), CGPoint(x: x, y: size.height)], in: context,
            progress: Ink.easeInOut(Ink.phase(t, 0, 0.7)), hand: hand,
            style: .init(color: Theme.fg, opacity: 0.75 * opacity, restOpacity: 0.28 * opacity, wobble: 1.5, overshoot: 0, seed: seed)
        )
        let drop = current ? Ink.easeOut(Ink.phase(t, 0.45, 0.9)) : 1
        let pulse = current ? 1 + 0.28 * sin(Ink.phase(t, 0.9, 1.4) * .pi) : 1
        let centre = CGPoint(x: node.x, y: node.y - CGFloat(1 - drop) * 30)
        let radius = 5 * CGFloat(pulse)

        // The node sits on the line, not behind it.
        let ground = Path(ellipseIn: CGRect(x: centre.x - radius, y: centre.y - radius, width: radius * 2, height: radius * 2))
        context.fill(ground, with: .color(Theme.bg.opacity(Ink.phase(t, 0.2, 0.4) * opacity)))
        if current {
            for k in -2...2 {
                let dx = CGFloat(k) * 2.1
                let dy = max(0, radius * radius - dx * dx).squareRoot()
                Ink.draw(
                    [CGPoint(x: centre.x + dx - 1, y: centre.y - dy), CGPoint(x: centre.x + dx + 1, y: centre.y + dy)], in: context,
                    style: .init(color: Theme.accent, opacity: drop * opacity, width: 1.2, wobble: 0.4, overshoot: 0.3, seed: 70 + Double(k))
                )
            }
        }
        Ink.draw(
            Ink.circle(centre, radius: radius, from: -1.2, steps: 22), in: context,
            progress: current ? 1 : Ink.phase(t, 0.2, 0.65), hand: hand,
            style: .init(color: current ? Theme.accent : Theme.fg, opacity: (current ? drop : 0.85) * opacity, restOpacity: (current ? 1 : 0.6) * opacity, wobble: 0.6, overshoot: 2, seed: seed + 40)
        )
    }

    /// A lime pen stroke along the bar, as far as the period has run.
    static func drawBar(in context: GraphicsContext, size: CGSize, at t: Double, progress: Double) {
        let hand = 1 - Ink.easeInOut(Ink.phase(t, settleAt, settleAt + settleFor))
        let opacity = 1 - Ink.phase(t, settleAt + settleFor * 0.45, settleAt + settleFor)
        let y = size.height / 2
        let run = { (from: CGFloat, to: CGFloat, dy: CGFloat) in [CGPoint(x: from, y: y + dy), CGPoint(x: to, y: y + dy)] }
        Ink.draw(
            run(0, size.width, 0), in: context, progress: Ink.easeInOut(Ink.phase(t, 0, 0.6)), hand: hand,
            style: .init(color: Theme.fg, opacity: 0.35 * opacity, restOpacity: 0.14 * opacity, wobble: 1.2, overshoot: 0, seed: 80)
        )
        let filled = Ink.easeInOut(Ink.phase(t, barFrom, barTo))
        for (index, dy) in [CGFloat(-1.2), 1.2].enumerated() {
            Ink.draw(
                run(0, size.width * CGFloat(min(1, max(0, progress))), dy), in: context, progress: filled, hand: hand,
                style: .init(color: Theme.accent, opacity: opacity, restWidth: 2, width: 2.4, wobble: 1.1, overshoot: 0, seed: 90 + Double(index) * 6)
            )
        }
    }
}

/// `BrutProgressBar`, inked in the first time it is seen in a launch. At rest
/// it is the plain bar.
struct InkedProgressBar: View {
    let progress: Double
    let key: String
    var onPlay: () -> Void = {}

    @State private var rest: Double = 1
    @State private var began: Date?

    var body: some View {
        BrutProgressBar(progress: progress)
            .opacity(rest)
            .overlay {
                if let began {
                    InkCanvas(start: began) { context, size, t in
                        LifeInk.drawBar(in: context, size: size, at: t, progress: progress)
                    }
                }
            }
            .onFirstVisible(1) {
                guard MotionGate.shouldPlay(key, .oncePerLaunch) else { return }
                MotionGate.recordPlayed(key, .oncePerLaunch)
                rest = 0
                began = .now
                onPlay()
                withAnimation(.easeInOut(duration: 0.4).delay(LifeInk.settleAt + 0.2)) { rest = 1 }
                Task {
                    try? await Task.sleep(for: .seconds(LifeInk.duration))
                    began = nil
                }
            }
    }
}
