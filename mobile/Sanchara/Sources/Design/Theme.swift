import SwiftUI

/// The Sanchara design tokens, translated verbatim from `app/globals.css`.
///
/// The web app defines exactly four colours on `:root`. Keeping these in one
/// place — and matching the hex values exactly — is what makes the native app
/// read as the same product as the site.
enum Theme {
    /// `--bg: #0a0a0b`
    static let bg = Color(hex: 0x0A0A0B)
    /// `--fg: #f4f1ea`
    static let fg = Color(hex: 0xF4F1EA)
    /// `--muted: #9a978f`
    static let muted = Color(hex: 0x9A978F)
    /// `--accent: #e8663d`
    static let accent = Color(hex: 0xE8663D)

    /// Tailwind `border-white/10`, used for every hairline on the site.
    static let hairline = Color.white.opacity(0.10)
    /// Tailwind `bg-white/[0.04]`, the fill behind form controls.
    static let fieldFill = Color.white.opacity(0.04)
    /// Tailwind `rounded-lg` is 0.5rem.
    static let cornerRadius: CGFloat = 8

    /// The kundli's rule lines. Heavier than `hairline` because the diagram is
    /// the content here rather than a divider between things: at 0.10 white the
    /// square all but vanished on an OLED screen in daylight.
    static let chartLine = Color.white.opacity(0.22)

    /// The site's easing: `cubic-bezier(0.22, 1, 0.36, 1)`.
    static let ease = Animation.timingCurve(0.22, 1, 0.36, 1, duration: 0.6)
}

extension Color {
    /// Builds a colour from a 24-bit RGB literal, so tokens can be written the
    /// same way they appear in CSS.
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: 1
        )
    }
}

extension Text {
    /// The site's eyebrow style: `text-xs uppercase tracking-[0.3em] text-muted`.
    func eyebrow() -> some View {
        self.font(.system(size: 12, weight: .regular))
            .textCase(.uppercase)
            .tracking(3.6) // 0.3em at 12pt
            .foregroundStyle(Theme.muted)
    }
}
