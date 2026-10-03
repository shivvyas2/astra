import PhotosUI
import SwiftUI
import UIKit

/// Birth details, the kundli, and account controls — the native counterpart of
/// `app/(app)/app/profile/page.tsx`.
struct ProfileView: View {
    let profile: ProfileStore
    /// True when this view is a tab rather than a sheet: no Done button, no
    /// inline title, a `ScreenHeader` at the top, and no "View your kundli"
    /// button because the Kundli tab is one tap away.
    var embedded = false

    @Environment(AuthStore.self) private var auth
    @Environment(\.dismiss) private var dismiss
    @State private var isEditing = false
    @State private var showKundli = false
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
                        if embedded {
                            ScreenHeader(
                                eyebrow: "Account",
                                title: "You",
                                blurb: "Your birth details, photo and account. Changing birth data recomputes your chart."
                            )
                        }

                        if let details = profile.details {
                            header(details)
                            detailCard(details)
                        }

                        VStack(spacing: 12) {
                            if !embedded {
                                // The kundli leads when this is a sheet. In the
                                // tab bar the Kundli tab is one tap away, so a
                                // button here would only compete with it. The
                                // PDF is still reachable from inside the chart.
                                SancharaPrimaryButton(title: "View your kundli") {
                                    showKundli = true
                                }
                                .disabled(profile.chart == nil)
                                .opacity(profile.chart == nil ? 0.5 : 1)
                            }

                            SancharaPrimaryButton(title: "Edit birth details", kind: .secondary) {
                                isEditing = true
                            }

                            if profile.chart == nil {
                                SancharaPrimaryButton(
                                    title: "Download kundli (PDF)",
                                    isLoading: isPreparingKundli,
                                    kind: .secondary
                                ) {
                                    Task { await prepareKundli() }
                                }
                            }
                        }

                        if let errorMessage {
                            BrutNotice(text: errorMessage)
                        }

                        suggestionsBlock
                        accountBlock
                    }
                    .padding(.horizontal, 24)
                    .padding(.vertical, 24)
                    .frame(maxWidth: 420)
                    .frame(maxWidth: .infinity)
                }
            }
            .navigationTitle(embedded ? "" : "Your profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if !embedded {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Done") { dismiss() }
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(Theme.fg)
                    }
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
        .sheet(isPresented: $showKundli) {
            if let details = profile.details, let chart = profile.chart {
                KundliView(details: details, chart: chart)
            }
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
                            Theme.surface
                        }
                    } else {
                        ZStack {
                            Theme.surface
                            Text("Add photo")
                                .font(.brutMono(10))
                                .foregroundStyle(Theme.muted)
                        }
                    }
                    if isUploadingPhoto {
                        Theme.bg.opacity(0.55)
                        ProgressView().tint(Theme.fg)
                    }
                }
                .frame(width: 64, height: 64)
                .clipShape(RoundedRectangle(cornerRadius: Theme.cornerRadius, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.cornerRadius, style: .continuous)
                        .strokeBorder(Theme.line, lineWidth: Theme.lineWidth)
                )
                .overlay(alignment: .bottomTrailing) {
                    if !isUploadingPhoto {
                        Image(systemName: "camera.fill")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundStyle(Theme.ink)
                            .padding(5)
                            .background(Theme.fg)
                            .overlay(Rectangle().stroke(Theme.ink, lineWidth: 1.5))
                            .offset(x: 4, y: 4)
                    }
                }
            }
            .disabled(isUploadingPhoto)
            .accessibilityLabel(details.avatarUrl == nil ? "Add a profile photo" : "Change profile photo")
            .padding(.bottom, 8)

            Text(details.fullName)
                .font(.brutTitle(24))
                .foregroundStyle(Theme.fg)
            if !embedded {
                // The embedded header's blurb already says this.
                Text("Changing your birth data recomputes your chart.")
                    .font(.brutBody(13))
                    .foregroundStyle(Theme.muted)
            }
        }
    }

    private func detailCard(_ details: BirthProfileDetails) -> some View {
        VStack(spacing: 0) {
            detailRow("Born", value: formattedBirth(details), mono: true)
            BrutDivider(color: Theme.rule, thickness: 1)
            detailRow("Place", value: details.placeName)
            BrutDivider(color: Theme.rule, thickness: 1)
            detailRow("Timezone", value: details.timezone, mono: true)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 4)
        .brutCard()
    }

    private func detailRow(_ label: String, value: String, mono: Bool = false) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(label)
                .font(.brutMono(11))
                .textCase(.uppercase)
                .tracking(1.2)
                .foregroundStyle(Theme.muted)
                .frame(width: 84, alignment: .leading)
            Text(value)
                .font(mono ? .brutMono(13, weight: .medium) : .brutBody(15))
                .foregroundStyle(Theme.fg)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 12)
    }

    private var suggestionsBlock: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Suggestions").eyebrow()
            Text(SuggestionEngine.onDeviceStatus)
                .font(.brutBody(13))
                .foregroundStyle(Theme.fg)
            Text("Follow-up questions are written by Apple Intelligence on this device. Your readings are not sent anywhere for them.")
                .font(.brutBody(12))
                .foregroundStyle(Theme.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .brutBordered()
    }

    private var accountBlock: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Account").eyebrow()

            Button("Sign out") {
                Task {
                    await auth.signOut()
                    dismiss()
                }
            }
            .buttonStyle(BrutButtonStyle(kind: .quiet))

            Button("Delete my account") { confirmDelete = true }
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(Theme.accent)
                .disabled(isDeleting)
                .padding(.top, 4)

            Text("Deleting removes your chart, readings, and alerts permanently.")
                .font(.brutBody(12))
                .foregroundStyle(Theme.muted)
                .fixedSize(horizontal: false, vertical: true)

            Button("Show me around again") { WelcomeTour.reset() }
                .buttonStyle(BrutButtonStyle(kind: .quiet, fullWidth: false))
                .padding(.top, 8)
        }
        .padding(.top, 8)
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
            try await SancharaAPI.saveProfile(
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
            let data = try await SancharaAPI.kundliPDF()
            let name = (profile.details?.firstName ?? "sanchara").lowercased()
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
            try await SancharaAPI.deleteAccount()
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
