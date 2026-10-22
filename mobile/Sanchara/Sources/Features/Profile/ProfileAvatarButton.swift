import SwiftUI

/// The round photo (or initials) at the top right of every tab, which opens
/// You. The tab bar keeps four places; You is always one tap away here.
struct ProfileAvatarButton: View {
    var size: CGFloat = 40

    @Environment(\.navigator) private var navigator
    @Environment(\.accountDetails) private var details

    var body: some View {
        Button { navigator.open(.you) } label: {
            AvatarBadge(details: details, size: size)
                .contentShape(Circle())
        }
        .buttonStyle(DipButtonStyle())
        .accessibilityLabel("You")
        .accessibilityHint("Birth details, photo, and your account")
    }
}

private struct AccountDetailsKey: EnvironmentKey {
    static let defaultValue: BirthProfileDetails? = nil
}

extension EnvironmentValues {
    /// The signed-in person's details, for the avatar. Set by `MainTabView`.
    var accountDetails: BirthProfileDetails? {
        get { self[AccountDetailsKey.self] }
        set { self[AccountDetailsKey.self] = newValue }
    }
}
