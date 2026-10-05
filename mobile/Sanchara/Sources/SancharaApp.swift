import SwiftUI

@main
struct SancharaApp: App {
    // APNs callbacks have no SwiftUI equivalent, so the app keeps a delegate.
    @UIApplicationDelegateAdaptor(SancharaAppDelegate.self) private var appDelegate
    @Environment(\.scenePhase) private var scenePhase
    @State private var auth = AuthStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(auth)
                .preferredColorScheme(.dark)
        }
        .onChange(of: scenePhase) { _, phase in
            // Leaving the app is the moment to book the next background
            // refresh, so the widget moves on before the app is opened again.
            if phase == .background { BackgroundRefresh.schedule() }
        }
        // iOS wakes the app here at a time of its choosing. The widget's own
        // timeline refresh does not depend on this; it is a second way in.
        .backgroundTask(.appRefresh(BackgroundRefresh.identifier)) {
            BackgroundRefresh.schedule()
            await BackgroundRefresh.run()
        }
    }
}
