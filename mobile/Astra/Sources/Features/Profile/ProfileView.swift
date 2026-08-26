import PhotosUI
import SwiftUI
import UIKit

/// Birth details, the kundli, and account controls — the native counterpart of
/// `app/(app)/app/profile/page.tsx`.
struct ProfileView: View {
    let profile: ProfileStore

    @Environment(AuthStore.self) private var auth
    @Environment(\.dismiss) private var dismiss
    @State private var isEditing = false
    @State private var kundli: SharePayload?
    @State private var isPreparingKundli = false
    @State private var confirmDelete = false
    @State private var photoItem: PhotosPickerItem?
    @State private var isUploadingPhoto = false
    @State private var isDeleting = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.bg.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        if let details = profile.details {
                            header(details)
                            detailCard(details)
                        }

                        VStack(spacing: 12) {
                            AstraPrimaryButton(title: "Edit birth details") { isEditing = true }
                            AstraSecondaryButton(
                                title: isPreparingKundli ? "Preparing…" : "Download kundli (PDF)"
                            ) {
                                Task { await prepareKundli() }
                            }
                        }

                        if let errorMessage {
                            Text(errorMessage)
                                .font(.system(size: 13))
                                .foregroundStyle(Theme.accent)
                        }

                        VStack(alignment: .leading, spacing: 6) {
                            Text("Suggestions").eyebrow()
                            Text(SuggestionEngine.onDeviceStatus)
                                .font(.system(size: 13))
                                .foregroundStyle(Theme.muted)
                            Text("Follow-up questions are written by Apple Intelligence on this device. Your readings are not sent anywhere for them.")
                                .font(.system(size: 12))
                                .foregroundStyle(Theme.muted.opacity(0.8))
                        }
                        .padding(.top, 4)

                        VStack(alignment: .leading, spacing: 16) {
                            Text("Account").eyebrow()
                            Button("Sign out") {
                                Task {
                                    await auth.signOut()
                                    dismiss()
                                }
                            }
                            .font(.system(size: 15))
                            .foregroundStyle(Theme.fg)

                            Button("Delete my account") { confirmDelete = true }
                                .font(.system(size: 15))
                                .foregroundStyle(Theme.accent)
                                .disabled(isDeleting)

                            Text("Deleting removes your chart, readings, and alerts permanently.")
                                .font(.system(size: 12))
                                .foregroundStyle(Theme.muted.opacity(0.8))
                        }
                        .padding(.top, 8)
                    }
                    .padding(.horizontal, 24)
                    .padding(.vertical, 24)
                    .frame(maxWidth: 420)
                    .frame(maxWidth: .infinity)
                }
            }
            .navigationTitle("Your profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }.foregroundStyle(Theme.muted)
                }
            }
            .toolbarBackground(Theme.bg, for: .navigationBar)
        }
        .presentationBackground(Theme.bg)
        .sheet(isPresented: $isEditing) {
            IntakeView(initial: profile.details, onCancel: { isEditing = false }) {
                await profile.load()
                isEditing = false
            }
        }
        .sheet(item: $kundli) { payload in
            ShareSheet(items: [payload.url])
        }
        .onChange(of: photoItem) { _, item in
            guard item != nil else { return }
            Task { await uploadPickedPhoto() }
        }
        .alert("Delete your account?", isPresented: $confirmDelete) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) { Task { await deleteAccount() } }
        } message: {
            Text("This permanently removes your chart, readings, and alerts. It cannot be undone.")
        }
    }

    private func header(_ details: BirthProfileDetails) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            // Changing the photo is its own one-tap action here. Routing it
            // through the birth-details form would mean re-submitting a chart
            // to swap a picture.
            PhotosPicker(selection: $photoItem, matching: .images, photoLibrary: .shared()) {
                ZStack {
                    if let url = details.avatarUrl.flatMap(URL.init(string:)) {
                        AsyncImage(url: url) { image in
                            image.resizable().scaledToFill()
                        } placeholder: {
                            Color.white.opacity(0.04)
                        }
                    } else {
                        ZStack {
                            Theme.fieldFill
                            Text("Add photo")
                                .font(.system(size: 11))
                                .foregroundStyle(Theme.muted)
                        }
                    }
                    if isUploadingPhoto {
                        Color.black.opacity(0.45)
                        ProgressView().tint(Theme.fg)
                    }
                }
                .frame(width: 64, height: 64)
                .clipShape(Circle())
                .overlay(Circle().stroke(Theme.hairline, lineWidth: 1))
                .overlay(alignment: .bottomTrailing) {
                    if !isUploadingPhoto {
                        Image(systemName: "camera.fill")
                            .font(.system(size: 9))
                            .foregroundStyle(Theme.bg)
                            .padding(5)
                            .background(Theme.fg)
                            .clipShape(Circle())
                            .overlay(Circle().stroke(Theme.bg, lineWidth: 1.5))
                            .offset(x: 2, y: 2)
                    }
                }
            }
            .disabled(isUploadingPhoto)
            .accessibilityLabel(details.avatarUrl == nil ? "Add a profile photo" : "Change profile photo")
            .padding(.bottom, 6)

            Text(details.fullName)
                .font(.system(size: 28, weight: .light))
                .tracking(-0.5)
                .foregroundStyle(Theme.fg)
            Text("Changing your birth data recomputes your chart.")
                .font(.system(size: 13))
                .foregroundStyle(Theme.muted)
        }
    }

    private func detailCard(_ details: BirthProfileDetails) -> some View {
        VStack(spacing: 0) {
            detailRow("Born", value: formattedBirth(details))
            Divider().overlay(Theme.hairline)
            detailRow("Place", value: details.placeName)
            Divider().overlay(Theme.hairline)
            detailRow("Timezone", value: details.timezone)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 4)
        .background(Theme.fieldFill)
        .clipShape(RoundedRectangle(cornerRadius: Theme.cornerRadius))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.cornerRadius)
                .stroke(Theme.hairline, lineWidth: 1)
        )
    }

    private func detailRow(_ label: String, value: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text(label)
                .font(.system(size: 13))
                .foregroundStyle(Theme.muted)
                .frame(width: 80, alignment: .leading)
            Text(value)
                .font(.system(size: 15))
                .foregroundStyle(Theme.fg)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 12)
    }

    /// "15 June 1995 at 10:30" — the birth moment as it was where they were born.
    private func formattedBirth(_ details: BirthProfileDetails) -> String {
        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.dateFormat = "yyyy-MM-dd"
        guard let date = parser.date(from: details.birthDate) else {
            return "\(details.birthDate) at \(details.birthTimeShort)"
        }
        let pretty = DateFormatter()
        pretty.dateStyle = .long
        pretty.timeStyle = .none
        return "\(pretty.string(from: date)) at \(details.birthTimeShort)"
    }

    /// Sends the new photo with the birth details already on file, because the
    /// route takes the profile as a whole and only replaces the avatar when a
    /// photo part is present.
    private func uploadPickedPhoto() async {
        guard let item = photoItem, let details = profile.details else { return }
        isUploadingPhoto = true
        errorMessage = nil
        defer {
            isUploadingPhoto = false
            photoItem = nil
        }

        guard
            let data = try? await item.loadTransferable(type: Data.self),
            let image = UIImage(data: data),
            let jpeg = image.avatarJPEG()
        else {
            errorMessage = "That image could not be read. Try another."
            return
        }

        do {
            try await AstraAPI.saveProfile(
                BirthProfileInput(
                    firstName: details.firstName,
                    lastName: details.lastName,
                    birthDate: details.birthDate,
                    birthTime: details.birthTimeShort,
                    placeName: details.placeName,
                    lat: details.lat,
                    lng: details.lng,
                    timezone: details.timezone,
                    photoJPEG: jpeg
                )
            )
            await profile.load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func prepareKundli() async {
        guard !isPreparingKundli else { return }
        isPreparingKundli = true
        errorMessage = nil
        defer { isPreparingKundli = false }
        do {
            let data = try await AstraAPI.kundliPDF()
            let name = (profile.details?.firstName ?? "astra").lowercased()
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(name)-kundli.pdf")
            try data.write(to: url, options: .atomic)
            kundli = SharePayload(url: url)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func deleteAccount() async {
        isDeleting = true
        errorMessage = nil
        defer { isDeleting = false }
        do {
            try await AstraAPI.deleteAccount()
            await auth.signOut()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct SharePayload: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}

/// The system share sheet, for handing the kundli PDF to Files, Mail, or print.
struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
