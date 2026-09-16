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
                            Text("WHEN").eyebrow()
                            DatePicker("", selection: $date, in: range, displayedComponents: .date)
                                .datePickerStyle(.compact)
                                .labelsHidden()
                                .colorScheme(.dark)
                        }

                        VStack(alignment: .leading, spacing: 8) {
                            Text("HOW SURE ARE YOU?").eyebrow()
                            Picker("", selection: $precision) {
                                Text("That day").tag("day")
                                Text("That month").tag("month")
                                Text("That year").tag("year")
                            }
                            .pickerStyle(.segmented)
                        }

                        VStack(alignment: .leading, spacing: 8) {
                            Text("ANYTHING ELSE").eyebrow()
                            TextField("", text: $note, prompt: Text("Optional").foregroundStyle(Theme.muted), axis: .vertical)
                                .lineLimit(3...6)
                                .font(.system(size: 15))
                                .foregroundStyle(Theme.fg)
                                .padding(12)
                                .background(Theme.fieldFill)
                                .clipShape(RoundedRectangle(cornerRadius: Theme.cornerRadius))
                                .overlay(
                                    RoundedRectangle(cornerRadius: Theme.cornerRadius)
                                        .stroke(Theme.hairline, lineWidth: 1)
                                )
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
                    Button("Cancel") { dismiss() }.foregroundStyle(Theme.muted)
                }
            }
        }
        .tint(Theme.fg)
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
        calendar.timeZone = TimeZone(identifier: "UTC")!
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
