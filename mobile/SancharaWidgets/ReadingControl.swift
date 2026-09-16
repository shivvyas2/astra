import AppIntents
import SwiftUI
import WidgetKit

/// Sanchara in Control Center, on the Lock Screen, and on the Action button.
///
/// A control is a single action with no room for anything else, so it has to be
/// the one thing worth reaching for without unlocking: the reading. Tapping it
/// runs the same intent Siri does, which means it answers in place rather than
/// launching the app.
@available(iOS 18.0, *)
struct ReadingControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "SancharaReadingControl") {
            ControlWidgetButton(action: OpenKundliIntent()) {
                Label("Kundli", systemImage: "square.on.square.dashed")
            }
        }
        .displayName("Open kundli")
        .description("Opens your birth chart.")
    }
}

/// The widget bundle. Everything this extension vends is listed here.
@main
struct SancharaWidgets: WidgetBundle {
    var body: some Widget {
        ReadingWidget()
        PeriodWidget()
        if #available(iOS 18.0, *) {
            ReadingControl()
        }
    }
}
