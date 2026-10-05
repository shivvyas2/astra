import SwiftUI

/// Everyone, searchable by name or email, fifty at a time.
struct AdminUsersView: View {
    @Environment(AdminStore.self) private var store
    @State private var text = ""
    @FocusState private var searching: Bool

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 10) {
                searchField
                    .padding(.bottom, 2)

                countLine

                switch store.usersPhase {
                case .failed(let message) where store.users.isEmpty:
                    AdminMessage(systemImage: "exclamationmark", title: "Couldn't load people", detail: message,
                                 actionTitle: "Try again") { Task { await store.reloadUsers() } }
                case .loading where store.users.isEmpty, .idle where store.users.isEmpty:
                    AdminMessage(systemImage: "", title: "Finding people…", isLoading: true)
                default:
                    if store.users.isEmpty {
                        AdminMessage(systemImage: "magnifyingglass", title: "No one matches",
                                     detail: store.query.isEmpty ? nil : "Nothing for “\(store.query)”. Try part of a name or an email.")
                    }
                    ForEach(store.users) { user in
                        NavigationLink(value: AdminRoute.user(id: user.id, name: user.displayName)) {
                            AdminUserCard(user: user, heavy: store.heavyUserIDs.contains(user.id))
                        }
                        .buttonStyle(AdminPressStyle())
                        .onAppear {
                            if user.id == store.users.last?.id { Task { await store.loadMoreUsers() } }
                        }
                    }
                    if store.hasMoreUsers {
                        HStack {
                            Spacer()
                            if store.isLoadingMore {
                                ProgressView().tint(AdminTheme.ink)
                            } else {
                                AdminPill(title: "Load more", systemImage: "arrow.down", isSelected: false) {
                                    Task { await store.loadMoreUsers() }
                                }
                            }
                            Spacer()
                        }
                        .frame(minHeight: 52)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
            .padding(.bottom, 48)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.immediately)
        .refreshable { await store.reloadUsers() }
        .task {
            text = store.query
            if store.users.isEmpty { await store.reloadUsers() }
            // The "Heavy use" chips come from the overview's top ten.
            if store.overview == nil { await store.loadOverview() }
        }
    }

    private var searchField: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 15))
                .foregroundStyle(AdminTheme.muted)
                .accessibilityHidden(true)
            TextField("Search name or email", text: $text)
                .font(.body)
                .foregroundStyle(AdminTheme.ink)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.emailAddress)
                .submitLabel(.search)
                .focused($searching)
                .onChange(of: text) { _, new in store.queryChanged(new) }
                .onSubmit { Task { await store.reloadUsers() } }
            if !text.isEmpty {
                Button {
                    text = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(AdminTheme.faint)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.leading, 18)
        .padding(.trailing, text.isEmpty ? 18 : 2)
        .frame(minHeight: 52)
        .background(Capsule().fill(AdminTheme.raised))
    }

    private var countLine: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(AdminFormat.grouped(store.usersTotal))
                .font(.adminNumber(26))
                .foregroundStyle(AdminTheme.ink)
            Text(store.usersTotal == 1 ? "person" : "people")
                .font(.caption.weight(.medium))
                .foregroundStyle(AdminTheme.muted)
            if !store.query.isEmpty {
                Text("matching “\(store.query)”")
                    .font(.caption)
                    .foregroundStyle(AdminTheme.muted)
                    .lineLimit(1)
            }
            Spacer()
        }
        .padding(.horizontal, 4)
        .accessibilityElement(children: .combine)
    }
}

/// One person: initials, name and email, plan, push dot, and their numbers.
struct AdminUserCard: View {
    let user: AdminUserRow
    var heavy = false
    var now = Date()

    private var activeThisWeek: Bool {
        guard let last = AdminFormat.parseDate(user.lastActiveAt) else { return false }
        return now.timeIntervalSince(last) < 7 * 86_400
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                ZStack(alignment: .bottomTrailing) {
                    AdminAvatar(name: user.displayName, active: activeThisWeek)
                    if user.hasPush {
                        Circle().fill(AdminTheme.ink)
                            .overlay(Circle().strokeBorder(AdminTheme.panel, lineWidth: 2))
                            .frame(width: 12, height: 12)
                            .offset(x: 2, y: 2)
                    }
                }
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(user.displayName)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(AdminTheme.ink)
                            .lineLimit(1)
                        if user.isAdmin { AdminChip(text: "Admin", style: .dark) }
                    }
                    if let email = user.email {
                        Text(email)
                            .font(.footnote)
                            .foregroundStyle(AdminTheme.muted)
                            .lineLimit(1)
                            .truncationMode(.middle)
                    }
                }
                Spacer(minLength: 6)
                VStack(alignment: .trailing, spacing: 4) {
                    AdminChip(text: AdminFormat.label(user.plan ?? "free"))
                    if heavy { AdminChip(text: "Heavy use", style: .lime, systemImage: "flame") }
                }
            }
            HStack(spacing: 0) {
                metric("Readings", AdminFormat.compact(user.readings))
                metric("7 days", AdminFormat.compact(user.readings7d))
                metric("Cost 30d", AdminFormat.money(user.costUsd30d))
                metric("Active", AdminFormat.relative(user.lastActiveAt, now: now))
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .adminPanel()
        .contentShape(RoundedRectangle(cornerRadius: AdminTheme.panelRadius))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spoken)
        .accessibilityAddTraits(.isButton)
    }

    private func metric(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.adminLabel).foregroundStyle(AdminTheme.muted).lineLimit(1)
            Text(value).font(.subheadline.monospacedDigit()).foregroundStyle(AdminTheme.ink).lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var spoken: String {
        var parts = [user.displayName]
        if let email = user.email { parts.append(email) }
        parts.append("\(AdminFormat.label(user.plan ?? "free")) plan")
        if heavy { parts.append("heavy use") }
        if user.isAdmin { parts.append("admin") }
        parts.append("\(AdminFormat.grouped(user.readings)) readings, \(AdminFormat.grouped(user.readings7d)) this week")
        parts.append("\(AdminFormat.money(user.costUsd30d)) in 30 days")
        parts.append("active \(AdminFormat.relative(user.lastActiveAt, now: now))")
        parts.append(user.hasPush ? "push on" : "no push")
        return parts.joined(separator: ", ")
    }
}
