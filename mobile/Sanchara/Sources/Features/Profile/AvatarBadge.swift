import SwiftUI

/// The account control in the top bar: their photo when there is one, their
/// initials when there is not, and never an empty grey circle.
struct AvatarBadge: View {
    let details: BirthProfileDetails?
    var size: CGFloat = 28

    private var initials: String {
        let first = details?.firstName.first.map(String.init) ?? ""
        let last = details?.lastName.first.map(String.init) ?? ""
        let joined = (first + last).uppercased()
        return joined.isEmpty ? "★" : joined
    }

    var body: some View {
        Group {
            if let url = details?.avatarUrl.flatMap(URL.init(string:)) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    initialsBlock
                }
            } else {
                initialsBlock
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().strokeBorder(Theme.line, lineWidth: Theme.lineWidth))
    }

    private var initialsBlock: some View {
        ZStack {
            Theme.surface
            Text(initials)
                .font(.system(size: size * 0.38, weight: .semibold))
                .foregroundStyle(Theme.fg)
        }
    }
}
