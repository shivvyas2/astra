import SwiftUI

/// Placeholder root. Replaced by the auth/intake flow in the next task; it
/// exists so the project has something to build and run against.
struct RootView: View {
    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            VStack(spacing: 16) {
                Text("Computed astrology, never guessed").eyebrow()
                Text("ASTRA")
                    .font(.system(size: 56, weight: .bold))
                    .tracking(-1)
                    .foregroundStyle(Theme.fg)
                Text("Your real birth chart, read by the stars.")
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.fg.opacity(0.85))
            }
        }
    }
}

#Preview {
    RootView()
}
