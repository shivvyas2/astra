import PhotosUI
import SwiftUI

/// Birth-detail intake — the native counterpart of `components/IntakeForm.tsx`,
/// posting to the same `POST /api/profile` route, which computes and stores
/// both charts with the Swiss Ephemeris.
struct IntakeView: View {
    /// Existing details, when the screen is opened to edit rather than to create.
    var initial: BirthProfileDetails?
    /// Opened from the kundli's "Add birth time": starts with the time picker
    /// showing rather than the "I don't know" panel.
    var addingBirthTime = false
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
            Atmosphere(mood: .dusk)

            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Birth details").eyebrow()
                        Text(addingBirthTime ? "Add your birth time." : isEditing ? "Update your details." : "Let's build your chart.")
                            .brutHeading(40)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(
                            isEditing
                                ? "Changing your birth data recomputes your chart."
                                : "Your real chart comes from the date, time, and place you were born."
                        )
                        .font(.brutBody(15))
                        .foregroundStyle(Theme.muted)
                        .lineSpacing(2)
                        .fixedSize(horizontal: false, vertical: true)
                    }

                    SancharaPhotoField(
                        selection: $form.photoItem,
                        preview: form.photoPreview,
                        existingURL: form.existingAvatarURL,
                        isLoading: form.isLoadingPhoto
                    )

                    HStack(alignment: .top, spacing: 16) {
                        SancharaField(placeholder: "First", text: $form.firstName, label: "First name")
                        SancharaField(placeholder: "Last", text: $form.lastName, label: "Last name")
                    }

                    BirthDetailsFields(form: form)

                    if let error = form.errorMessage {
                        BrutNotice(text: error)
                    }

                    VStack(spacing: 8) {
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
                                .buttonStyle(BrutButtonStyle(kind: .quiet))
                                .frame(minHeight: 44)
                        } else {
                            Button("Sign out") { Task { await auth.signOut() } }
                                .buttonStyle(BrutButtonStyle(kind: .quiet))
                                .frame(minHeight: 44)
                        }
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
                if addingBirthTime { form.birthTimeKnown = true }
            } else if let name = AppleSignIn.rememberedName {
                form.firstName = name.first
                form.lastName = name.last
            }
        }
    }
}

/// Form state for intake, including the debounced birthplace lookup.
@Observable
@MainActor
final class IntakeStore {
    /// 1 January 1900. The fallback is the same instant as a Unix timestamp,
    /// for the calendar that somehow cannot produce it.
    static let earliestBirthDate = Calendar.current.date(from: DateComponents(year: 1900, month: 1, day: 1))
        ?? Date(timeIntervalSince1970: -2_208_988_800)

    var firstName = ""
    var lastName = ""
    var birthDate = Calendar.current.date(byAdding: .year, value: -25, to: Date()) ?? Date()
    var birthTime = Calendar.current.date(from: DateComponents(hour: 12, minute: 0)) ?? Date()
    /// Off when they do not know their birth time: the picker gives way to
    /// an explanation and an optional rough part of day.
    var birthTimeKnown = true
    var approxTime: ApproxTime?
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

    /// Off for a saved person, whose last name is optional.
    var requiresLastName = true

    var isComplete: Bool {
        !firstName.trimmingCharacters(in: .whitespaces).isEmpty
            && (!requiresLastName || !lastName.trimmingCharacters(in: .whitespaces).isEmpty)
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
        birthTimeKnown = details.isTimeKnown
        approxTime = details.isTimeKnown ? nil : ApproxTime(clock: details.birthTimeShort)
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

        var input = birthInput(for: place)
        input.photoJPEG = photoJPEG
        do {
            try await SancharaAPI.saveProfile(input)
            NotificationCenter.default.post(name: .birthDetailsSaved, object: nil)
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    /// The form as the API's birth fields. Shared by the account's own intake
    /// and by a saved person (`PersonFormView`), which adds its own label and
    /// relationship.
    func birthInput(for place: GeoResult) -> BirthProfileInput {
        BirthProfileInput(
            firstName: firstName.trimmingCharacters(in: .whitespaces),
            lastName: lastName.trimmingCharacters(in: .whitespaces),
            birthDate: Self.dateFormatter.string(from: birthDate),
            birthTime: birthTimeKnown ? Self.timeFormatter.string(from: birthTime) : (approxTime?.clock ?? "12:00"),
            placeName: place.name,
            lat: place.lat,
            lng: place.lng,
            timezone: place.timezone,
            birthTimeKnown: birthTimeKnown,
            birthTimeApprox: birthTimeKnown ? nil : approxTime?.rawValue
        )
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
