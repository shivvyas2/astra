import PhotosUI
import SwiftUI
import UIKit

/// Birth details, the kundli, and account controls — the native counterpart of
/// `app/(app)/app/profile/page.tsx`.
struct ProfileView: View {
    let profile: ProfileStore
    /// True when this view is a tab rather than a sheet: no Done button, no
    /// inline title, the "Hello," hero as the screen's header, and no "View
    /// your kundli" button because the Kundli tab is one tap away.
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
                Atmosphere(mood: .dusk)
                ScrollView {
                    VStack(alignment: .leading, spacing: 32) {
                        if embedded || profile.details != nil {
                            hero(profile.details)
                        }

                        if let details = profile.details {
                            detailTable(details)
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

                        memoryBlock
                        PlanRow()
                        AppIconPicker()
                        helpBlock
                        suggestionsBlock
                        accountBlock
                    }
                    .padding(.horizontal, 24)
                    .padding(.vertical, 24)
                    .frame(maxWidth: 420)
                    .frame(maxWidth: .infinity)
                }
            }
            .clearsTabBar(active: embedded)
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

    /// "Hello, Asha" with the round photo beside it, sitting on an orbit — the
    /// reference's "Hello Taurus," hero. In the tab it is the screen's header.
    private func hero(_ details: BirthProfileDetails?) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("You").eyebrow()
                    VStack(alignment: .leading, spacing: 0) {
                        Text("Hello,")
                            .brutHeading(44)
                        if let first = details?.firstName, !first.isEmpty {
                            Text(first)
                                .font(.brutDisplay(44))
                                .tracking(-44 * 0.035)
                                .foregroundStyle(Theme.accent)
                                .lineLimit(1)
                                .minimumScaleFactor(0.5)
                        }
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityAddTraits(.isHeader)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                if let details {
                    ZStack {
                        OrbitDecoration(color: Theme.fg.opacity(0.3))
                            .frame(width: 140, height: 140)
                        avatarPicker(details)
                    }
                    .frame(width: 140, height: 140)
                }
            }

            Text(
                embedded
                    ? "Your birth details, photo and account."
                    : "Changing your birth data recomputes your chart."
            )
            .font(.brutBody(15))
            .foregroundStyle(Theme.muted)
            .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func avatarPicker(_ details: BirthProfileDetails) -> some View {
        // Changing the photo is its own one-tap action here. Routing it
        // through the birth-details form would mean re-submitting a chart
        // to swap a picture.
        PhotosPicker(selection: $photoItem, matching: .images, photoLibrary: .shared()) {
            AvatarCircle(
                image: nil,
                url: details.avatarUrl.flatMap(URL.init(string:)),
                isLoading: isUploadingPhoto
            )
            .contentShape(Circle())
        }
        .buttonStyle(DipButtonStyle())
        .disabled(isUploadingPhoto)
        .accessibilityLabel(details.avatarUrl == nil ? "Add a profile photo" : "Change profile photo")
    }

    private func detailTable(_ details: BirthProfileDetails) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Birth details").eyebrow()
                .padding(.bottom, 4)
            BrutDivider()
            DataRow(label: "Born", value: formattedBirth(details), valueSize: 20)
            DataRow(label: "Place", value: details.placeName, valueSize: 20)
            DataRow(label: "Timezone", value: details.timezone, valueSize: 20)
        }
    }

    /// What readings remember about the person's life, and the way to
    /// read or delete it.
    private var memoryBlock: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Memory").eyebrow()
                .padding(.bottom, 4)
            BrutDivider()
            NavigationLink {
                KnowledgeView()
            } label: {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("What Astrya knows")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(Theme.fg)
                        Text("Facts from your readings that make them personal. Delete any.")
                            .font(.brutBody(13))
                            .foregroundStyle(Theme.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 8)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.muted)
                        .accessibilityHidden(true)
                }
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .padding(.vertical, 12)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint("Shows what Astrya has learned from your readings")
            BrutDivider()
        }
    }

    private var helpBlock: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Help").eyebrow()
                .padding(.bottom, 4)
            BrutDivider()
            Button {
                WelcomeTour.reset()
            } label: {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Replay the tutorial")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(Theme.fg)
                        Text("What each tab is for, in a minute.")
                            .font(.brutBody(13))
                            .foregroundStyle(Theme.muted)
                    }
                    Spacer(minLength: 8)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.muted)
                        .accessibilityHidden(true)
                }
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .padding(.vertical, 12)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint("Shows the welcome tour again")
            BrutDivider()
        }
    }

    private var suggestionsBlock: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Suggestions").eyebrow()
            Text(SuggestionEngine.onDeviceStatus)
                .font(.brutBody(14))
                .foregroundStyle(Theme.fg)
            Text("Follow-up questions are written by Apple Intelligence on this device. Your readings are not sent anywhere for them.")
                .font(.brutBody(12))
                .foregroundStyle(Theme.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
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
            .buttonStyle(BrutButtonStyle(kind: .secondary))

            VStack(alignment: .leading, spacing: 2) {
                Button {
                    confirmDelete = true
                } label: {
                    Text("Delete my account")
                        .foregroundStyle(Theme.ember)
                }
                .buttonStyle(BrutButtonStyle(kind: .quiet, fullWidth: false))
                .frame(minHeight: 44)
                .disabled(isDeleting)

                Text("Deleting removes your chart, readings, and alerts permanently.")
                    .font(.brutBody(12))
                    .foregroundStyle(Theme.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 4)
            }
        }
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
            let name = (profile.details?.firstName ?? "astrya").lowercased()
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
