import SwiftUI

/// The Sanchara design tokens, kept in step with `app/globals.css`.
///
/// The look is neo-brutalist on a dark ground: flat fills, borders drawn in
/// bone at full strength, hard offset shadows with no blur, square-ish corners,
/// heavy headings and monospaced labels. There are no gradients and nothing is
/// blurred — partly for the look, and partly because the blurred, animated
/// glows the app used to draw were the main reason the transcript stuttered
/// while a reading streamed in.
///
/// Four of these (`bg`, `fg`, `muted`, `accent`) are asserted against the CSS
/// in `ThemeTests`, so a careless edit here fails the build rather than
/// quietly drifting from the site.
enum Theme {
    /// `--bg: #0a0a0b` — the ground. Also the launch colour.
    static let bg = Color(hex: 0x0A0A0B)
    /// `--surface: #151518` — cards, fields, and anything that sits on the ground.
    static let surface = Color(hex: 0x151518)
    /// `--surface-raised: #1d1d21` — a card on a card.
    static let surfaceRaised = Color(hex: 0x1D1D21)
    /// `--fg: #f4f1ea` — bone. Text, and every border.
    static let fg = Color(hex: 0xF4F1EA)
    /// `--muted: #9a978f`
    static let muted = Color(hex: 0x9A978F)
    /// `--accent: #ff6b3d` — hot orange. Vedic, primary actions, the lagna.
    static let accent = Color(hex: 0xFF6B3D)
    /// `--violet: #7c6cff` — Western.
    static let violet = Color(hex: 0x7C6CFF)
    /// `--yellow: #ffd23f` — numerology, and the "In simple words" callout.
    static let yellow = Color(hex: 0xFFD23F)
    /// Text on a bright flat fill (accent, yellow, bone). Same value as `bg`.
    static let ink = Color(hex: 0x0A0A0B)

    /// Every border. Bone, full strength, `lineWidth` thick.
    static let line = fg
    /// A row separator inside a card — the one place a border is allowed to
    /// be quiet.
    static let rule = fg.opacity(0.22)
    /// Kept for callers that predate the revamp; reads as `rule`.
    static let hairline = fg.opacity(0.22)
    /// Kept for callers that predate the revamp; reads as `surface`.
    static let fieldFill = surface

    /// `--radius: 4px`. Square enough to read as a block, not a pill.
    static let cornerRadius: CGFloat = 4
    /// Border thickness, everywhere.
    static let lineWidth: CGFloat = 2
    /// The hard shadow's offset, right and down. Never blurred.
    static let shadowOffset: CGFloat = 4

    /// The kundli's rule lines. The diagram is content, so it gets a real line.
    static let chartLine = fg.opacity(0.7)

    /// The site's easing: `cubic-bezier(0.22, 1, 0.36, 1)`.
    static let ease = Animation.timingCurve(0.22, 1, 0.36, 1, duration: 0.6)
    /// Button presses and toggles: quick and flat, nothing springy.
    static let snap = Animation.easeOut(duration: 0.12)
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
    /// Screen titles. Black weight, tight.
    static func brutDisplay(_ size: CGFloat = 32) -> Font {
        .system(size: size, weight: .black)
    }

    /// Section and card titles.
    static func brutTitle(_ size: CGFloat = 20) -> Font {
        .system(size: size, weight: .heavy)
    }

    /// Labels, eyebrows, numbers, dates. Monospaced so columns line up and
    /// data reads as data.
    static func brutMono(_ size: CGFloat = 11, weight: Font.Weight = .semibold) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }

    /// Body copy.
    static func brutBody(_ size: CGFloat = 15) -> Font {
        .system(size: size, weight: .regular)
    }
}

extension Text {
    /// The eyebrow: monospaced, uppercase, tracked, muted. Sits above a title
    /// or labels a block.
    func eyebrow() -> some View {
        self.font(.brutMono(11))
            .textCase(.uppercase)
            .tracking(1.6)
            .foregroundStyle(Theme.muted)
    }

    /// A screen title.
    func brutHeading(_ size: CGFloat = 32) -> some View {
        self.font(.brutDisplay(size))
            .tracking(-0.8)
            .foregroundStyle(Theme.fg)
    }
}
