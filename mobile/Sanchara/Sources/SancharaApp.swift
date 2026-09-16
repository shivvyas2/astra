import SwiftUI

@main
struct SancharaApp: App {
    // APNs callbacks have no SwiftUI equivalent, so the app keeps a delegate.
    @UIApplicationDelegateAdaptor(SancharaAppDelegate.self) private var appDelegate
    @State private var auth = AuthStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(auth)
                .preferredColorScheme(.dark)
        }
    }
}
