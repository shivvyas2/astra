import PhotosUI
import SwiftUI

/// The "Add photo" control from `components/IntakeForm.tsx`: a round photo
/// with a small lime "+" badge, and a label beneath saying what a tap does.
///
/// Uses `PhotosPicker`, which runs out of process, so the app never asks for
/// photo library permission — the person picks one image and only that image
/// is handed over.
struct SancharaPhotoField: View {
    @Binding var selection: PhotosPickerItem?
    /// The newly picked image, if any.
    let preview: UIImage?
    /// The photo already on the profile, shown until a new one is picked.
    let existingURL: URL?
    var isLoading: Bool = false

    private var hasPhoto: Bool { preview != nil || existingURL != nil }

    var body: some View {
        PhotosPicker(selection: $selection, matching: .images, photoLibrary: .shared()) {
            VStack(alignment: .leading, spacing: 10) {
                AvatarCircle(image: preview, url: existingURL, isLoading: isLoading)
                Text(hasPhoto ? "Change photo" : "Add a photo").eyebrow()
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(DipButtonStyle())
        .accessibilityLabel(hasPhoto ? "Change profile photo" : "Add a profile photo")
    }
}

/// A round photo with a one-point ring and, at its lower right, the small
/// lime "+" that says it can be changed. Shared by intake and the profile.
struct AvatarCircle: View {
    let image: UIImage?
    let url: URL?
    var isLoading: Bool = false
    var size: CGFloat = 84
    var showsBadge: Bool = true

    var body: some View {
        ZStack {
            Circle().fill(Theme.fg.opacity(0.06))
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else if let url {
                AsyncImage(url: url) { loaded in
                    loaded.resizable().scaledToFill()
                } placeholder: {
                    ProgressView().tint(Theme.muted)
                }
            } else {
                Image(systemName: "person")
                    .font(.system(size: size * 0.34, weight: .light))
                    .foregroundStyle(Theme.muted)
            }
            if isLoading {
                Theme.bg.opacity(0.55)
                ProgressView().tint(Theme.fg)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().strokeBorder(Theme.line, lineWidth: Theme.lineWidth))
        .overlay(alignment: .bottomTrailing) {
            if showsBadge && !isLoading {
                Image(systemName: "plus")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Theme.ink)
                    .frame(width: 28, height: 28)
                    .background(Circle().fill(Theme.accent))
                    .overlay(Circle().stroke(Theme.bg, lineWidth: 2))
                    .offset(x: 2, y: 2)
            }
        }
        .accessibilityHidden(true)
    }
}

extension UIImage {
    /// Downscales and compresses for upload.
    ///
    /// A modern phone photo is several megabytes and gets shown at 72 points;
    /// sending the original would make intake feel broken on a slow connection
    /// for no visible gain.
    func avatarJPEG(maxDimension: CGFloat = 1024, quality: CGFloat = 0.8) -> Data? {
        let longest = max(size.width, size.height)
        guard longest > 0 else { return nil }

        let scale = min(1, maxDimension / longest)
        let target = CGSize(width: (size.width * scale).rounded(), height: (size.height * scale).rounded())

        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let resized = UIGraphicsImageRenderer(size: target, format: format).image { _ in
            draw(in: CGRect(origin: .zero, size: target))
        }
        return resized.jpegData(compressionQuality: quality)
    }
}
