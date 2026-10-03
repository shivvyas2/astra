import SwiftUI

// MARK: - Surfaces

/// A flat block with a bone border and a hard shadow offset right and down.
///
/// This is the one shape the whole app is built from. The shadow is a second
/// rectangle, not a `shadow()` modifier: it is never blurred, and it leaves
/// room for itself so neighbours in a stack are not overlapped.
struct BrutSurface: ViewModifier {
    var fill: Color = Theme.surface
    var line: Color = Theme.line
    /// `nil` draws no shadow — for rows and fields, which sit flush.
    var shadow: Color? = Theme.line
    var radius: CGFloat = Theme.cornerRadius
    var lineWidth: CGFloat = Theme.lineWidth
    var offset: CGFloat = Theme.shadowOffset

    func body(content: Content) -> some View {
        content
            .background {
                ZStack {
                    if let shadow {
                        RoundedRectangle(cornerRadius: radius, style: .continuous)
                            .fill(shadow)
                            .offset(x: offset, y: offset)
                    }
                    RoundedRectangle(cornerRadius: radius, style: .continuous)
                        .fill(fill)
                    RoundedRectangle(cornerRadius: radius, style: .continuous)
                        .strokeBorder(line, lineWidth: lineWidth)
                }
            }
            .padding(.trailing, shadow == nil ? 0 : offset)
            .padding(.bottom, shadow == nil ? 0 : offset)
    }
}

extension View {
    /// A card: surface fill, bone border, hard shadow.
    func brutCard(
        fill: Color = Theme.surface,
        line: Color = Theme.line,
        shadow: Color? = Theme.line,
        radius: CGFloat = Theme.cornerRadius
    ) -> some View {
        modifier(BrutSurface(fill: fill, line: line, shadow: shadow, radius: radius))
    }

    /// A bordered block with no shadow — fields, list rows, inset panels.
    func brutBordered(
        fill: Color = Theme.surface,
        line: Color = Theme.line,
        radius: CGFloat = Theme.cornerRadius,
        lineWidth: CGFloat = Theme.lineWidth
    ) -> some View {
        modifier(BrutSurface(fill: fill, line: line, shadow: nil, radius: radius, lineWidth: lineWidth))
    }
}

/// A 2pt rule.
struct BrutDivider: View {
    var color: Color = Theme.line
    var thickness: CGFloat = Theme.lineWidth

    var body: some View {
        Rectangle().fill(color).frame(height: thickness)
    }
}

// MARK: - Buttons

/// Press feedback for a block button: it drops onto its own shadow.
struct BrutButtonStyle: ButtonStyle {
    enum Kind {
        /// Bone fill, ink text, accent shadow. One per screen.
        case primary
        /// Accent fill, ink text, bone shadow. The thing to tap right now.
        case accent
        /// Surface fill, bone text, bone shadow.
        case secondary
        /// Bone text on nothing, bordered. For "Cancel" and the like.
        case quiet
    }

    var kind: Kind = .primary
    var fullWidth = true

    func makeBody(configuration: Configuration) -> some View {
        let pressed = configuration.isPressed
        configuration.label
            .font(.system(size: 15, weight: .bold))
            .foregroundStyle(textColor)
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .frame(maxWidth: fullWidth ? .infinity : nil)
            .background {
                ZStack {
                    RoundedRectangle(cornerRadius: Theme.cornerRadius, style: .continuous)
                        .fill(shadowColor)
                        .offset(
                            x: pressed ? 0 : Theme.shadowOffset,
                            y: pressed ? 0 : Theme.shadowOffset
                        )
                    RoundedRectangle(cornerRadius: Theme.cornerRadius, style: .continuous)
                        .fill(fill)
                    RoundedRectangle(cornerRadius: Theme.cornerRadius, style: .continuous)
                        .strokeBorder(Theme.line, lineWidth: Theme.lineWidth)
                }
            }
            .offset(x: pressed ? Theme.shadowOffset : 0, y: pressed ? Theme.shadowOffset : 0)
            .padding(.trailing, Theme.shadowOffset)
            .padding(.bottom, Theme.shadowOffset)
            .animation(Theme.snap, value: pressed)
    }

    private var fill: Color {
        switch kind {
        case .primary: Theme.fg
        case .accent: Theme.accent
        case .secondary: Theme.surface
        case .quiet: .clear
        }
    }

    private var textColor: Color {
        switch kind {
        case .primary, .accent: Theme.ink
        case .secondary, .quiet: Theme.fg
        }
    }

    private var shadowColor: Color {
        switch kind {
        case .primary: Theme.accent
        case .accent, .secondary: Theme.line
        case .quiet: .clear
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

/// A small square control — the toolbar's buttons.
struct BrutIconButton: View {
    let systemImage: String
    let label: String
    var tint: Color = Theme.fg
    var badge: Int = 0
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(tint)
                .frame(width: 36, height: 36)
                .brutBordered()
                .overlay(alignment: .topTrailing) {
                    if badge > 0 {
                        Text(badge > 9 ? "9+" : "\(badge)")
                            .font(.brutMono(9, weight: .bold))
                            .foregroundStyle(Theme.ink)
                            .padding(.horizontal, 4)
                            .padding(.vertical, 1)
                            .background(Theme.accent)
                            .overlay(Rectangle().stroke(Theme.ink, lineWidth: 1.5))
                            .offset(x: 6, y: -6)
                    }
                }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(badge > 0 ? "\(label), \(badge) unread" : label)
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
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(active ? Theme.ink : Theme.fg)
                .lineLimit(1)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .brutBordered(fill: active ? color : Theme.surface, line: active ? color : Theme.line)
        }
        .buttonStyle(.plain)
    }
}

/// A tiny uppercase label on a flat fill: NOW, MORNING, WARNING.
struct BrutTag: View {
    let text: String
    var fill: Color = Theme.accent
    var textColor: Color = Theme.ink

    var body: some View {
        Text(text)
            .font(.brutMono(9, weight: .bold))
            .textCase(.uppercase)
            .tracking(1)
            .foregroundStyle(textColor)
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(fill)
            .overlay(Rectangle().stroke(Theme.line, lineWidth: 1.5))
    }
}

// MARK: - Form controls

/// Form field: surface fill, bone border, no shadow.
struct SancharaField: View {
    let placeholder: String
    @Binding var text: String
    var isSecure = false
    var keyboard: UIKeyboardType = .default
    var textContentType: UITextContentType?

    var body: some View {
        Group {
            if isSecure {
                SecureField("", text: $text, prompt: prompt)
            } else {
                TextField("", text: $text, prompt: prompt)
            }
        }
        .font(.system(size: 16))
        .foregroundStyle(Theme.fg)
        .keyboardType(keyboard)
        .textContentType(textContentType)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .padding(.horizontal, 12)
        .padding(.vertical, 14)
        .brutBordered()
    }

    private var prompt: Text {
        Text(placeholder).foregroundStyle(Theme.muted)
    }
}

/// A password field with a reveal toggle — choosing a password you cannot see
/// is the most common reason a sign-up attempt fails twice.
struct SancharaSecureField: View {
    let placeholder: String
    @Binding var text: String
    var textContentType: UITextContentType? = .password
    @State private var isRevealed = false

    var body: some View {
        HStack(spacing: 8) {
            Group {
                if isRevealed {
                    TextField("", text: $text, prompt: prompt)
                } else {
                    SecureField("", text: $text, prompt: prompt)
                }
            }
            .font(.system(size: 16))
            .foregroundStyle(Theme.fg)
            .textContentType(textContentType)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()

            Button {
                isRevealed.toggle()
            } label: {
                Image(systemName: isRevealed ? "eye.slash" : "eye")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(Theme.muted)
            }
            .accessibilityLabel(isRevealed ? "Hide password" : "Show password")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 14)
        .brutBordered()
    }

    private var prompt: Text {
        Text(placeholder).foregroundStyle(Theme.muted)
    }
}

/// Two to four options side by side, the chosen one filled.
struct BrutSegmented<Option: Hashable>: View {
    let options: [(Option, String)]
    @Binding var selection: Option
    var activeFill: Color = Theme.fg

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(options.enumerated()), id: \.offset) { index, option in
                let active = option.0 == selection
                Button {
                    withAnimation(Theme.snap) { selection = option.0 }
                } label: {
                    Text(option.1)
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(active ? Theme.ink : Theme.fg)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(active ? activeFill : Theme.surface)
                }
                .buttonStyle(.plain)
                if index < options.count - 1 {
                    Rectangle().fill(Theme.line).frame(width: Theme.lineWidth)
                }
            }
        }
        .brutBordered(fill: Theme.surface)
    }
}

/// A thick progress bar with a border.
struct BrutProgressBar: View {
    let progress: Double
    var tint: Color = Theme.accent
    var height: CGFloat = 10

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Rectangle().fill(Theme.bg)
                Rectangle()
                    .fill(tint)
                    .frame(width: max(0, min(1, progress)) * geo.size.width)
            }
        }
        .frame(height: height)
        .overlay(Rectangle().stroke(Theme.line, lineWidth: Theme.lineWidth))
    }
}

// MARK: - Screen furniture

/// The top of every tab: what this screen is, in a heading and one sentence.
///
/// This exists because people were opening the app and not knowing what any
/// of it was for. The sentence is not decoration; it is the screen explaining
/// itself before anything is tapped.
struct ScreenHeader: View {
    let eyebrow: String
    let title: String
    let blurb: String
    var accent: Color = Theme.accent

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Rectangle().fill(accent).frame(width: 12, height: 12)
                    .overlay(Rectangle().stroke(Theme.line, lineWidth: 1.5))
                Text(eyebrow).eyebrow()
            }
            Text(title).brutHeading(30)
            Text(blurb)
                .font(.brutBody(14))
                .foregroundStyle(Theme.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// Nothing here yet, said as a block rather than as an apology.
struct BrutEmptyState: View {
    let title: String
    let message: String
    var systemImage: String = "sparkles"

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Image(systemName: systemImage)
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(Theme.accent)
            Text(title)
                .font(.brutTitle(18))
                .foregroundStyle(Theme.fg)
            Text(message)
                .font(.brutBody(14))
                .foregroundStyle(Theme.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .brutCard()
    }
}

/// An inline notice: an error, or a confirmation.
struct BrutNotice: View {
    enum Tone { case error, info }
    let text: String
    var tone: Tone = .error

    var body: some View {
        Text(text)
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(tone == .error ? Theme.ink : Theme.fg)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .brutBordered(fill: tone == .error ? Theme.accent : Theme.surface)
            .accessibilityAddTraits(tone == .error ? .isStaticText : [])
    }
}
