import SwiftUI
import UIKit

/// The home-screen icons Plus offers: the Astrya mark in each theme colour.
///
/// Cosmetic on purpose. Plus never gates or caps readings; what it adds is a
/// way to make the app look like yours. The raw values are asset-catalog icon
/// set names and must match `ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES` in
/// project.yml; `mobile/scripts/make-icon.py alternates` draws them.
enum AppIconChoice: String, CaseIterable, Identifiable {
    case ember = ""
    case lime = "AppIcon-Lime"
    case violet = "AppIcon-Violet"
    case bone = "AppIcon-Bone"

    var id: String { rawValue }

    /// What `setAlternateIconName` takes: nil restores the primary icon.
    var iconName: String? { self == .ember ? nil : rawValue }

    var label: String {
        switch self {
        case .ember: "Ember"
        case .lime: "Lime"
        case .violet: "Violet"
        case .bone: "Bone"
        }
    }

    /// The disc colour, for the swatch in the picker.
    var swatch: Color {
        switch self {
        case .ember: Theme.ember
        case .lime: Theme.accent
        case .violet: Theme.violet
        case .bone: Theme.fg
        }
    }

    /// Only the primary icon is free; the alternates come with Plus.
    var needsPlus: Bool { self != .ember }

    init(iconName: String?) {
        self = iconName.flatMap(AppIconChoice.init(rawValue:)) ?? .ember
    }
}

/// The You tab's icon picker: four swatches, the current one ringed in lime.
/// Without Plus, an alternate opens the paywall instead of switching.
struct AppIconPicker: View {
    @State private var store = PlusStore.shared
    @State private var current = AppIconChoice(iconName: UIApplication.shared.alternateIconName)
    @State private var showPaywall = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Text("App icon").eyebrow()
                if store.plan != .plus {
                    BrutTag(text: "Plus", fill: Theme.fg.opacity(0.12), textColor: Theme.muted)
                }
            }
            HStack(spacing: 14) {
                ForEach(AppIconChoice.allCases) { choice in
                    swatch(choice)
                }
                Spacer(minLength: 0)
            }
            if let errorMessage {
                BrutNotice(text: errorMessage)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .brutBordered()
        .task { store.start() }
        .sheet(isPresented: $showPaywall) { PaywallView() }
    }

    private func swatch(_ choice: AppIconChoice) -> some View {
        let selected = choice == current
        let locked = choice.needsPlus && store.plan != .plus
        return Button {
            pick(choice)
        } label: {
            VStack(spacing: 6) {
                ZStack {
                    RoundedRectangle(cornerRadius: 13, style: .continuous)
                        .fill(Theme.bg)
                    Circle()
                        .fill(LinearGradient(colors: [choice.swatch, choice.swatch.opacity(0.7)], startPoint: .top, endPoint: .bottom))
                        .frame(width: 22, height: 22)
                        .shadow(color: choice.swatch.opacity(0.5), radius: 6)
                    if locked {
                        Image(systemName: "lock.fill")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundStyle(Theme.muted)
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                            .padding(5)
                    }
                }
                .frame(width: 56, height: 56)
                .overlay {
                    RoundedRectangle(cornerRadius: 13, style: .continuous)
                        .strokeBorder(selected ? Theme.accent : Theme.line, lineWidth: selected ? 2 : Theme.lineWidth)
                }
                Text(choice.label)
                    .font(.system(size: 12, weight: selected ? .semibold : .regular))
                    .foregroundStyle(selected ? Theme.fg : Theme.muted)
            }
        }
        .buttonStyle(DipButtonStyle())
        .accessibilityLabel("\(choice.label) icon")
        .accessibilityAddTraits(selected ? .isSelected : [])
        .accessibilityHint(locked ? "Comes with Astrya Plus" : "")
    }

    private func pick(_ choice: AppIconChoice) {
        guard choice != current else { return }
        if choice.needsPlus && store.plan != .plus {
            showPaywall = true
            return
        }
        guard UIApplication.shared.supportsAlternateIcons else {
            errorMessage = "This device can't change the app icon."
            return
        }
        errorMessage = nil
        UIApplication.shared.setAlternateIconName(choice.iconName) { error in
            Task { @MainActor in
                if error == nil { current = choice } else { errorMessage = "The icon didn't change. Try again." }
            }
        }
    }
}
