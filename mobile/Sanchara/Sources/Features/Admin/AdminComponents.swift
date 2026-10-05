import SwiftUI

// MARK: - Frame

/// The title tab on top of the canvas: a rounded top-left corner, then a soft
/// shoulder that runs down and out past the tab's own right edge to meet the
/// canvas — the reference's "Cardiology" tab, sized for a phone. Drawn as
/// the background of the tab's content, so it always fits the title without
/// measuring anything.
struct AdminTabShape: Shape {
    var radius: CGFloat = AdminTheme.canvasRadius
    var shoulder: CGFloat = 30
    /// How far the fill reaches below the tab, so it meets the canvas with no seam.
    var overlap: CGFloat = 1

    func path(in rect: CGRect) -> Path {
        let r = min(radius, rect.height / 2)
        var p = Path()
        p.move(to: CGPoint(x: rect.minX, y: rect.maxY + overlap))
        p.addLine(to: CGPoint(x: rect.minX, y: rect.minY + r))
        p.addArc(center: CGPoint(x: rect.minX + r, y: rect.minY + r), radius: r,
                 startAngle: .degrees(180), endAngle: .degrees(270), clockwise: false)
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        p.addCurve(
            to: CGPoint(x: rect.maxX + shoulder, y: rect.maxY),
            control1: CGPoint(x: rect.maxX + shoulder * 0.55, y: rect.minY),
            control2: CGPoint(x: rect.maxX + shoulder * 0.45, y: rect.maxY)
        )
        p.addLine(to: CGPoint(x: rect.maxX + shoulder, y: rect.maxY + overlap))
        p.closeSubpath()
        return p
    }
}

/// Every admin screen: graphite frame, warm canvas with a title tab, a round
/// button in the tab (close or back), and optional controls on the frame to
/// the right of the tab.
struct AdminFrame<Trailing: View, Content: View>: View {
    enum Leading { case close, back }

    let title: String
    var leading: Leading = .close
    var leadingAction: () -> Void
    @ViewBuilder var trailing: Trailing
    @ViewBuilder var content: Content

    private let headerHeight: CGFloat = 60
    private var canvasShape: UnevenRoundedRectangle {
        UnevenRoundedRectangle(
            topLeadingRadius: 0,
            bottomLeadingRadius: AdminTheme.canvasBottomRadius,
            bottomTrailingRadius: AdminTheme.canvasBottomRadius,
            topTrailingRadius: AdminTheme.canvasRadius,
            style: .continuous
        )
    }

    var body: some View {
        ZStack(alignment: .top) {
            AdminTheme.frame.ignoresSafeArea()

            VStack(spacing: 0) {
                HStack(spacing: 0) {
                    HStack(spacing: 10) {
                        AdminRoundButton(
                            systemImage: leading == .close ? "xmark" : "chevron.left",
                            label: leading == .close ? "Close admin" : "Back",
                            action: leadingAction
                        )
                        Text(title)
                            .font(.adminTitle(26))
                            .tracking(-0.6)
                            .foregroundStyle(AdminTheme.ink)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                            .frame(maxWidth: 190, alignment: .leading)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityAddTraits(.isHeader)
                    }
                    .padding(.leading, 8)
                    .padding(.trailing, 12)
                    .frame(maxHeight: .infinity)
                    .background(alignment: .leading) {
                        AdminTabShape().fill(AdminTheme.canvas)
                    }
                    Spacer(minLength: 36)
                    trailing
                        .padding(.trailing, 4)
                }
                .frame(height: headerHeight)

                content
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(canvasShape.fill(AdminTheme.canvas))
                    .clipShape(canvasShape)
                    .ignoresSafeArea(edges: .bottom)
            }
            .padding(.horizontal, 6)
            .padding(.top, 2)
        }
        .toolbar(.hidden, for: .navigationBar)
        .environment(\.colorScheme, .light)
    }
}

extension AdminFrame where Trailing == EmptyView {
    init(title: String, leading: Leading = .close, leadingAction: @escaping () -> Void, @ViewBuilder content: () -> Content) {
        self.title = title
        self.leading = leading
        self.leadingAction = leadingAction
        self.trailing = EmptyView()
        self.content = content()
    }
}

// MARK: - Controls

/// The round white button: close, back.
struct AdminRoundButton: View {
    let systemImage: String
    let label: String
    var fill: Color = AdminTheme.raised
    var tint: Color = AdminTheme.ink
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(tint)
                .frame(width: 44, height: 44)
                .background(Circle().fill(fill))
                .contentShape(Circle())
        }
        .buttonStyle(AdminPressStyle())
        .accessibilityLabel(label)
    }
}

/// A slight dip on press — no springs, no shadows.
struct AdminPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.7 : 1)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

/// A pill tab chip with a small line icon. Selected is a white pill.
/// `onFrame` styles it for the graphite frame rather than the canvas;
/// `iconOnlyWhenIdle` collapses an unselected chip to its icon where the
/// header is tight.
struct AdminPill: View {
    let title: String
    var systemImage: String?
    let isSelected: Bool
    var onFrame = false
    var iconOnlyWhenIdle = false
    /// Off where four labelled chips have to share a phone's width: only the
    /// selected one carries its icon.
    var iconWhenIdle = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let systemImage, isSelected || iconWhenIdle {
                    Image(systemName: systemImage)
                        .font(.system(size: 13, weight: .regular))
                        .accessibilityHidden(true)
                }
                if !(iconOnlyWhenIdle && !isSelected) || systemImage == nil {
                    Text(title)
                        .font(.footnote.weight(isSelected ? .semibold : .regular))
                        .lineLimit(1)
                        .fixedSize()
                }
            }
            .foregroundStyle(foreground)
            .padding(.horizontal, iconOnlyWhenIdle && !isSelected ? 0 : 14)
            .frame(minWidth: 44, minHeight: 44)
            .background(Capsule().fill(fill))
            .overlay(Capsule().strokeBorder(stroke, lineWidth: AdminTheme.hairline))
            .contentShape(Capsule())
        }
        .buttonStyle(AdminPressStyle())
        .accessibilityLabel(title)
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    }

    private var fill: Color {
        if isSelected { return AdminTheme.raised }
        return onFrame ? AdminTheme.frameRaised : AdminTheme.canvas
    }

    private var stroke: Color {
        if isSelected || onFrame { return .clear }
        return AdminTheme.line
    }

    private var foreground: Color {
        if isSelected { return AdminTheme.ink }
        return onFrame ? AdminTheme.onFrame : AdminTheme.inkSoft
    }
}

/// A small static pill: a plan, a mode, a status.
struct AdminChip: View {
    enum Style { case plain, lime, dark, outline, warm }
    let text: String
    var style: Style = .plain
    var systemImage: String?

    var body: some View {
        HStack(spacing: 4) {
            if let systemImage {
                Image(systemName: systemImage).font(.system(size: 9, weight: .semibold)).accessibilityHidden(true)
            }
            Text(text)
                .font(.caption2.weight(.semibold))
                .lineLimit(1)
                .fixedSize()
        }
        .foregroundStyle(foreground)
        .padding(.horizontal, 9)
        .padding(.vertical, 4)
        .background(Capsule().fill(fill))
        .overlay(Capsule().strokeBorder(style == .outline ? AdminTheme.line : .clear, lineWidth: AdminTheme.hairline))
    }

    private var fill: Color {
        switch style {
        case .plain: AdminTheme.raised
        case .lime: AdminTheme.lime
        case .dark: AdminTheme.frame
        case .outline: .clear
        case .warm: AdminTheme.warm.opacity(0.16)
        }
    }

    private var foreground: Color {
        switch style {
        case .dark: AdminTheme.onFrame
        case .warm: Color(hex: 0x8A3218)
        default: AdminTheme.ink
        }
    }
}

/// The reference's lime count badge.
struct AdminCountBadge: View {
    let count: Int
    var body: some View {
        Text(AdminFormat.compact(count))
            .font(.system(size: 10, weight: .semibold).monospacedDigit())
            .foregroundStyle(AdminTheme.ink)
            .padding(.horizontal, 5)
            .frame(minWidth: 18, minHeight: 18)
            .background(Capsule().fill(AdminTheme.lime))
            .accessibilityHidden(true)
    }
}

/// A round icon: lime when it is the thing to look at, canvas otherwise.
struct AdminIconDot: View {
    let systemImage: String
    var highlighted = false
    var size: CGFloat = 32
    var body: some View {
        Image(systemName: systemImage)
            .font(.system(size: size * 0.4, weight: .regular))
            .foregroundStyle(AdminTheme.ink)
            .frame(width: size, height: size)
            .background(Circle().fill(highlighted ? AdminTheme.lime : AdminTheme.raised))
            .accessibilityHidden(true)
    }
}

/// Initials in a circle, lime when the person was active this week.
struct AdminAvatar: View {
    let name: String
    var active = false
    var size: CGFloat = 44
    var body: some View {
        Text(AdminFormat.initials(name))
            .font(.system(size: size * 0.36, weight: .medium))
            .foregroundStyle(AdminTheme.ink)
            .frame(width: size, height: size)
            .background(Circle().fill(active ? AdminTheme.lime : AdminTheme.raised))
            .overlay(Circle().strokeBorder(active ? .clear : AdminTheme.rule, lineWidth: AdminTheme.hairline))
            .accessibilityHidden(true)
    }
}

// MARK: - Stats

/// One value on a stat strip.
struct AdminStat: Identifiable {
    let label: String
    let value: String
    var unit: String?
    var note: String?
    var systemImage: String
    var highlighted = false
    /// What VoiceOver reads for the value: "1,204" rather than "1.2k".
    var spokenValue: String?
    var id: String { label }
}

/// Small grey label over a big light number with a small unit — the
/// reference's "Heart Rate / 89 bpm".
struct AdminStatCard: View {
    let stat: AdminStat
    var width: CGFloat = 148

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                Text(stat.label)
                    .font(.adminLabel)
                    .foregroundStyle(AdminTheme.muted)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 4)
                AdminIconDot(systemImage: stat.systemImage, highlighted: stat.highlighted, size: 28)
            }
            Spacer(minLength: 0)
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(stat.value)
                    .font(.adminNumber(30))
                    .tracking(-0.8)
                    .foregroundStyle(AdminTheme.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                if let unit = stat.unit {
                    Text(unit)
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(AdminTheme.muted)
                        .lineLimit(1)
                }
            }
            if let note = stat.note {
                Text(note)
                    .font(.caption2)
                    .foregroundStyle(AdminTheme.muted)
                    .lineLimit(1)
            }
        }
        .padding(14)
        .frame(width: width, alignment: .leading)
        .frame(minHeight: 116)
        .adminPanel()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spoken)
    }

    /// "Readings, 1,204, 12 today".
    private var spoken: String {
        var parts = [stat.label, stat.spokenValue ?? [stat.value, stat.unit].compactMap { $0 }.joined(separator: " ")]
        if let note = stat.note { parts.append(note) }
        return parts.joined(separator: ", ")
    }
}

/// A horizontally scrolling row of stat cards.
struct AdminStatStrip: View {
    let stats: [AdminStat]
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(stats) { AdminStatCard(stat: $0) }
            }
            .padding(.horizontal, 16)
        }
    }
}

// MARK: - Sections and states

/// A small grey heading with an optional count badge.
struct AdminSectionHeader: View {
    let title: String
    var count: Int?
    var body: some View {
        HStack(spacing: 8) {
            Text(title)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(AdminTheme.inkSoft)
            if let count { AdminCountBadge(count: count) }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(count.map { "\(title), \($0)" } ?? title)
        .accessibilityAddTraits(.isHeader)
    }
}

/// Loading, failure and empty, in the admin look.
struct AdminMessage: View {
    let systemImage: String
    let title: String
    var detail: String?
    var actionTitle: String?
    var action: (() -> Void)?
    var isLoading = false

    var body: some View {
        VStack(spacing: 14) {
            if isLoading {
                ProgressView().tint(AdminTheme.ink).frame(width: 52, height: 52)
            } else {
                AdminIconDot(systemImage: systemImage, highlighted: true, size: 52)
            }
            Text(title)
                .font(.title3.weight(.light))
                .foregroundStyle(AdminTheme.ink)
                .multilineTextAlignment(.center)
            if let detail {
                Text(detail)
                    .font(.subheadline)
                    .foregroundStyle(AdminTheme.muted)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let actionTitle, let action {
                AdminPill(title: actionTitle, systemImage: "arrow.clockwise", isSelected: true, action: action)
            }
        }
        .padding(28)
        .frame(maxWidth: .infinity)
        .adminPanel()
        .accessibilityElement(children: .combine)
    }
}
