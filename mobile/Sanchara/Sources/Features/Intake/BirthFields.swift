import SwiftUI

/// A rough part of the day, for someone who does not know their birth time.
/// Mirrors `APPROX_TIMES` in `lib/profiles/birth.ts`: each is cast for
/// roughly the middle of its span.
enum ApproxTime: String, CaseIterable, Identifiable, Sendable {
    case morning, afternoon, evening, night

    var id: String { rawValue }

    var label: String {
        switch self {
        case .morning: "Morning"
        case .afternoon: "Afternoon"
        case .evening: "Evening"
        case .night: "Night"
        }
    }

    /// The `HH:mm` the server casts the chart for.
    var clock: String {
        switch self {
        case .morning: "09:00"
        case .afternoon: "15:00"
        case .evening: "19:00"
        case .night: "23:00"
        }
    }

    /// The part of day a stored stand-in time means; nil for plain noon.
    init?(clock: String) {
        guard let match = Self.allCases.first(where: { $0.clock == String(clock.prefix(5)) }) else { return nil }
        self = match
    }
}

/// Birthday, time of birth (or "I don't know"), and birthplace — the part of
/// intake that the account's own details and a saved person share.
///
/// When the time is unknown the picker gives way to what that means, in one
/// sentence, and an optional "roughly" row. The server casts the chart for
/// noon (or the middle of the chosen part of day) and flags it, so nothing
/// that depends on the hour is read from it.
struct BirthDetailsFields: View {
    @Bindable var form: IntakeStore
    /// "Their" rather than "your" in the copy.
    var someoneElse = false

    private var whose: String { someoneElse ? "their" : "your" }

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top, spacing: 16) {
                    underlined("Birthday") {
                        DatePicker(
                            "",
                            selection: $form.birthDate,
                            in: IntakeStore.earliestBirthDate...Date(),
                            displayedComponents: .date
                        )
                        .datePickerStyle(.compact)
                        .labelsHidden()
                        .colorScheme(.dark)
                        .tint(Theme.accent)
                        .accessibilityLabel("Birthday")
                    }
                    if form.birthTimeKnown {
                        underlined("Time of birth") {
                            DatePicker("", selection: $form.birthTime, displayedComponents: .hourAndMinute)
                                .datePickerStyle(.compact)
                                .labelsHidden()
                                .colorScheme(.dark)
                                .tint(Theme.accent)
                                .accessibilityLabel("Time of birth")
                        }
                    } else {
                        underlined("Time of birth") {
                            Text(form.approxTime.map { "Roughly \($0.label.lowercased())" } ?? "Unknown")
                                .font(.system(size: 17))
                                .foregroundStyle(Theme.muted)
                        }
                    }
                }

                Toggle(isOn: Binding(
                    get: { !form.birthTimeKnown },
                    set: { unknown in withAnimation(Theme.snap) { form.birthTimeKnown = !unknown } }
                )) {
                    Text(someoneElse ? "I don't know their birth time" : "I don't know my birth time")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(Theme.fg)
                }
                .tint(Theme.accent)
                .frame(minHeight: 44)

                if form.birthTimeKnown {
                    Text("As close as you know. A wrong hour moves the ascendant.")
                        .font(.brutBody(12))
                        .foregroundStyle(Theme.muted)
                        .fixedSize(horizontal: false, vertical: true)
                } else {
                    unknownTimePanel
                }
            }

            placePicker
        }
    }

    /// What an unknown time means, and the optional rough part of day.
    private var unknownTimePanel: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("We'll use noon and avoid anything that depends on the exact hour — \(whose) ascendant, houses and the Moon's exact degree. You can add the time later.")
                .font(.brutBody(14))
                .foregroundStyle(Theme.fg)
                .lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
            VStack(alignment: .leading, spacing: 8) {
                Text("Roughly (optional)").eyebrow()
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(ApproxTime.allCases) { option in
                            BrutChip(text: option.label, active: form.approxTime == option, color: Theme.accent) {
                                withAnimation(Theme.snap) {
                                    form.approxTime = form.approxTime == option ? nil : option
                                }
                            }
                            .accessibilityAddTraits(form.approxTime == option ? .isSelected : [])
                        }
                    }
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .brutBordered(fill: Theme.accent.opacity(0.06), line: Theme.accent.opacity(0.45))
    }

    // MARK: - Birthplace

    @ViewBuilder
    private var placePicker: some View {
        if let place = form.place {
            VStack(alignment: .leading, spacing: 8) {
                Text("Place of birth").eyebrow()
                HStack(alignment: .center, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(place.name)
                            .font(.system(size: 17))
                            .foregroundStyle(Theme.fg)
                        Text(place.timezone)
                            .font(.brutMono(11, weight: .medium))
                            .foregroundStyle(Theme.muted)
                    }
                    Spacer(minLength: 8)
                    Button("Change") { form.clearPlace() }
                        .buttonStyle(BrutButtonStyle(kind: .quiet, fullWidth: false))
                        .frame(minHeight: 44)
                        .accessibilityHint("Clears the birthplace so you can search again")
                }
                .padding(.vertical, 4)
                BrutDivider(color: Theme.line)
            }
        } else {
            VStack(alignment: .leading, spacing: 0) {
                SancharaField(placeholder: "City of birth", text: $form.placeQuery, label: "Place of birth")

                if form.isSearching {
                    Text("Searching…")
                        .font(.brutMono(11))
                        .foregroundStyle(Theme.muted)
                        .padding(.top, 10)
                }

                ForEach(Array(form.results.enumerated()), id: \.element.id) { index, result in
                    Button {
                        form.pick(result)
                    } label: {
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(result.name)
                                    .font(.brutBody(15))
                                    .foregroundStyle(Theme.fg)
                                    .multilineTextAlignment(.leading)
                                Text(result.timezone)
                                    .font(.brutMono(11, weight: .medium))
                                    .foregroundStyle(Theme.muted)
                            }
                            Spacer(minLength: 8)
                            Image(systemName: "chevron.right")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(Theme.muted)
                                .accessibilityHidden(true)
                        }
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        .padding(.vertical, 10)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    if index < form.results.count - 1 {
                        BrutDivider()
                    }
                }
            }
        }
    }

    /// An eyebrow label over a control, with a single quiet line beneath —
    /// the underlined field, for controls that are not text.
    @ViewBuilder
    private func underlined<Content: View>(
        _ title: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).eyebrow()
            content()
                .frame(minHeight: 44, alignment: .leading)
            Rectangle()
                .fill(Theme.line)
                .frame(height: Theme.lineWidth)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
