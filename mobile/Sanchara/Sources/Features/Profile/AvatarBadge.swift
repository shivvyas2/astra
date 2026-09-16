import SwiftUI

/// The account control in the top bar: their photo when there is one, their
/// initials when there is not, and never an empty grey circle.
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
                    initialsCircle
                }
            } else {
                initialsCircle
            }
        }
        .frame(width: 28, height: 28)
        .clipShape(Circle())
        .overlay(Circle().stroke(Theme.hairline, lineWidth: 1))
    }

    private var initialsCircle: some View {
        ZStack {
            Theme.fieldFill
            Text(initials)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(Theme.muted)
        }
    }
}
