import SwiftUI

@main
struct AstraApp: App {
    // APNs callbacks have no SwiftUI equivalent, so the app keeps a delegate.
    @UIApplicationDelegateAdaptor(AstraAppDelegate.self) private var appDelegate
    @State private var auth = AuthStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(auth)
                .preferredColorScheme(.dark)
        }
    }
}
