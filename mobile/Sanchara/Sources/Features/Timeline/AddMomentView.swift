import SwiftUI

/// Pins one moment by hand.
///
/// Precision is asked for explicitly rather than inferred from a date picker,
/// because most memories are not day-precise. Letting someone say "sometime in
/// 2019" and having it render as such is what keeps the timeline honest.
struct AddMomentView: View {
    let birthDate: String
    let today: String
    let onSave: (NewLifeEvent) -> Void

    @State private var title = ""
    @State private var note = ""
    @State private var date = Date()
    @State private var precision = "month"
    @Environment(\.dismiss) private var dismiss

    private var range: ClosedRange<Date> {
        let start = TimelineDate.parse(birthDate) ?? Date.distantPast
        let end = TimelineDate.parse(today) ?? Date()
        return start <= end ? start...end : end...end
    }

    private var canSave: Bool { !title.trimmingCharacters(in: .whitespaces).isEmpty }

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.bg.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        SancharaField(placeholder: "What happened?", text: $title)

                        VStack(alignment: .leading, spacing: 8) {
                            Text("When").eyebrow()
                            DatePicker("", selection: $date, in: range, displayedComponents: .date)
                                .datePickerStyle(.compact)
                                .labelsHidden()
                                .colorScheme(.dark)
                                .padding(8)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .brutBordered()
                        }

                        VStack(alignment: .leading, spacing: 8) {
                            Text("How sure are you?").eyebrow()
                            BrutSegmented(
                                options: [("day", "That day"), ("month", "That month"), ("year", "That year")],
                                selection: $precision
                            )
                        }

                        VStack(alignment: .leading, spacing: 8) {
                            Text("Anything else").eyebrow()
                            TextField("", text: $note, prompt: Text("Optional").foregroundStyle(Theme.muted), axis: .vertical)
                                .lineLimit(3...6)
                                .font(.system(size: 15))
                                .foregroundStyle(Theme.fg)
                                .padding(12)
                                .brutBordered()
                        }

                        SancharaPrimaryButton(title: "Pin it") { save() }
                            .disabled(!canSave)
                            .opacity(canSave ? 1 : 0.5)
                    }
                    .padding(20)
                }
            }
            .navigationTitle("Pin a moment")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(Theme.fg)
                }
            }
            .toolbarBackground(Theme.bg, for: .navigationBar)
        }
        .tint(Theme.fg)
        .presentationBackground(Theme.bg)
    }

    private func save() {
        onSave(
            NewLifeEvent(
                occurredOn: TimelineDate.format(normalised(date)),
                precision: precision,
                title: title.trimmingCharacters(in: .whitespaces),
                note: note.trimmingCharacters(in: .whitespaces).isEmpty ? nil : note,
                source: "manual"
            )
        )
        dismiss()
    }

    /// Snaps the stored date to the precision the user claimed, so a
    /// month-precision moment is the 1st and a year-precision one is Jan 1.
    /// The server stores a real date either way; this keeps it from implying
    /// a day the user never gave.
    private func normalised(_ value: Date) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? .current
        let parts = calendar.dateComponents([.year, .month, .day], from: value)
        switch precision {
        case "year":
            return calendar.date(from: DateComponents(year: parts.year, month: 1, day: 1)) ?? value
        case "month":
            return calendar.date(from: DateComponents(year: parts.year, month: parts.month, day: 1)) ?? value
        default:
            return value
        }
    }
}
