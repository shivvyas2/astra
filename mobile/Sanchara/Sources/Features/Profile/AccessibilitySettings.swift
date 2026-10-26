import SwiftUI

/// Text size steps offered in Settings › Accessibility. The first is the size
/// the app is drawn at; the last is more than twice it for reading text.
enum AppTextSize: Int, CaseIterable {
    case standard, large, larger, largest, accessibility1, accessibility2, accessibility3

    var dynamicTypeSize: DynamicTypeSize {
        switch self {
        case .standard: .large
        case .large: .xLarge
        case .larger: .xxLarge
        case .largest: .xxxLarge
        case .accessibility1: .accessibility1
        case .accessibility2: .accessibility2
        case .accessibility3: .accessibility3
        }
    }
}

/// Folds the app's own accessibility switches into the environment at the
/// root, on top of iOS's. Everything below reads the ordinary values
/// (`dynamicTypeSize`, `accessibilityReduceMotion`, `colorSchemeContrast`,
/// `accessibilityDifferentiateWithoutColor`), so it follows either source and
/// a switch flipped in the app takes effect without a relaunch.
///
/// With every switch off and iOS at its defaults this changes nothing.
private struct AppAccessibility: ViewModifier {
    @Environment(\.dynamicTypeSize) private var systemTypeSize
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.colorSchemeContrast) private var systemContrast
    @Environment(\.accessibilityDifferentiateWithoutColor) private var systemShapeCues

    @AppStorage(Theme.Accessibility.textSizeKey) private var textSize: AppTextSize = .standard
    @AppStorage(Theme.Accessibility.reduceMotionKey) private var reduceMotion = false
    @AppStorage(Theme.Accessibility.increaseContrastKey) private var increaseContrast = false
    @AppStorage(Theme.Accessibility.shapeCuesKey) private var shapeCues = false

    func body(content: Content) -> some View {
        content
            .dynamicTypeSize(max(systemTypeSize, textSize.dynamicTypeSize))
            // The underscored setters are the public way to write these;
            // the plain names are read-only.
            .environment(\._accessibilityReduceMotion, systemReduceMotion || reduceMotion)
            .environment(\._colorSchemeContrast, increaseContrast ? .increased : systemContrast)
            .environment(\._accessibilityDifferentiateWithoutColor, systemShapeCues || shapeCues)
    }
}

extension View {
    /// Applies Settings › Accessibility. Called once, at the root.
    func appAccessibility() -> some View {
        modifier(AppAccessibility())
    }
}

/// Settings › Accessibility. Each switch adds to the iOS setting of the same
/// name: when iOS already has it on, the switch shows on and is locked, since
/// turning it off here would not turn it off there.
struct AccessibilitySettingsView: View {
    @AppStorage(Theme.Accessibility.textSizeKey) private var textSize: AppTextSize = .standard
    @AppStorage(Theme.Accessibility.reduceMotionKey) private var reduceMotion = false
    @AppStorage(Theme.Accessibility.increaseContrastKey) private var increaseContrast = false
    @AppStorage(Theme.Accessibility.shapeCuesKey) private var shapeCues = false

    // From UIAccessibility rather than the environment: the environment here
    // already includes the switches below, and the lock needs iOS's own.
    @State private var system = SystemSettings.current

    var body: some View {
        ZStack {
            Atmosphere(mood: .dusk)
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    ScreenHeader(
                        eyebrow: L10n.string("Settings"),
                        title: L10n.string("Accessibility"),
                        blurb: L10n.string("These add to the settings in iOS. Astrya also works with VoiceOver and Voice Control."),
                        titleSize: 34
                    )

                    textSizeBlock

                    VStack(alignment: .leading, spacing: 0) {
                        BrutDivider()
                        row(
                            title: L10n.string("Reduce motion"),
                            detail: L10n.string("Changes appear without sliding or fading."),
                            isOn: $reduceMotion,
                            lockedOn: system.reduceMotion
                        )
                        BrutDivider()
                        row(
                            title: L10n.string("Increase contrast"),
                            detail: L10n.string("Brighter outlines and secondary text."),
                            isOn: $increaseContrast,
                            lockedOn: system.increaseContrast
                        )
                        BrutDivider()
                        row(
                            title: L10n.string("Shapes as well as colour"),
                            detail: L10n.string("Adds a symbol wherever colour alone shows a meaning."),
                            isOn: $shapeCues,
                            lockedOn: system.shapeCues
                        )
                        BrutDivider()
                    }
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 24)
                .frame(maxWidth: 420)
                .frame(maxWidth: .infinity)
            }
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
        .tint(Theme.fg)
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { _ in
            system = .current
        }
    }

    private var textSizeBlock: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Text size").eyebrow()
            HStack(spacing: 14) {
                Text(verbatim: "A")
                    .font(.scaled(size: 13, weight: .medium))
                    .foregroundStyle(Theme.muted)
                    .accessibilityHidden(true)
                Slider(
                    value: Binding(
                        get: { Double(textSize.rawValue) },
                        set: { textSize = AppTextSize(rawValue: Int($0.rounded())) ?? .standard }
                    ),
                    in: 0...Double(AppTextSize.allCases.count - 1),
                    step: 1
                )
                .tint(Theme.accent)
                .accessibilityLabel(Text("Text size"))
                .accessibilityValue(Text(textSize == .standard ? L10n.string("Default") : "\(textSize.rawValue + 1)/\(AppTextSize.allCases.count)"))
                Text(verbatim: "A")
                    .font(.scaled(size: 22, weight: .medium))
                    .foregroundStyle(Theme.fg)
                    .accessibilityHidden(true)
            }
            .frame(minHeight: 44)
            Text("Your readings and every screen use this size. If iOS is set larger, Astrya follows iOS.")
                .font(.brutBody(13))
                .foregroundStyle(Theme.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func row(title: String, detail: String, isOn: Binding<Bool>, lockedOn: Bool) -> some View {
        Toggle(isOn: lockedOn ? .constant(true) : isOn) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.scaled(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.fg)
                Text(lockedOn ? L10n.string("On in iOS Settings.") : detail)
                    .font(.brutBody(13))
                    .foregroundStyle(Theme.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .tint(Theme.accent)
        .disabled(lockedOn)
        .frame(minHeight: 44)
        .padding(.vertical, 12)
    }
}

/// What iOS itself has switched on, without the app's additions.
private struct SystemSettings {
    var reduceMotion: Bool
    var increaseContrast: Bool
    var shapeCues: Bool

    static var current: SystemSettings {
        SystemSettings(
            reduceMotion: UIAccessibility.isReduceMotionEnabled,
            increaseContrast: UIAccessibility.isDarkerSystemColorsEnabled,
            shapeCues: UIAccessibility.shouldDifferentiateWithoutColor
        )
    }
}
