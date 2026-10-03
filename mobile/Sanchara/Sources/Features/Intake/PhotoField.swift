import PhotosUI
import SwiftUI

/// The "Add photo" control from `components/IntakeForm.tsx`, as a bordered
/// square.
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

    var body: some View {
        VStack(spacing: 0) {
            PhotosPicker(selection: $selection, matching: .images, photoLibrary: .shared()) {
                ZStack {
                    if let preview {
                        Image(uiImage: preview)
                            .resizable()
                            .scaledToFill()
                    } else if let existingURL {
                        AsyncImage(url: existingURL) { image in
                            image.resizable().scaledToFill()
                        } placeholder: {
                            ProgressView().tint(Theme.muted)
                        }
                    } else {
                        Text("Add photo")
                            .font(.brutMono(10))
                            .foregroundStyle(Theme.muted)
                    }
                    if isLoading {
                        Theme.bg.opacity(0.55)
                        ProgressView().tint(Theme.fg)
                    }
                }
                .frame(width: 72, height: 72)
                .background(Theme.surface)
                .clipShape(RoundedRectangle(cornerRadius: Theme.cornerRadius, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.cornerRadius, style: .continuous)
                        .strokeBorder(Theme.line, lineWidth: Theme.lineWidth)
                )
            }
            .accessibilityLabel(preview == nil && existingURL == nil ? "Add a profile photo" : "Change profile photo")
        }
        .frame(maxWidth: .infinity)
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
