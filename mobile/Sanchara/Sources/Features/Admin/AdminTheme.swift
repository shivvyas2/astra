import SwiftUI

/// The admin area's own palette: a light, warm-grey dashboard inside a dark
/// graphite frame, with the app's lime as the one highlight.
///
/// Everything else in Astrya is dark. The admin screens are a working tool
/// the owner looks at for numbers, so they get a calm light canvas instead,
/// and only inside the full-screen cover (`AdminRootView`) — nothing here
/// leaks into the rest of the app.
///
/// Muted text is darker than it looks in the reference so small labels still
/// clear 4.5:1 on both the canvas and a panel.
enum AdminTheme {
    /// The graphite frame the canvas sits in.
    static let frame = Color(hex: 0x2C2C2A)
    /// An unselected pill sitting on the frame.
    static let frameRaised = Color(hex: 0x41403D)
    /// The warm-grey canvas.
    static let canvas = Color(hex: 0xE7E5E0)
    /// A panel on the canvas.
    static let panel = Color(hex: 0xF1F0EC)
    /// The selected pill, a raised card, the search field.
    static let raised = Color.white
    /// Text and dark marks.
    static let ink = Color(hex: 0x1D1D1B)
    /// Secondary text.
    static let inkSoft = Color(hex: 0x45443F)
    /// Labels. 4.6:1 on the canvas, 5.1:1 on a panel.
    static let muted = Color(hex: 0x66645E)
    /// Decorative marks only — never text.
    static let faint = Color(hex: 0xA9A69F)
    /// Thin connector lines and outlines.
    static let line = Color(hex: 0xBDBAB2)
    /// Row separators inside a panel.
    static let rule = Color(hex: 0xDAD7D0)
    /// The highlight: nodes, badges, the hit-rate ring. Same lime as the app.
    static let lime = Color(hex: 0xDFEE6B)
    /// A warm mark for things that went the other way.
    static let warm = Color(hex: 0xD9603B)
    /// Text sitting on the frame.
    static let onFrame = Color(hex: 0xF1F0EC)
    static let onFrameMuted = Color(hex: 0xB4B1A9)

    /// Panels and cards.
    static let panelRadius: CGFloat = 24
    /// The canvas's top corners.
    static let canvasRadius: CGFloat = 28
    /// The canvas's bottom corners, close to the screen's own.
    static let canvasBottomRadius: CGFloat = 44
    /// Thin lines, everywhere.
    static let hairline: CGFloat = 1
}

// MARK: - Type

extension Font {
    /// A large, light figure on a stat card: "1,204".
    static func adminNumber(_ size: CGFloat = 30) -> Font {
        .system(size: size, weight: .light).monospacedDigit()
    }

    /// A screen or panel title, light and large like the reference's "Cardiology".
    static func adminTitle(_ size: CGFloat = 28) -> Font {
        .system(size: size, weight: .light)
    }

    /// The small grey label over a number. Scales with Dynamic Type from a
    /// small base.
    static var adminLabel: Font { .caption2.weight(.medium) }
}

extension View {
    /// A lighter rounded panel on the canvas.
    func adminPanel(_ fill: Color = AdminTheme.panel, radius: CGFloat = AdminTheme.panelRadius) -> some View {
        background(RoundedRectangle(cornerRadius: radius, style: .continuous).fill(fill))
    }
}
