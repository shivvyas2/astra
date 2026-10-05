import SwiftUI

/// The Astrya design tokens, kept in step with `app/globals.css`.
///
/// The look comes from three references: an astrology app set in huge light
/// type over soft colour fields with a lime accent, a Swiss-style data app of
/// oversized numerals, hairline tables and round arrow buttons, and a
/// monochrome sign-up flow of bold headlines over underlined fields. What they
/// share is what this file encodes: one very large word per screen, small
/// quiet labels beside large values, structure drawn with a one-point line
/// rather than a filled box, round controls, and a single vivid accent on a
/// near-black ground.
///
/// Nothing is blurred and nothing animates for ever. The colour fields are
/// plain radial gradients, which cost the GPU nothing while a reading streams.
///
/// The colour tokens are asserted against the CSS in `ThemeTests`, so a
/// careless edit here fails the build rather than quietly drifting from the
/// site.
enum Theme {
    /// `--bg: #0a0a0b` — the ground. Also the launch colour.
    static let bg = Color(hex: 0x0A0A0B)
    /// `--surface: #151518` — a filled card, where a card needs a fill.
    static let surface = Color(hex: 0x151518)
    /// `--surface-raised: #1d1d21` — a card on a card.
    static let surfaceRaised = Color(hex: 0x1D1D21)
    /// `--fg: #f4f1ea` — bone. Text, and the fill of the main button.
    static let fg = Color(hex: 0xF4F1EA)
    /// `--muted: #9a978f`
    static let muted = Color(hex: 0x9A978F)
    /// `--accent: #dfee6b` — lime. The one vivid colour: the word a screen is
    /// about, the selected tab, the thing to tap.
    static let accent = Color(hex: 0xDFEE6B)
    /// `--ember: #ff6b3d` — warm. Vedic, warnings, and the warm colour field.
    static let ember = Color(hex: 0xFF6B3D)
    /// `--violet: #7c6cff` — cool. Western, the timeline, the cool colour field.
    static let violet = Color(hex: 0x7C6CFF)
    /// Text on a bright fill (lime, bone, ember). Same value as `bg`.
    static let ink = Color(hex: 0x0A0A0B)

    /// Older call sites say `yellow` for the highlight colour; it is the accent.
    static let yellow = accent

    /// Outlines: cards, chips, fields at rest. A quiet line, one point thick.
    static let line = fg.opacity(0.28)
    /// The same line when it has to be noticed: a focused field, a selection.
    static let lineStrong = fg
    /// A row separator inside a card or a table.
    static let rule = fg.opacity(0.14)
    /// Kept for callers that predate the revamp; reads as `rule`.
    static let hairline = fg.opacity(0.14)
    /// Kept for callers that predate the revamp; reads as `surface`.
    static let fieldFill = surface

    /// Small blocks: fields, rows, tiles.
    static let cornerRadius: CGFloat = 14
    /// Cards.
    static let cardRadius: CGFloat = 24
    /// Line thickness, everywhere.
    static let lineWidth: CGFloat = 1
    /// There are no offset shadows in this look. Kept at zero so layout code
    /// written against the earlier, blockier style still measures correctly.
    static let shadowOffset: CGFloat = 0

    /// The kundli's rule lines. The diagram is content, so it gets a real line.
    static let chartLine = fg.opacity(0.55)

    /// The site's easing: `cubic-bezier(0.22, 1, 0.36, 1)`.
    static let ease = Animation.timingCurve(0.22, 1, 0.36, 1, duration: 0.6)
    /// Button presses and toggles: quick, nothing springy.
    static let snap = Animation.easeOut(duration: 0.14)
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

// MARK: - Type

extension Font {
    /// The one large word or phrase a screen is about. Medium weight, set
    /// tight; size does the work that weight did in the blockier style.
    static func brutDisplay(_ size: CGFloat = 44) -> Font {
        .system(size: size, weight: .medium)
    }

    /// Section and card titles.
    static func brutTitle(_ size: CGFloat = 20) -> Font {
        .system(size: size, weight: .semibold)
    }

    /// Labels, dates, degrees, counts. The text face with tabular digits, so
    /// columns of numbers line up without switching typeface.
    static func brutMono(_ size: CGFloat = 11, weight: Font.Weight = .medium) -> Font {
        .system(size: size, weight: weight).monospacedDigit()
    }

    /// An oversized figure: a percentage, a day of the month, a count. Light
    /// weight with tabular digits — at this size weight would shout, and the
    /// digits have to sit still when the number changes.
    static func brutNumeral(_ size: CGFloat = 64) -> Font {
        .system(size: size, weight: .light).monospacedDigit()
    }

    /// Body copy.
    static func brutBody(_ size: CGFloat = 15) -> Font {
        .system(size: size, weight: .regular)
    }
}

extension Text {
    /// The eyebrow: small, uppercase, tracked, muted. Sits above a title or
    /// labels a block.
    func eyebrow() -> some View {
        self.font(.system(size: 11, weight: .semibold))
            .textCase(.uppercase)
            .tracking(1.4)
            .foregroundStyle(Theme.muted)
    }

    /// Ends a headline with a diagonal arrow in the accent: "Your life ↘".
    /// Returns `Text`, so it chains into `brutHeading` like any title.
    func headlineArrow(_ color: Color = Theme.accent) -> Text {
        self + Text("\u{00A0}\u{2198}").foregroundStyle(color)
    }

    /// A screen's large word. Tracking tightens with size, the way display
    /// type is set.
    func brutHeading(_ size: CGFloat = 40) -> some View {
        self.font(.brutDisplay(size))
            .tracking(-size * 0.035)
            .foregroundStyle(Theme.fg)
    }
}
