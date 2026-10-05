import SwiftUI

/// Where a tap inside the admin area goes.
enum AdminRoute: Hashable {
    case user(id: String, name: String?)
    case transcript(id: String, title: String?)
}

/// The admin area: Overview and Users on the frame's pill tabs, with user
/// detail and transcripts pushed on top. Presented full screen over the dark
/// app with its own light palette.
struct AdminRootView: View {
    enum Section: String, CaseIterable { case overview, users }

    @State private var store: AdminStore
    @State private var section: Section
    @State private var path: [AdminRoute] = []
    @Environment(\.dismiss) private var dismiss

    @MainActor
    init(store: AdminStore? = nil, section: Section = .overview) {
        _store = State(initialValue: store ?? AdminStore())
        _section = State(initialValue: section)
    }

    var body: some View {
        NavigationStack(path: $path) {
            AdminFrame(title: "Admin", leading: .close, leadingAction: { dismiss() }) {
                HStack(spacing: 6) {
                    AdminPill(title: "Overview", systemImage: "chart.xyaxis.line", isSelected: section == .overview,
                              onFrame: true, iconOnlyWhenIdle: true) { section = .overview }
                    AdminPill(title: "Users", systemImage: "person.2", isSelected: section == .users,
                              onFrame: true, iconOnlyWhenIdle: true) { section = .users }
                }
                .animation(.easeOut(duration: 0.15), value: section)
            } content: {
                if store.notAdmin {
                    AdminOnlyView()
                } else {
                    switch section {
                    case .overview: AdminOverviewView()
                    case .users: AdminUsersView()
                    }
                }
            }
            .navigationDestination(for: AdminRoute.self) { route in
                switch route {
                case .user(let id, let name):
                    AdminUserDetailView(userID: id, fallbackName: name)
                case .transcript(let id, let title):
                    AdminTranscriptView(conversationID: id, fallbackTitle: title)
                }
            }
        }
        .environment(store)
        .environment(\.colorScheme, .light)
        .tint(AdminTheme.ink)
    }
}

/// "Admins only" — calm, not an error. Shown when the server answers 401/403.
struct AdminOnlyView: View {
    var body: some View {
        VStack {
            AdminMessage(
                systemImage: "lock",
                title: "Admins only",
                detail: "This account doesn't have access to the admin dashboard. If that's a mistake, sign in with the admin account."
            )
            .padding(16)
            Spacer()
        }
        .padding(.top, 12)
    }
}

// MARK: - Entry

extension View {
    /// Presents the admin area full screen.
    func adminCover(isPresented: Binding<Bool>) -> some View {
        fullScreenCover(isPresented: isPresented) {
            AdminRootView()
        }
    }
}

extension View {
    /// Asks `GET /api/admin/me` once per signed-in user when this view
    /// appears. Put it on the screen that holds `AdminEntryRow` — the row
    /// cannot ask for itself while hidden, because a view that draws nothing
    /// never appears.
    func adminGateCheck(_ gate: AdminGate = .shared) -> some View {
        task { await gate.check() }
    }
}

/// "Admin dashboard ›" in the app's dark row style, shown only when
/// `GET /api/admin/me` says this account is an admin. Owns its own cover:
///
///     AdminEntryRow()          // in the screen's VStack
///     .adminGateCheck()        // on the screen
///
/// For everyone else it is no view at all, so it adds no stack spacing.
struct AdminEntryRow: View {
    var gate: AdminGate = .shared
    @State private var isPresented = false

    var body: some View {
        if gate.isAdmin {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Admin").eyebrow()
                        .padding(.bottom, 4)
                    BrutDivider()
                    Button {
                        isPresented = true
                    } label: {
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 3) {
                                Text("Admin dashboard")
                                    .font(.system(size: 16, weight: .semibold))
                                    .foregroundStyle(Theme.fg)
                                Text("Usage, cost, people and their readings.")
                                    .font(.brutBody(13))
                                    .foregroundStyle(Theme.muted)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            Spacer(minLength: 8)
                            Image(systemName: "chevron.right")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(Theme.muted)
                                .accessibilityHidden(true)
                        }
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        .padding(.vertical, 12)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Opens the admin dashboard")
                    BrutDivider()
                }
                .adminCover(isPresented: $isPresented)
                .task { await gate.check() }
        }
    }
}
