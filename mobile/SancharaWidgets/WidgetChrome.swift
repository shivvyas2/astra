import SwiftUI
import WidgetKit

// The app's look, drawn for the Home Screen.
//
// The extension does not compile `Components.swift`, so the pieces a widget
// needs are drawn here from the same tokens in `Theme.swift`: a near-black
// ground under one soft, static colour field; small uppercase labels; one
// large phrase set in medium weight with tight tracking; one-point rules; the
// lime accent; ember for warnings; and the orange Astra disc as the mark.
// Nothing is blurred and nothing animates — the system redraws a widget
// whenever it likes, and it should cost nothing when it does.

/// The ground behind every Home Screen widget: `Theme.bg` with one radial
/// colour wash from the top trailing corner and a fainter cool one opposite.
struct WidgetGround: View {
    var tint: Color = Theme.ember

    var body: some View {
        ZStack {
            Theme.bg
            RadialGradient(
                colors: [tint.opacity(0.30), tint.opacity(0.08), .clear],
                center: UnitPoint(x: 1.0, y: -0.05),
                startRadius: 0,
                endRadius: 230
            )
            RadialGradient(
                colors: [Theme.violet.opacity(0.14), .clear],
                center: UnitPoint(x: -0.1, y: 1.1),
                startRadius: 0,
                endRadius: 200
            )
        }
    }
}

/// The Astra mark: a lit orange disc, warm at the top and deeper below, with a
/// bright limb along its upper edge. Same drawing as `AstraMark` in the app,
/// with a static radial halo in place of anything blurred.
struct AstraDisc: View {
    var size: CGFloat = 12
    var halo = true

    var body: some View {
        ZStack {
            if halo {
                Circle()
                    .fill(RadialGradient(
                        colors: [Theme.ember.opacity(0.4), Theme.ember.opacity(0)],
                        center: .center,
                        startRadius: size * 0.3,
                        endRadius: size
                    ))
                    .frame(width: size * 2, height: size * 2)
            }
            Circle()
                .fill(LinearGradient(
                    colors: [Color(hex: 0xFF7E4E), Color(hex: 0xB9502F)],
                    startPoint: .top,
                    endPoint: .bottom
                ))
                .frame(width: size, height: size)
            Circle()
                .strokeBorder(
                    LinearGradient(
                        colors: [Theme.fg.opacity(0.85), Theme.fg.opacity(0)],
                        startPoint: .top,
                        endPoint: .center
                    ),
                    lineWidth: max(0.75, size * 0.04)
                )
                .frame(width: size, height: size)
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

/// Small, uppercase, tracked, muted.
struct WidgetEyebrow: View {
    let text: String
    var color: Color = Theme.muted

    var body: some View {
        Text(text)
            .font(.system(size: 10, weight: .semibold))
            .textCase(.uppercase)
            .tracking(1.4)
            .foregroundStyle(color)
            .lineLimit(1)
    }
}

/// The eyebrow on the left, the Astra disc on the right.
struct WidgetHeader: View {
    let eyebrow: String
    var dot: Color? = nil

    var body: some View {
        HStack(spacing: 6) {
            if let dot {
                Circle().fill(dot).frame(width: 6, height: 6).widgetAccentable()
            }
            WidgetEyebrow(text: eyebrow)
            Spacer(minLength: 4)
            AstraDisc(size: 11)
        }
    }
}

/// The one large phrase: medium weight, tracking tightened with size.
struct WidgetDisplay: View {
    let text: String
    var size: CGFloat = 24
    var lines: Int = 2
    var color: Color = Theme.fg

    var body: some View {
        Text(text)
            .font(.system(size: size, weight: .medium))
            .tracking(-size * 0.035)
            .foregroundStyle(color)
            .lineLimit(lines)
            .minimumScaleFactor(0.75)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// A one-point rule.
struct WidgetRule: View {
    var body: some View {
        Rectangle()
            .fill(Theme.rule)
            .frame(height: Theme.lineWidth)
            .accessibilityHidden(true)
    }
}

/// A round-ended progress line: a hairline track with a lime fill.
struct WidgetProgress: View {
    let value: Double

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.rule)
                Capsule()
                    .fill(Theme.accent)
                    .frame(width: max(geo.size.width * min(max(value, 0), 1), 4))
                    .widgetAccentable()
            }
        }
        .frame(height: 3)
        .accessibilityHidden(true)
    }
}

/// Alert severity as colour: warning is ember, caution the lime accent,
/// anything else muted. Matches `severityColor` in the app.
enum AlertTone {
    static func color(for severity: String) -> Color {
        switch severity {
        case "warning": Theme.ember
        case "caution": Theme.accent
        default: Theme.muted
        }
    }

    static func label(for severity: String) -> String {
        switch severity {
        case "warning": "Warning"
        case "caution": "Caution"
        default: "Note"
        }
    }
}

/// "2h ago", "yesterday" — when an alert was written.
enum WidgetTime {
    static func ago(_ date: Date, now: Date) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .short
        formatter.dateTimeStyle = .named
        return formatter.localizedString(for: date, relativeTo: now)
    }
}

extension WidgetFamily {
    /// Lock Screen families are drawn by the system in one tint; the colour
    /// ground and the disc are thrown away there.
    var isAccessory: Bool {
        switch self {
        case .accessoryCircular, .accessoryRectangular, .accessoryInline: true
        default: false
        }
    }
}

/// An empty state names the next action instead of apologising.
struct WidgetEmpty: View {
    let eyebrow: String
    let headline: String
    let message: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            WidgetHeader(eyebrow: eyebrow)
            Spacer(minLength: 0)
            WidgetDisplay(text: headline, size: 22, lines: 2)
            Text(message)
                .font(.system(size: 12))
                .foregroundStyle(Theme.muted)
                .lineLimit(3)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}
