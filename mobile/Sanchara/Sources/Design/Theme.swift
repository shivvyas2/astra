import SwiftUI
import UIKit

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
    /// `--muted: #9a978f`. Lifted to `#b8b5ad` under Increase Contrast.
    static let muted = Color(hex: 0x9A978F, increased: 0xB8B5AD)
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
    /// Under Increase Contrast it clears 3:1 against the ground.
    static let line = Color(hex: 0xF4F1EA, opacity: 0.28, increased: 0.55)
    /// The same line when it has to be noticed: a focused field, a selection.
    static let lineStrong = fg
    /// A row separator inside a card or a table.
    static let rule = Color(hex: 0xF4F1EA, opacity: 0.14, increased: 0.4)
    /// Kept for callers that predate the revamp; reads as `rule`.
    static let hairline = rule
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

    /// The site's easing: `cubic-bezier(0.22, 1, 0.36, 1)`. Nil under Reduce
    /// Motion, so the change lands without moving.
    static var ease: Animation? {
        reducesMotion ? nil : .timingCurve(0.22, 1, 0.36, 1, duration: 0.6)
    }
    /// Button presses and toggles: quick, nothing springy. Nil under Reduce
    /// Motion.
    static var snap: Animation? {
        reducesMotion ? nil : .easeOut(duration: 0.14)
    }
    /// Any other timing, dropped under Reduce Motion the same way.
    static func motion(_ animation: Animation) -> Animation? {
        reducesMotion ? nil : animation
    }

    /// Settings › Accessibility in the app. Each switch adds to the matching
    /// iOS setting; neither can turn the other off.
    enum Accessibility {
        static let textSizeKey = "a11y.textSize"
        static let reduceMotionKey = "a11y.reduceMotion"
        static let increaseContrastKey = "a11y.increaseContrast"
        static let shapeCuesKey = "a11y.differentiateWithoutColor"
    }

    /// Reduce Motion from iOS or the app. Read here rather than from the
    /// environment because `withAnimation` runs in actions, outside `body`.
    static var reducesMotion: Bool {
        UIAccessibility.isReduceMotionEnabled
            || UserDefaults.standard.bool(forKey: Accessibility.reduceMotionKey)
    }
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

    /// A token with a stronger value under Increase Contrast. SwiftUI resolves
    /// it against the view's `colorSchemeContrast`, which the app root sets
    /// from iOS or from Settings › Accessibility.
    init(hex: UInt32, increased: UInt32) {
        self.init(uiColor: UIColor { traits in
            UIColor(Color(hex: traits.accessibilityContrast == .high ? increased : hex))
        })
    }

    /// The same, for a translucent line whose opacity rises.
    init(hex: UInt32, opacity: Double, increased: Double) {
        self.init(uiColor: UIColor { traits in
            UIColor(Color(hex: hex).opacity(traits.accessibilityContrast == .high ? increased : opacity))
        })
    }
}

// MARK: - Type

/// A face set at a design size that follows the reader's text size.
///
/// At the default text size this is exactly `.system(size:weight:)`, so every
/// screen looks the way it was drawn. A larger size, chosen in iOS or in
/// Settings › Accessibility here, scales it along the curve of the text style
/// nearest its size. Display sizes stop at a ceiling so one huge word cannot
/// push a screen apart; body sizes keep growing well past double.
///
/// `View.font(_:)` below takes one of these, so call sites read the same as
/// they did when these were plain `Font`s: `.font(.brutBody(15))`.
struct BrutFont: Equatable {
    var size: CGFloat
    var weight: Font.Weight = .regular
    var monospacedDigits = false
    var isItalic = false

    /// Any size and weight, for the places that are not one of the named roles.
    static func scaled(size: CGFloat, weight: Font.Weight = .regular) -> BrutFont {
        BrutFont(size: size, weight: weight)
    }

    /// The one large word or phrase a screen is about. Medium weight, set
    /// tight; size does the work that weight did in the blockier style.
    static func brutDisplay(_ size: CGFloat = 44) -> BrutFont {
        BrutFont(size: size, weight: .medium)
    }

    /// Section and card titles.
    static func brutTitle(_ size: CGFloat = 20) -> BrutFont {
        BrutFont(size: size, weight: .semibold)
    }

    /// Labels, dates, degrees, counts. The text face with tabular digits, so
    /// columns of numbers line up without switching typeface.
    static func brutMono(_ size: CGFloat = 11, weight: Font.Weight = .medium) -> BrutFont {
        BrutFont(size: size, weight: weight, monospacedDigits: true)
    }

    /// An oversized figure: a percentage, a day of the month, a count. Light
    /// weight with tabular digits — at this size weight would shout, and the
    /// digits have to sit still when the number changes.
    static func brutNumeral(_ size: CGFloat = 64) -> BrutFont {
        BrutFont(size: size, weight: .light, monospacedDigits: true)
    }

    /// Body copy.
    static func brutBody(_ size: CGFloat = 15) -> BrutFont {
        BrutFont(size: size, weight: .regular)
    }

    func monospacedDigit() -> BrutFont {
        var font = self
        font.monospacedDigits = true
        return font
    }

    func italic() -> BrutFont {
        var font = self
        font.isItalic = true
        return font
    }

    func weight(_ weight: Font.Weight) -> BrutFont {
        var font = self
        font.weight = weight
        return font
    }

    /// The text style whose growth curve this size follows.
    var textStyle: UIFont.TextStyle {
        switch size {
        case ..<12.5: .caption1
        case ..<14.5: .footnote
        case ..<16: .subheadline
        case ..<18.5: .body
        case ..<21: .title3
        case ..<25: .title2
        case ..<31: .title1
        default: .largeTitle
        }
    }

    /// The largest text size this follows. Numerals and display words are
    /// already big, so they stop early; reading text goes to Accessibility 3,
    /// more than twice its drawn size.
    var ceiling: DynamicTypeSize {
        switch size {
        case 31...: .xxxLarge
        case 21...: .accessibility1
        default: .accessibility3
        }
    }

    /// The point size at a given text size.
    func pointSize(at typeSize: DynamicTypeSize) -> CGFloat {
        let traits = UITraitCollection(preferredContentSizeCategory: UIContentSizeCategory(min(typeSize, ceiling)))
        return UIFontMetrics(forTextStyle: textStyle).scaledValue(for: size, compatibleWith: traits)
    }

    func font(at typeSize: DynamicTypeSize) -> Font {
        var font = Font.system(size: pointSize(at: typeSize), weight: weight)
        if monospacedDigits { font = font.monospacedDigit() }
        if isItalic { font = font.italic() }
        return font
    }
}

private struct BrutFontModifier: ViewModifier {
    @Environment(\.dynamicTypeSize) private var typeSize
    let font: BrutFont

    func body(content: Content) -> some View {
        content.font(font.font(at: typeSize))
    }
}

extension View {
    /// Sets a `BrutFont`, resolved against the current text size.
    func font(_ font: BrutFont) -> some View {
        modifier(BrutFontModifier(font: font))
    }
}

extension Text {
    /// The eyebrow: small, uppercase, tracked, muted. Sits above a title or
    /// labels a block.
    func eyebrow() -> some View {
        self.font(.scaled(size: 13, weight: .medium))
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
