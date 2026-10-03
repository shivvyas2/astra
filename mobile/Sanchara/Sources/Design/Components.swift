import SwiftUI

// MARK: - Surfaces

/// An outlined block: a one-point line around a faint fill.
///
/// Cards in this look are drawn, not filled — the colour field behind a
/// screen shows through them. `shadow` is accepted and ignored: an earlier,
/// blockier style drew a hard offset shadow, and call sites still say which
/// colour they wanted it.
struct BrutSurface: ViewModifier {
    var fill: Color = Theme.fg.opacity(0.04)
    var line: Color = Theme.line
    var shadow: Color? = nil
    var radius: CGFloat = Theme.cardRadius
    var lineWidth: CGFloat = Theme.lineWidth

    func body(content: Content) -> some View {
        content
            .background {
                ZStack {
                    RoundedRectangle(cornerRadius: radius, style: .continuous)
                        .fill(fill)
                    RoundedRectangle(cornerRadius: radius, style: .continuous)
                        .strokeBorder(line, lineWidth: lineWidth)
                }
            }
    }
}

extension View {
    /// A card: large radius, quiet outline, see-through fill.
    func brutCard(
        fill: Color = Theme.fg.opacity(0.04),
        line: Color = Theme.line,
        shadow: Color? = nil,
        radius: CGFloat = Theme.cardRadius
    ) -> some View {
        modifier(BrutSurface(fill: fill, line: line, shadow: shadow, radius: radius))
    }

    /// A smaller outlined block — rows, tiles, inset panels.
    func brutBordered(
        fill: Color = Theme.fg.opacity(0.04),
        line: Color = Theme.line,
        radius: CGFloat = Theme.cornerRadius,
        lineWidth: CGFloat = Theme.lineWidth
    ) -> some View {
        modifier(BrutSurface(fill: fill, line: line, shadow: nil, radius: radius, lineWidth: lineWidth))
    }
}

/// A one-point rule.
struct BrutDivider: View {
    var color: Color = Theme.rule
    var thickness: CGFloat = 1

    var body: some View {
        Rectangle().fill(color).frame(height: thickness)
    }
}

// MARK: - Atmosphere

/// The colour field behind a screen: the ground, with two soft washes of
/// colour. Static radial gradients, no blur and no animation, so it costs
/// nothing to scroll over.
struct Atmosphere: View {
    enum Mood {
        /// Warm: the Ask tab and anything Vedic.
        case ember
        /// Cool: the timeline and anything Western.
        case violet
        /// The accent: Today.
        case lime
        /// Both washes, quietly: the kundli, the profile, sign-in.
        case dusk
        /// Just the ground.
        case plain
    }

    var mood: Mood = .dusk

    var body: some View {
        ZStack {
            Theme.bg
            if mood != .plain {
                GeometryReader { geo in
                    let side = max(geo.size.width, geo.size.height)
                    ZStack {
                        RadialGradient(
                            colors: [top.opacity(0.34), top.opacity(0)],
                            center: UnitPoint(x: 0.9, y: 0.02),
                            startRadius: 0,
                            endRadius: side * 0.55
                        )
                        RadialGradient(
                            colors: [bottom.opacity(0.22), bottom.opacity(0)],
                            center: UnitPoint(x: 0.0, y: 0.95),
                            startRadius: 0,
                            endRadius: side * 0.5
                        )
                    }
                }
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private var top: Color {
        switch mood {
        case .ember: Theme.ember
        case .violet: Theme.violet
        case .lime: Theme.accent.opacity(0.7)
        case .dusk: Theme.violet
        case .plain: .clear
        }
    }

    private var bottom: Color {
        switch mood {
        case .ember: Theme.violet
        case .violet: Theme.ember
        case .lime: Theme.violet
        case .dusk: Theme.ember
        case .plain: .clear
        }
    }
}

/// A four-point star: the small sparkle beside a headline.
struct Sparkle: Shape {
    func path(in rect: CGRect) -> Path {
        let c = CGPoint(x: rect.midX, y: rect.midY)
        let r = min(rect.width, rect.height) / 2
        let pinch = r * 0.16
        var path = Path()
        path.move(to: CGPoint(x: c.x, y: c.y - r))
        path.addQuadCurve(to: CGPoint(x: c.x + r, y: c.y), control: CGPoint(x: c.x + pinch, y: c.y - pinch))
        path.addQuadCurve(to: CGPoint(x: c.x, y: c.y + r), control: CGPoint(x: c.x + pinch, y: c.y + pinch))
        path.addQuadCurve(to: CGPoint(x: c.x - r, y: c.y), control: CGPoint(x: c.x - pinch, y: c.y + pinch))
        path.addQuadCurve(to: CGPoint(x: c.x, y: c.y - r), control: CGPoint(x: c.x - pinch, y: c.y - pinch))
        path.closeSubpath()
        return path
    }
}

/// A tilted ellipse with a sparkle on it — an orbit. Decoration only.
struct OrbitDecoration: View {
    var color: Color = Theme.fg.opacity(0.35)

    var body: some View {
        GeometryReader { geo in
            ZStack {
                Ellipse()
                    .stroke(color, lineWidth: 1)
                    .frame(width: geo.size.width, height: geo.size.height * 0.62)
                    .rotationEffect(.degrees(-28))
                Sparkle()
                    .fill(Theme.fg)
                    .frame(width: 14, height: 14)
                    .position(x: geo.size.width * 0.86, y: geo.size.height * 0.3)
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

// MARK: - Buttons

/// Press feedback for a pill button: it dips.
struct BrutButtonStyle: ButtonStyle {
    enum Kind {
        /// Bone pill, ink text, an arrow. One per screen: the way forward.
        case primary
        /// Lime pill, ink text, an arrow. The thing to tap right now.
        case accent
        /// Outlined pill, bone text.
        case secondary
        /// Bone text on nothing. "Cancel", "Sign out", a link.
        case quiet
    }

    var kind: Kind = .primary
    var fullWidth = true

    func makeBody(configuration: Configuration) -> some View {
        let pressed = configuration.isPressed
        HStack(spacing: 10) {
            configuration.label
            if kind == .primary || kind == .accent {
                Image(systemName: "arrow.right")
                    .font(.system(size: 13, weight: .semibold))
                    .accessibilityHidden(true)
            }
        }
        .font(.system(size: kind == .quiet ? 14 : 16, weight: .semibold))
        .foregroundStyle(textColor)
        .padding(.horizontal, kind == .quiet ? 4 : 22)
        .frame(maxWidth: fullWidth ? .infinity : nil)
        .frame(minHeight: kind == .quiet ? 36 : 54)
        .background {
            if kind != .quiet {
                Capsule().fill(fill)
                Capsule().strokeBorder(kind == .secondary ? Theme.line : .clear, lineWidth: Theme.lineWidth)
            }
        }
        .contentShape(Capsule())
        .scaleEffect(pressed ? 0.98 : 1)
        .opacity(pressed ? 0.82 : 1)
        .animation(Theme.snap, value: pressed)
    }

    private var fill: Color {
        switch kind {
        case .primary: Theme.fg
        case .accent: Theme.accent
        case .secondary: Theme.fg.opacity(0.04)
        case .quiet: .clear
        }
    }

    private var textColor: Color {
        switch kind {
        case .primary, .accent: Theme.ink
        case .secondary, .quiet: Theme.fg
        }
    }
}

/// The main action on a screen.
struct SancharaPrimaryButton: View {
    let title: String
    var isLoading = false
    var kind: BrutButtonStyle.Kind = .primary
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack {
                Text(title).opacity(isLoading ? 0 : 1)
                if isLoading {
                    ProgressView().tint(kind == .secondary || kind == .quiet ? Theme.fg : Theme.ink)
                }
            }
        }
        .buttonStyle(BrutButtonStyle(kind: kind))
        .disabled(isLoading)
    }
}

/// A lesser action beside a primary one.
struct SancharaSecondaryButton: View {
    let title: String
    let action: () -> Void

    var body: some View {
        Button(title, action: action)
            .buttonStyle(BrutButtonStyle(kind: .secondary))
    }
}

/// A round control with one symbol: the arrow that submits, the cross that
/// closes, the toolbar's buttons.
struct CircleButton: View {
    enum Fill { case accent, bone, outline }

    let systemImage: String
    let label: String
    var fill: Fill = .outline
    var size: CGFloat = 44
    var badge: Int = 0
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: size * 0.36, weight: .semibold))
                .foregroundStyle(fill == .outline ? Theme.fg : Theme.ink)
                .frame(width: size, height: size)
                .background {
                    switch fill {
                    case .accent: Circle().fill(Theme.accent)
                    case .bone: Circle().fill(Theme.fg)
                    case .outline:
                        Circle().fill(Theme.fg.opacity(0.04))
                        Circle().strokeBorder(Theme.line, lineWidth: Theme.lineWidth)
                    }
                }
                .overlay(alignment: .topTrailing) {
                    if badge > 0 {
                        Text(badge > 9 ? "9+" : "\(badge)")
                            .font(.system(size: 10, weight: .bold).monospacedDigit())
                            .foregroundStyle(Theme.ink)
                            .padding(.horizontal, 5)
                            .frame(minWidth: 18, minHeight: 18)
                            .background(Capsule().fill(Theme.accent))
                            .overlay(Capsule().stroke(Theme.bg, lineWidth: 2))
                            .offset(x: 4, y: -4)
                    }
                }
                .contentShape(Circle())
        }
        .buttonStyle(DipButtonStyle())
        .accessibilityLabel(badge > 0 ? "\(label), \(badge) unread" : label)
    }
}

/// The toolbar's buttons. A `CircleButton` under the name the screens use.
struct BrutIconButton: View {
    let systemImage: String
    let label: String
    var tint: Color = Theme.fg
    var badge: Int = 0
    let action: () -> Void

    var body: some View {
        CircleButton(systemImage: systemImage, label: label, fill: .outline, size: 38, badge: badge, action: action)
    }
}

/// Press feedback for anything that is not a pill: a small dip.
struct DipButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.95 : 1)
            .opacity(configuration.isPressed ? 0.8 : 1)
            .animation(Theme.snap, value: configuration.isPressed)
    }
}

// MARK: - Chips and tags

/// A tappable option — a suggested question, a mode.
struct BrutChip: View {
    let text: String
    var active = false
    var color: Color = Theme.fg
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(text)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(active ? Theme.ink : Theme.fg)
                .lineLimit(1)
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                .background {
                    Capsule().fill(active ? color : Theme.fg.opacity(0.04))
                    Capsule().strokeBorder(active ? color : Theme.line, lineWidth: Theme.lineWidth)
                }
                .contentShape(Capsule())
        }
        .buttonStyle(DipButtonStyle())
    }
}

/// A small uppercase label on a flat fill: NOW, MORNING, WARNING.
struct BrutTag: View {
    let text: String
    var fill: Color = Theme.accent
    var textColor: Color = Theme.ink

    var body: some View {
        Text(text)
            .font(.system(size: 10, weight: .bold))
            .textCase(.uppercase)
            .tracking(0.8)
            .foregroundStyle(textColor)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Capsule().fill(fill))
    }
}

/// A numbered pill: "01." beside a step or a section.
struct NumberBadge: View {
    let number: Int
    var fill: Color = Theme.fg

    var body: some View {
        Text(String(format: "%02d.", number))
            .font(.system(size: 17, weight: .semibold).monospacedDigit())
            .foregroundStyle(Theme.ink)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(fill))
            .accessibilityLabel("Step \(number)")
    }
}

// MARK: - Form controls

/// A form field: text over a single line, which brightens when the field has
/// focus. `label` sits above it in the eyebrow style when given.
struct SancharaField: View {
    let placeholder: String
    @Binding var text: String
    var isSecure = false
    var keyboard: UIKeyboardType = .default
    var textContentType: UITextContentType?
    var label: String?

    @FocusState private var isFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let label { Text(label).eyebrow() }
            Group {
                if isSecure {
                    SecureField("", text: $text, prompt: prompt)
                } else {
                    TextField("", text: $text, prompt: prompt)
                }
            }
            .font(.system(size: 17))
            .foregroundStyle(Theme.fg)
            .keyboardType(keyboard)
            .textContentType(textContentType)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .focused($isFocused)
            .padding(.vertical, 10)

            Rectangle()
                .fill(isFocused ? Theme.accent : Theme.line)
                .frame(height: isFocused ? 2 : 1)
                .animation(Theme.snap, value: isFocused)
        }
    }

    private var prompt: Text {
        Text(placeholder).foregroundStyle(Theme.muted.opacity(0.8))
    }
}

/// A password field with a reveal toggle — choosing a password you cannot see
/// is the most common reason a sign-up attempt fails twice.
struct SancharaSecureField: View {
    let placeholder: String
    @Binding var text: String
    var textContentType: UITextContentType? = .password
    var label: String?

    @State private var isRevealed = false
    @FocusState private var isFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let label { Text(label).eyebrow() }
            HStack(spacing: 8) {
                Group {
                    if isRevealed {
                        TextField("", text: $text, prompt: prompt)
                    } else {
                        SecureField("", text: $text, prompt: prompt)
                    }
                }
                .font(.system(size: 17))
                .foregroundStyle(Theme.fg)
                .textContentType(textContentType)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .focused($isFocused)

                Button {
                    isRevealed.toggle()
                } label: {
                    Image(systemName: isRevealed ? "eye.slash" : "eye")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(Theme.muted)
                        .frame(width: 32, height: 32)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel(isRevealed ? "Hide password" : "Show password")
            }
            .padding(.vertical, 4)

            Rectangle()
                .fill(isFocused ? Theme.accent : Theme.line)
                .frame(height: isFocused ? 2 : 1)
                .animation(Theme.snap, value: isFocused)
        }
    }

    private var prompt: Text {
        Text(placeholder).foregroundStyle(Theme.muted.opacity(0.8))
    }
}

/// Two to four options as words on a line, the chosen one underlined.
struct BrutSegmented<Option: Hashable>: View {
    let options: [(Option, String)]
    @Binding var selection: Option
    var activeFill: Color = Theme.accent

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(options.enumerated()), id: \.offset) { _, option in
                let active = option.0 == selection
                Button {
                    withAnimation(Theme.snap) { selection = option.0 }
                } label: {
                    VStack(spacing: 10) {
                        Text(option.1)
                            .font(.system(size: 14, weight: active ? .semibold : .regular))
                            .foregroundStyle(active ? Theme.fg : Theme.muted)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                        Rectangle()
                            .fill(active ? activeFill : .clear)
                            .frame(height: 2)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 8)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(active ? .isSelected : [])
            }
        }
        .overlay(alignment: .bottom) {
            Rectangle().fill(Theme.rule).frame(height: 1)
        }
    }
}

/// A thin progress line with a marker where it has got to.
struct BrutProgressBar: View {
    let progress: Double
    var tint: Color = Theme.accent
    var height: CGFloat = 4

    var body: some View {
        GeometryReader { geo in
            let clamped = CGFloat(max(0, min(1, progress)))
            let width: CGFloat = clamped * geo.size.width
            let knob: CGFloat = height + 8
            let knobX: CGFloat = max(0, min(width - knob / 2, geo.size.width - knob))
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.rule).frame(height: height)
                Capsule().fill(tint).frame(width: max(width, height), height: height)
                Circle()
                    .fill(Theme.bg)
                    .overlay(Circle().stroke(tint, lineWidth: 2))
                    .frame(width: knob, height: knob)
                    .offset(x: knobX)
            }
            .frame(height: knob)
        }
        .frame(height: height + 8)
    }
}

// MARK: - Data

/// A small label on the left, a large value on the right, a rule beneath.
/// The row a fact is shown in: "Mahadasha … Venus", "Lagna … Vrishchika".
struct DataRow: View {
    let label: String
    let value: String
    /// A small note under the value: a date, a degree, a caption.
    var detail: String?
    var valueSize: CGFloat = 26
    var valueColor: Color = Theme.fg
    var showsRule = true

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 16) {
                Text(label)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.muted)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 3) {
                    Text(value)
                        .font(.brutDisplay(valueSize))
                        .tracking(-valueSize * 0.03)
                        .foregroundStyle(valueColor)
                        .multilineTextAlignment(.trailing)
                        .lineLimit(2)
                        .minimumScaleFactor(0.7)
                    if let detail {
                        Text(detail)
                            .font(.brutMono(11))
                            .foregroundStyle(Theme.muted)
                    }
                }
            }
            .padding(.vertical, 16)
            if showsRule { BrutDivider() }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(detail.map { "\(label), \(value), \($0)" } ?? "\(label), \(value)")
    }
}

// MARK: - Screen furniture

/// The top of every screen: a small label, one large phrase, and a sentence
/// saying what the screen is for.
///
/// The sentence is not decoration. People were opening the app and not
/// knowing what any of it was for; this is the screen explaining itself
/// before anything is tapped.
struct ScreenHeader: View {
    let eyebrow: String
    let title: String
    let blurb: String
    var accent: Color = Theme.accent
    var titleSize: CGFloat = 40

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Circle().fill(accent).frame(width: 7, height: 7)
                Text(eyebrow)
                    .font(.system(size: 11, weight: .semibold))
                    .textCase(.uppercase)
                    .tracking(1.4)
                    .foregroundStyle(accent)
                Spacer(minLength: 0)
                Sparkle()
                    .fill(Theme.fg.opacity(0.9))
                    .frame(width: 16, height: 16)
                    .accessibilityHidden(true)
            }
            Text(title)
                .brutHeading(titleSize)
                .fixedSize(horizontal: false, vertical: true)
            Text(blurb)
                .font(.brutBody(15))
                .foregroundStyle(Theme.muted)
                .lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// Nothing here yet: an outlined card with an orbit, saying what will appear.
struct BrutEmptyState: View {
    let title: String
    let message: String
    var systemImage: String = "sparkles"

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Image(systemName: systemImage)
                .font(.system(size: 20, weight: .medium))
                .foregroundStyle(Theme.accent)
            Text(title)
                .font(.brutTitle(20))
                .foregroundStyle(Theme.fg)
            Text(message)
                .font(.brutBody(14))
                .foregroundStyle(Theme.muted)
                .lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .topTrailing) {
            OrbitDecoration(color: Theme.fg.opacity(0.22))
                .frame(width: 96, height: 96)
                .offset(x: 14, y: -18)
                .clipped()
        }
        .brutCard()
    }
}

/// An inline notice: an error, or a confirmation.
struct BrutNotice: View {
    enum Tone { case error, info }
    let text: String
    var tone: Tone = .error

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: tone == .error ? "exclamationmark.circle.fill" : "info.circle.fill")
                .font(.system(size: 14))
                .foregroundStyle(tone == .error ? Theme.ember : Theme.accent)
            Text(text)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Theme.fg)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .brutBordered(
            fill: (tone == .error ? Theme.ember : Theme.accent).opacity(0.10),
            line: (tone == .error ? Theme.ember : Theme.accent).opacity(0.55)
        )
    }
}
