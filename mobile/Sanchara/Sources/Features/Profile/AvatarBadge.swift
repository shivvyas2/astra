import SwiftUI

/// The account control in the top bar: their photo when there is one, their
/// initials when there is not, and never an empty grey square.
struct AvatarBadge: View {
    let details: BirthProfileDetails?

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
        .frame(width: 28, height: 28)
        .clipShape(RoundedRectangle(cornerRadius: Theme.cornerRadius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.cornerRadius, style: .continuous)
                .strokeBorder(Theme.line, lineWidth: 1.5)
        )
    }

    private var initialsBlock: some View {
        ZStack {
            Theme.surface
            Text(initials)
                .font(.brutMono(11, weight: .bold))
                .foregroundStyle(Theme.fg)
        }
    }
}
