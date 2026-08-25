import SwiftUI

@main
struct AstraApp: App {
    @State private var auth = AuthStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(auth)
                .preferredColorScheme(.dark)
        }
    }
}
