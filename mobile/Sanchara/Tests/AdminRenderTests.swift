import SwiftUI
import UIKit
import XCTest
@testable import Sanchara

/// Renders each admin screen with sample data, hosted in a real window so
/// scroll views and charts draw (ImageRenderer leaves scroll views blank).
@MainActor
final class AdminRenderTests: XCTestCase {

    /// A window attached to the host app's scene — a sceneless window never
    /// draws in a scene-based app.
    private func makeWindow(height: CGFloat) -> UIWindow {
        let window: UIWindow
        if let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first {
            window = UIWindow(windowScene: scene)
        } else {
            window = UIWindow()
        }
        window.frame = CGRect(x: 0, y: 0, width: 390, height: height)
        return window
    }

    private func render<V: View>(_ view: V, name: String, height: CGFloat = 844) async throws -> UIImage {
        let window = makeWindow(height: height)
        let host = UIHostingController(rootView: view)
        window.rootViewController = host
        window.makeKeyAndVisible()
        // Sleeping, not spinning the run loop, so the main actor is free to run
        // the views' `.task`s and SwiftUI can lay out and commit.
        try await Task.sleep(for: .milliseconds(1500))
        let renderer = UIGraphicsImageRenderer(bounds: window.bounds)
        let image = renderer.image { _ in window.drawHierarchy(in: window.bounds, afterScreenUpdates: true) }
        let url = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("admin-\(name).png")
        try XCTUnwrap(image.pngData()).write(to: url)
        print("ADMIN_RENDER_PATH=\(url.path)")
        window.isHidden = true
        return image
    }

    private func loadedStore() async -> AdminStore {
        let store = AdminStore(service: StubAdminService(), debounce: .zero)
        await store.loadOverview()
        await store.reloadUsers()
        await store.loadUser("u-1")
        await store.loadTranscript("c-1")
        return store
    }

    func testRendersOverview() async throws {
        let store = await loadedStore()
        _ = try await render(AdminRootView(store: store, section: .overview), name: "overview", height: 1900)
    }

    func testRendersUsers() async throws {
        let store = await loadedStore()
        _ = try await render(AdminRootView(store: store, section: .users), name: "users")
    }

    func testRendersDetailTabs() async throws {
        let store = await loadedStore()
        for tab in AdminUserDetailView.Tab.allCases {
            _ = try await render(
                NavigationStack { AdminUserDetailView(userID: "u-1", initialTab: tab) }
                    .environment(store).environment(\.colorScheme, .light),
                name: "detail-\(tab.rawValue.lowercased())",
                height: tab == .memory ? 1900 : 1200
            )
        }
    }

    func testRendersTranscript() async throws {
        let store = await loadedStore()
        _ = try await render(
            NavigationStack { AdminTranscriptView(conversationID: "c-1") }.environment(store),
            name: "transcript"
        )
    }

    func testRendersAdminsOnly() async throws {
        let stub = StubAdminService()
        stub.failWith = AdminAPI.AdminError.notAdmin
        let store = AdminStore(service: stub)
        await store.loadOverview()
        _ = try await render(AdminRootView(store: store), name: "admins-only")
    }

    func testEntryRowTakesNoSpaceForNonAdmins() async throws {
        let stub = StubAdminService()
        stub.isAdmin = false
        let gate = AdminGate(service: stub, currentUser: { "u" })
        let admin = StubAdminService()
        let adminGate = AdminGate(service: admin, currentUser: { "u" })
        func stack(_ g: AdminGate) -> some View {
            VStack(spacing: 32) {
                Color.red.frame(height: 10)
                AdminEntryRow(gate: g)
                Color.red.frame(height: 10)
            }
            .fixedSize(horizontal: false, vertical: true)
            .padding(24)
            .background(Theme.bg)
            .adminGateCheck(g)
        }
        let a = UIHostingController(rootView: stack(gate))
        let b = UIHostingController(rootView: stack(adminGate))
        let w1 = makeWindow(height: 400); w1.rootViewController = a; w1.makeKeyAndVisible()
        try await Task.sleep(for: .milliseconds(800))
        let w2 = makeWindow(height: 400); w2.rootViewController = b; w2.makeKeyAndVisible()
        try await Task.sleep(for: .milliseconds(800))
        XCTAssertEqual(stub.meCalls, 1, "the screen asks the gate while the row is hidden")
        XCTAssertEqual(gate.status, .notAdmin)
        XCTAssertTrue(adminGate.isAdmin)
        let baseline = UIHostingController(rootView: VStack(spacing: 32) {
            Color.red.frame(height: 10)
            Color.red.frame(height: 10)
        }.fixedSize(horizontal: false, vertical: true).padding(24))
        let w0 = makeWindow(height: 400); w0.rootViewController = baseline; w0.makeKeyAndVisible()
        try await Task.sleep(for: .milliseconds(300))
        let base = baseline.sizeThatFits(in: CGSize(width: 390, height: 1000)).height
        let hidden = a.sizeThatFits(in: CGSize(width: 390, height: 1000)).height
        XCTAssertEqual(hidden, base, "a hidden row adds no stack spacing")
        let shown = b.sizeThatFits(in: CGSize(width: 390, height: 1000)).height
        print("ENTRY_ROW_HEIGHTS base=\(base) hidden=\(hidden) shown=\(shown)")
        XCTAssertGreaterThan(shown, hidden + 44)
        _ = try await render(stack(adminGate), name: "entry-row", height: 260)
    }
}
