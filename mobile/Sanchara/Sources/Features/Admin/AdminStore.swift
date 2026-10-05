import Foundation
import Observation

/// Whether the signed-in account is an admin, asked of `GET /api/admin/me`
/// once per signed-in user and remembered for the rest of the session.
///
/// The entry row reads `isAdmin`; nothing else in the app needs to know. A
/// failed check (offline, server down) leaves the status unknown, so the row
/// stays hidden and the next appearance asks again. The server enforces
/// access on every admin route regardless of what this says.
@Observable
@MainActor
final class AdminGate {
    enum Status: Equatable { case unknown, checking, admin, notAdmin }

    static let shared = AdminGate()

    private(set) var status: Status = .unknown
    var isAdmin: Bool { status == .admin }

    private let service: AdminService
    private let currentUser: @MainActor () -> String?
    private var checkedUser: String?

    init(
        service: AdminService = AdminAPI(),
        currentUser: @escaping @MainActor () -> String? = { Supa.client.auth.currentUser?.id.uuidString }
    ) {
        self.service = service
        self.currentUser = currentUser
    }

    /// Asks the server unless this user's answer is already known.
    func check() async {
        let user = currentUser()
        guard let user else {
            status = .notAdmin
            checkedUser = nil
            return
        }
        if user == checkedUser, status == .admin || status == .notAdmin { return }
        if status == .checking { return }
        status = .checking
        do {
            let me = try await service.me()
            status = me.isAdmin ? .admin : .notAdmin
            checkedUser = user
        } catch let error as AdminAPI.AdminError where error == .notAdmin {
            status = .notAdmin
            checkedUser = user
        } catch {
            status = .unknown
        }
    }

    /// Forgets the answer, for sign-out.
    func reset() {
        status = .unknown
        checkedUser = nil
    }
}

/// Everything the admin screens show: the overview, the user search, each
/// opened user and transcript. One per presentation of the cover.
@Observable
@MainActor
final class AdminStore {
    enum Phase: Equatable {
        case idle, loading, ready
        case failed(String)
    }

    /// The 7/30/90-day range pills on the overview.
    static let ranges = [7, 30, 90]
    static let pageSize = 50

    // Access
    private(set) var notAdmin = false

    // Overview
    private(set) var overview: AdminOverview?
    private(set) var overviewPhase: Phase = .idle
    private(set) var range = 30

    // Users
    private(set) var users: [AdminUserRow] = []
    private(set) var usersTotal = 0
    private(set) var usersPhase: Phase = .idle
    private(set) var isLoadingMore = false
    private(set) var query = ""
    var hasMoreUsers: Bool { users.count < usersTotal }

    // Detail and transcripts, by id
    private(set) var details: [String: AdminUserDetail] = [:]
    private(set) var detailErrors: [String: String] = [:]
    private(set) var transcripts: [String: AdminTranscript] = [:]
    private(set) var transcriptErrors: [String: String] = [:]

    /// Ids in the overview's top ten by 30-day cost: they get a "Heavy use" chip.
    var heavyUserIDs: Set<String> { Set(overview?.topUsers.map(\.id) ?? []) }

    private let service: AdminService
    private let debounce: Duration
    private var searchTask: Task<Void, Never>?
    /// Bumped by every new search, so a slow older response cannot land on
    /// top of a newer one.
    private var searchGeneration = 0

    init(service: AdminService = AdminAPI(), debounce: Duration = .milliseconds(350)) {
        self.service = service
        self.debounce = debounce
    }

    // MARK: Overview

    func loadOverview(days: Int? = nil) async {
        if let days { range = days }
        let requested = range
        if overview == nil { overviewPhase = .loading }
        do {
            let result = try await service.overview(days: requested)
            guard requested == range else { return }
            overview = result
            overviewPhase = .ready
        } catch {
            guard requested == range else { return }
            overviewPhase = handle(error)
        }
    }

    func selectRange(_ days: Int) async {
        guard days != range else { return }
        await loadOverview(days: days)
    }

    // MARK: Users

    /// Called on every keystroke. Waits for typing to pause before asking.
    func queryChanged(_ text: String) {
        guard text != query else { return }
        query = text
        searchTask?.cancel()
        let delay = debounce
        searchTask = Task { [weak self] in
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled else { return }
            await self?.reloadUsers()
        }
    }

    /// The first page for the current query: pull-to-refresh, first load,
    /// and the end of a debounce.
    func reloadUsers() async {
        searchGeneration += 1
        let generation = searchGeneration
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if users.isEmpty { usersPhase = .loading }
        do {
            let page = try await service.users(query: q, limit: Self.pageSize, offset: 0)
            guard generation == searchGeneration else { return }
            users = page.users
            usersTotal = page.total
            usersPhase = .ready
        } catch {
            guard generation == searchGeneration, !(error is CancellationError) else { return }
            usersPhase = handle(error)
        }
    }

    /// The next page, when the last row comes on screen.
    func loadMoreUsers() async {
        guard hasMoreUsers, !isLoadingMore, usersPhase == .ready else { return }
        let generation = searchGeneration
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let page = try await service.users(query: query.trimmingCharacters(in: .whitespacesAndNewlines),
                                               limit: Self.pageSize, offset: users.count)
            guard generation == searchGeneration else { return }
            let seen = Set(users.map(\.id))
            users += page.users.filter { !seen.contains($0.id) }
            usersTotal = page.users.isEmpty ? users.count : page.total
        } catch {
            guard generation == searchGeneration else { return }
            _ = handle(error)
        }
    }

    // MARK: Detail and transcript

    func loadUser(_ id: String) async {
        detailErrors[id] = nil
        do {
            details[id] = try await service.user(id: id)
        } catch {
            if case .failed(let message) = handle(error) { detailErrors[id] = message }
        }
    }

    func loadTranscript(_ id: String) async {
        transcriptErrors[id] = nil
        do {
            transcripts[id] = try await service.conversation(id: id)
        } catch {
            if case .failed(let message) = handle(error) { transcriptErrors[id] = message }
        }
    }

    /// 401/403 flips the whole cover to "Admins only"; anything else is a
    /// message for the screen that asked.
    private func handle(_ error: Error) -> Phase {
        if let admin = error as? AdminAPI.AdminError, admin == .notAdmin {
            notAdmin = true
            return .failed(admin.localizedDescription)
        }
        if (error as? URLError)?.code == .cancelled || error is CancellationError {
            return .idle
        }
        return .failed(error.localizedDescription)
    }
}
