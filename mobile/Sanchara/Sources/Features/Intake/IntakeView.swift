import PhotosUI
import SwiftUI

/// Birth-detail intake — the native counterpart of `components/IntakeForm.tsx`,
/// posting to the same `POST /api/profile` route, which computes and stores
/// both charts with the Swiss Ephemeris.
struct IntakeView: View {
    /// Existing details, when the screen is opened to edit rather than to create.
    var initial: BirthProfileDetails?
    /// Present only when shown as a sheet from the profile.
    var onCancel: (() -> Void)?
    /// Called after the chart is built, so the app can move on to the reading.
    var onSaved: () async -> Void

    @Environment(AuthStore.self) private var auth
    @State private var form = IntakeStore()
    @State private var didPrefill = false

    private var isEditing: Bool { initial != nil }

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Birth details").eyebrow()
                        Text(isEditing ? "Update your details" : "Let's build your chart")
                            .font(.system(size: 28, weight: .light))
                            .tracking(-0.5)
                            .foregroundStyle(Theme.fg)
                        Text(
                            isEditing
                                ? "Changing your birth data recomputes your chart."
                                : "Your real chart comes from the date, time, and place you were born."
                        )
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.muted)
                    }

                    SancharaPhotoField(
                        selection: $form.photoItem,
                        preview: form.photoPreview,
                        existingURL: form.existingAvatarURL,
                        isLoading: form.isLoadingPhoto
                    )

                    HStack(spacing: 10) {
                        SancharaField(placeholder: "First name", text: $form.firstName)
                        SancharaField(placeholder: "Last name", text: $form.lastName)
                    }

                    labelled("Birth date") {
                        DatePicker(
                            "",
                            selection: $form.birthDate,
                            in: IntakeStore.earliestBirthDate...Date(),
                            displayedComponents: .date
                        )
                        .datePickerStyle(.wheel)
                        .labelsHidden()
                        .colorScheme(.dark)
                        .frame(maxWidth: .infinity)
                    }

                    labelled("Birth time") {
                        DatePicker("", selection: $form.birthTime, displayedComponents: .hourAndMinute)
                            .datePickerStyle(.wheel)
                            .labelsHidden()
                            .colorScheme(.dark)
                            .frame(maxWidth: .infinity)
                        Text("As close as you know. A wrong hour moves the ascendant.")
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.muted.opacity(0.8))
                    }

                    labelled("Birthplace") { placePicker }

                    if let error = form.errorMessage {
                        Text(error)
                            .font(.system(size: 14))
                            .foregroundStyle(Theme.accent)
                    }

                    SancharaPrimaryButton(
                        title: isEditing ? "Update my details" : "Save & build my chart",
                        isLoading: form.isSaving
                    ) {
                        Task {
                            if await form.save() { await onSaved() }
                        }
                    }
                    .disabled(!form.isComplete || form.isSaving)
                    .opacity(form.isComplete ? 1 : 0.4)

                    if let onCancel {
                        Button("Cancel", action: onCancel)
                            .font(.system(size: 14))
                            .foregroundStyle(Theme.muted)
                            .frame(maxWidth: .infinity)
                    } else {
                        Button("Sign out") { Task { await auth.signOut() } }
                            .font(.system(size: 14))
                            .foregroundStyle(Theme.muted)
                            .frame(maxWidth: .infinity)
                    }
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 32)
                .frame(maxWidth: 420)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .task {
            guard !didPrefill else { return }
            didPrefill = true
            if let initial {
                form.prefill(from: initial)
            } else if let name = AppleSignIn.rememberedName {
                form.firstName = name.first
                form.lastName = name.last
            }
        }
    }

    // MARK: - Birthplace

    @ViewBuilder
    private var placePicker: some View {
        if let place = form.place {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(place.name)
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.fg)
                    Text(place.timezone)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.muted)
                }
                Spacer()
                Button("Change") { form.clearPlace() }
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.accent)
            }
            .padding(12)
            .background(Theme.fieldFill)
            .clipShape(RoundedRectangle(cornerRadius: Theme.cornerRadius))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.cornerRadius)
                    .stroke(Theme.hairline, lineWidth: 1)
            )
        } else {
            SancharaField(placeholder: "City of birth", text: $form.placeQuery)

            if form.isSearching {
                Text("Searching…")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.muted)
            }

            ForEach(form.results) { result in
                Button {
                    form.pick(result)
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(result.name)
                            .font(.system(size: 14))
                            .foregroundStyle(Theme.fg)
                        Text(result.timezone)
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.muted)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 8)
                    .padding(.horizontal, 12)
                    .background(Color.white.opacity(0.03))
                    .clipShape(RoundedRectangle(cornerRadius: Theme.cornerRadius))
                    .contentShape(Rectangle())
                }
            }
        }
    }

    @ViewBuilder
    private func labelled<Content: View>(
        _ title: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.system(size: 13))
                .foregroundStyle(Theme.muted)
            content()
        }
    }
}

/// Form state for intake, including the debounced birthplace lookup.
@Observable
@MainActor
final class IntakeStore {
    static let earliestBirthDate = Calendar.current.date(from: DateComponents(year: 1900, month: 1, day: 1))!

    var firstName = ""
    var lastName = ""
    var birthDate = Calendar.current.date(byAdding: .year, value: -25, to: Date()) ?? Date()
    var birthTime = Calendar.current.date(from: DateComponents(hour: 12, minute: 0)) ?? Date()
    var placeQuery = "" {
        didSet { scheduleSearch() }
    }
    var results: [GeoResult] = []
    var place: GeoResult?
    var isSearching = false
    var isSaving = false
    var errorMessage: String?

    /// Photo picking. `photoJPEG` stays nil unless a new image is chosen, which
    /// is what lets an edit keep the photo already on the profile.
    var photoItem: PhotosPickerItem? {
        didSet {
            guard photoItem != nil, photoItem != oldValue else { return }
            Task { await loadPickedPhoto() }
        }
    }
    var photoPreview: UIImage?
    var photoJPEG: Data?
    var isLoadingPhoto = false
    var existingAvatarURL: URL?

    private var searchTask: Task<Void, Never>?

    var isComplete: Bool {
        !firstName.trimmingCharacters(in: .whitespaces).isEmpty
            && !lastName.trimmingCharacters(in: .whitespaces).isEmpty
            && place != nil
    }

    /// Fills the form from saved details so editing starts where the user left
    /// off. The stored coordinates and timezone stand in for a fresh lookup —
    /// the birthplace has not moved.
    func prefill(from details: BirthProfileDetails) {
        firstName = details.firstName
        lastName = details.lastName
        if let date = Self.dateFormatter.date(from: details.birthDate) { birthDate = date }
        // The picker only reads the time components, so the parsed reference
        // date can be used as-is.
        if let time = Self.timeFormatter.date(from: details.birthTimeShort) { birthTime = time }
        place = GeoResult(
            name: details.placeName,
            lat: details.lat,
            lng: details.lng,
            timezone: details.timezone,
            country: ""
        )
        existingAvatarURL = details.avatarUrl.flatMap(URL.init(string:))
    }

    private func loadPickedPhoto() async {
        guard let photoItem else { return }
        isLoadingPhoto = true
        defer { isLoadingPhoto = false }

        guard
            let data = try? await photoItem.loadTransferable(type: Data.self),
            let image = UIImage(data: data),
            let jpeg = image.avatarJPEG()
        else {
            errorMessage = "That image could not be read. Try another."
            return
        }
        photoPreview = UIImage(data: jpeg) ?? image
        photoJPEG = jpeg
    }

    func pick(_ result: GeoResult) {
        place = result
        results = []
        searchTask?.cancel()
    }

    func clearPlace() {
        place = nil
        placeQuery = ""
        results = []
    }

    /// Debounced so a typed city name is one request, not one per keystroke.
    private func scheduleSearch() {
        searchTask?.cancel()
        let query = placeQuery.trimmingCharacters(in: .whitespaces)
        guard query.count >= 2 else {
            results = []
            isSearching = false
            return
        }
        isSearching = true
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled else { return }
            let found = (try? await SancharaAPI.geocode(query)) ?? []
            guard !Task.isCancelled else { return }
            results = found
            isSearching = false
        }
    }

    func save() async -> Bool {
        guard let place else { return false }
        errorMessage = nil
        isSaving = true
        defer { isSaving = false }

        let input = BirthProfileInput(
            firstName: firstName.trimmingCharacters(in: .whitespaces),
            lastName: lastName.trimmingCharacters(in: .whitespaces),
            birthDate: Self.dateFormatter.string(from: birthDate),
            birthTime: Self.timeFormatter.string(from: birthTime),
            placeName: place.name,
            lat: place.lat,
            lng: place.lng,
            timezone: place.timezone,
            photoJPEG: photoJPEG
        )
        do {
            try await SancharaAPI.saveProfile(input)
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    /// The picked values are wall-clock at the birthplace, exactly as the web
    /// form sends them, so they are formatted in the device's own calendar.
    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private static let timeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "HH:mm"
        return f
    }()
}
