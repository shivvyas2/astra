import Charts
import SwiftUI

/// One person: who they are, their numbers, and four views of what they did —
/// a timeline, their chats, what Astrya remembers, and daily usage.
struct AdminUserDetailView: View {
    enum Tab: String, CaseIterable, Identifiable {
        case timeline = "Timeline", chats = "Chats", memory = "Memory", usage = "Usage"
        var id: String { rawValue }
        var systemImage: String {
            switch self {
            case .timeline: "point.3.connected.trianglepath.dotted"
            case .chats: "text.bubble"
            case .memory: "brain"
            case .usage: "chart.bar"
            }
        }
    }

    let userID: String
    var fallbackName: String?
    @State private var tab: Tab
    @State private var visibleMonth: String?
    @Environment(AdminStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    init(userID: String, fallbackName: String? = nil, initialTab: Tab = .timeline) {
        self.userID = userID
        self.fallbackName = fallbackName
        _tab = State(initialValue: initialTab)
    }

    private var detail: AdminUserDetail? { store.details[userID] }

    var body: some View {
        AdminFrame(
            title: detail?.user.displayName ?? fallbackName ?? "Person",
            leading: .back,
            leadingAction: { dismiss() }
        ) {
            if let plan = detail?.user.plan {
                AdminChip(text: AdminFormat.label(plan), style: .plain)
                    .padding(.trailing, 6)
            }
        } content: {
            Group {
                if let detail {
                    content(detail)
                } else if let message = store.detailErrors[userID] {
                    VStack {
                        AdminMessage(systemImage: "exclamationmark", title: "Couldn't load this person", detail: message,
                                     actionTitle: "Try again") { Task { await store.loadUser(userID) } }
                        Spacer()
                    }
                    .padding(16)
                } else {
                    VStack {
                        AdminMessage(systemImage: "", title: "Opening their file…", isLoading: true)
                        Spacer()
                    }
                    .padding(16)
                }
            }
        }
        .task { if detail == nil { await store.loadUser(userID) } }
    }

    private func content(_ d: AdminUserDetail) -> some View {
        let months = AdminTimelineGrouping.months(d.timeline)
        return ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                AdminProfileCard(user: d.user, heavy: store.heavyUserIDs.contains(d.user.id))
                    .padding(.horizontal, 16)

                AdminStatStrip(stats: stats(d.stats))

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(Tab.allCases) { t in
                            AdminPill(title: t.rawValue, systemImage: t.systemImage, isSelected: tab == t, iconWhenIdle: false) { tab = t }
                        }
                    }
                    .padding(.horizontal, 16)
                }

                switch tab {
                case .timeline:
                    AdminTimelineView(months: months, visibleMonth: $visibleMonth) { event in
                        guard let ref = event.refId, d.conversations.contains(where: { $0.id == ref }) else { return nil }
                        return AdminRoute.transcript(id: ref, title: event.title)
                    }
                case .chats:
                    AdminChatsList(conversations: d.conversations)
                        .padding(.horizontal, 16)
                case .memory:
                    AdminMemoryView(memory: d.memory)
                        .padding(.horizontal, 16)
                case .usage:
                    AdminUsagePanel(usage: d.usage, stats: d.stats)
                        .padding(.horizontal, 16)
                }
            }
            .padding(.top, 12)
            .padding(.bottom, tab == .timeline ? 24 : 48)
        }
        .scrollIndicators(.hidden)
        .refreshable { await store.loadUser(userID) }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if tab == .timeline, months.count > 1 {
                AdminMonthScrubber(months: months, selection: $visibleMonth)
                    .padding(.horizontal, 12)
                    .padding(.bottom, 8)
            }
        }
    }

    private func stats(_ s: AdminUserDetail.Stats) -> [AdminStat] {
        [
            AdminStat(label: "Readings", value: AdminFormat.compact(s.readings), note: "\(AdminFormat.compact(s.deepReadings)) deep",
                      systemImage: "sparkles", highlighted: true, spokenValue: AdminFormat.grouped(s.readings)),
            AdminStat(label: "Cost, all time", value: AdminFormat.moneyNumber(s.costUsd), unit: "USD",
                      note: "\(AdminFormat.money(s.costUsd30d)) in 30d", systemImage: "dollarsign", spokenValue: AdminFormat.money(s.costUsd)),
            AdminStat(label: "Facts", value: AdminFormat.compact(s.facts), note: "\(AdminFormat.compact(s.summaries)) summaries",
                      systemImage: "brain", spokenValue: AdminFormat.grouped(s.facts)),
            AdminStat(label: "Predictions", value: AdminFormat.compact(s.predictionsOpen), unit: "open",
                      note: "\(s.predictionsHappened) happened · \(s.predictionsDidnt) didn't", systemImage: "scope",
                      spokenValue: "\(s.predictionsOpen) open"),
            AdminStat(label: "Life events", value: AdminFormat.compact(s.lifeEvents), systemImage: "pin",
                      spokenValue: AdminFormat.grouped(s.lifeEvents)),
            AdminStat(label: "Alerts", value: AdminFormat.compact(s.alerts), note: "\(AdminFormat.compact(s.dailyReadings)) daily readings",
                      systemImage: "bell", spokenValue: AdminFormat.grouped(s.alerts)),
            AdminStat(label: "Push devices", value: AdminFormat.compact(s.pushDevices), systemImage: "iphone",
                      spokenValue: AdminFormat.grouped(s.pushDevices)),
        ]
    }
}

// MARK: - Profile card

struct AdminProfileCard: View {
    let user: AdminUserDetail.Profile
    var heavy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 14) {
                AdminAvatar(name: user.displayName, active: true, size: 60)
                VStack(alignment: .leading, spacing: 4) {
                    Text(user.displayName)
                        .font(.adminTitle(24))
                        .foregroundStyle(AdminTheme.ink)
                        .lineLimit(2)
                    if let email = user.email {
                        Text(email).font(.footnote).foregroundStyle(AdminTheme.muted).lineLimit(1).truncationMode(.middle)
                    }
                    HStack(spacing: 6) {
                        AdminChip(text: AdminFormat.label(user.plan ?? "free"))
                        if heavy { AdminChip(text: "Heavy use", style: .lime, systemImage: "flame") }
                        if user.isAdmin { AdminChip(text: "Admin", style: .dark) }
                    }
                    .padding(.top, 2)
                }
                Spacer(minLength: 0)
            }

            if let birth = user.birth {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Born").font(.adminLabel).foregroundStyle(AdminTheme.muted)
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(birthLine(birth))
                            .font(.body)
                            .foregroundStyle(AdminTheme.ink)
                            .fixedSize(horizontal: false, vertical: true)
                        if !birth.timeKnown {
                            AdminChip(text: "time unknown", style: .outline, systemImage: "clock")
                        }
                    }
                    if let place = birth.place {
                        Text([place, birth.timezone].compactMap { $0 }.joined(separator: " · "))
                            .font(.footnote)
                            .foregroundStyle(AdminTheme.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .accessibilityElement(children: .combine)
            }

            if let chart = user.chart {
                Grid(alignment: .topLeading, horizontalSpacing: 16, verticalSpacing: 12) {
                    GridRow {
                        chartValue("Lagna", chart.lagna)
                        chartValue("Moon", chart.moonSign)
                        chartValue("Sun", chart.sunSign)
                    }
                    GridRow {
                        chartValue(
                            "Dasha",
                            [chart.mahadasha, chart.antardasha].compactMap { $0 }.joined(separator: " / "),
                            note: chart.antardashaEnd.flatMap(AdminFormat.birthDate).map { "until \($0)" }
                        )
                        .gridCellColumns(3)
                    }
                }
            }

            HStack(spacing: 6) {
                Text("Joined \(AdminFormat.parseDate(user.createdAt).map { AdminFormat.shortDate($0) } ?? "—")")
                Text("·")
                Text("active \(AdminFormat.relative(user.lastActiveAt))")
            }
            .font(.caption)
            .foregroundStyle(AdminTheme.muted)
            .accessibilityElement(children: .combine)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .adminPanel()
    }

    private func birthLine(_ b: AdminUserDetail.Birth) -> String {
        let date = AdminFormat.birthDate(b.date) ?? "Date not given"
        guard b.timeKnown, let time = AdminFormat.clock(b.time) else { return date }
        return "\(date) · \(time)"
    }

    @ViewBuilder
    private func chartValue(_ label: String, _ value: String?, note: String? = nil) -> some View {
        if let value, !value.isEmpty {
            VStack(alignment: .leading, spacing: 3) {
                Text(label).font(.adminLabel).foregroundStyle(AdminTheme.muted)
                Text(value).font(.system(size: 20, weight: .light)).foregroundStyle(AdminTheme.ink)
                    .lineLimit(1).minimumScaleFactor(0.7)
                if let note { Text(note).font(.caption2).foregroundStyle(AdminTheme.muted) }
            }
            .accessibilityElement(children: .combine)
        }
    }
}

// MARK: - Timeline

/// The reference's timeline on a phone: months run left to right as pages,
/// each hanging from a lime node on a thin rail, with that month's events
/// stacked down a stem and branching off it.
///
/// Horizontal is kept because each page is itself a short vertical list —
/// the eye scans down within a month and swipes between months, and the
/// scrubber pinned at the bottom jumps straight to any month. A month with
/// many events shows the first twelve and expands in place.
struct AdminTimelineView: View {
    let months: [AdminTimelineMonth]
    @Binding var visibleMonth: String?
    /// Where a tap on an event goes, if anywhere.
    var route: (AdminUserDetail.TimelineEvent) -> AdminRoute?

    @State private var expanded: Set<String> = []
    private static let cap = 12

    var body: some View {
        if months.isEmpty {
            AdminMessage(systemImage: "calendar", title: "Nothing yet", detail: "Their timeline fills in as they read and talk.")
                .padding(.horizontal, 16)
        } else {
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(alignment: .top, spacing: 0) {
                    ForEach(months) { month in
                        column(month)
                            .containerRelativeFrame(.horizontal) { width, _ in width * 0.86 }
                            .id(month.id)
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.viewAligned)
            .scrollPosition(id: $visibleMonth, anchor: .leading)
            .contentMargins(.horizontal, 16, for: .scrollContent)
            .onAppear { if visibleMonth == nil { visibleMonth = months.last?.id } }
        }
    }

    private func column(_ month: AdminTimelineMonth) -> some View {
        let isExpanded = expanded.contains(month.id)
        let shown = isExpanded ? month.events : Array(month.events.prefix(Self.cap))
        return VStack(alignment: .leading, spacing: 0) {
            // The rail: a thin line running through every column, the node on it.
            ZStack(alignment: .leading) {
                Rectangle().fill(AdminTheme.line).frame(height: 1)
                AdminIconDot(systemImage: "calendar", highlighted: true, size: 40)
            }
            .frame(height: 40)

            HStack(alignment: .top, spacing: 0) {
                // The stem down from the node.
                Rectangle().fill(AdminTheme.line).frame(width: 1)
                    .padding(.leading, 19.5)
                VStack(alignment: .leading, spacing: 10) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text(month.label)
                            .font(.adminTitle(24))
                            .foregroundStyle(AdminTheme.ink)
                        Text([month.year.map(String.init), "\(month.events.count) event\(month.events.count == 1 ? "" : "s")"]
                            .compactMap { $0 }.joined(separator: " · "))
                            .font(.caption)
                            .foregroundStyle(AdminTheme.muted)
                    }
                    .padding(.leading, 14)
                    .padding(.top, 10)
                    .padding(.bottom, 4)
                    .accessibilityElement(children: .combine)
                    .accessibilityAddTraits(.isHeader)

                    ForEach(shown) { event in
                        branch(event)
                    }

                    if month.events.count > Self.cap {
                        AdminPill(
                            title: isExpanded ? "Show fewer" : "Show all \(month.events.count)",
                            systemImage: isExpanded ? "chevron.up" : "chevron.down",
                            isSelected: false
                        ) {
                            if isExpanded { expanded.remove(month.id) } else { expanded.insert(month.id) }
                        }
                        .padding(.leading, 14)
                    }
                }
            }
            .padding(.bottom, 12)
        }
        .padding(.trailing, 0)
    }

    /// The elbow from the stem to an event.
    private func branch(_ event: AdminUserDetail.TimelineEvent) -> some View {
        HStack(alignment: .center, spacing: 0) {
            Rectangle().fill(AdminTheme.line).frame(width: 14, height: 1)
            if let route = route(event) {
                NavigationLink(value: route) { AdminEventView(event: event, tappable: true) }
                    .buttonStyle(AdminPressStyle())
            } else {
                AdminEventView(event: event, tappable: false)
            }
        }
        .padding(.trailing, 10)
    }
}

/// One event: a dark capsule for the everyday ones (a reading, an alert),
/// like the reference's "Aspirin ×2", and a panel for the ones worth a look.
struct AdminEventView: View {
    let event: AdminUserDetail.TimelineEvent
    var tappable = false

    static func icon(for kind: String) -> String {
        switch kind.lowercased() {
        case "signup", "joined", "account": "person.badge.plus"
        case "reading", "deep_reading", "message": "sparkles"
        case "conversation", "chat": "text.bubble"
        case "fact": "brain"
        case "summary", "memory": "text.alignleft"
        case "prediction": "scope"
        case "life_event", "moment": "pin"
        case "alert", "push": "bell"
        case "daily", "daily_reading": "sun.horizon"
        case "device": "iphone"
        default: "circle"
        }
    }

    static func isCompact(_ kind: String) -> Bool {
        ["reading", "deep_reading", "message", "alert", "push", "daily", "daily_reading", "device"].contains(kind.lowercased())
    }

    private var when: String { event.date.map { AdminFormat.dayAndTime($0) } ?? event.at }

    var body: some View {
        Group {
            if Self.isCompact(event.kind) {
                HStack(spacing: 10) {
                    Image(systemName: Self.icon(for: event.kind))
                        .font(.system(size: 12))
                        .foregroundStyle(AdminTheme.ink)
                        .frame(width: 32, height: 32)
                        .background(Circle().fill(AdminTheme.raised))
                    VStack(alignment: .leading, spacing: 1) {
                        Text(event.title.isEmpty ? AdminFormat.label(event.kind) : event.title)
                            .font(.footnote)
                            .foregroundStyle(AdminTheme.onFrame)
                            .lineLimit(1)
                        Text(when).font(.caption2).foregroundStyle(AdminTheme.onFrameMuted)
                    }
                    Spacer(minLength: 4)
                    if tappable {
                        Image(systemName: "chevron.right").font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(AdminTheme.onFrameMuted)
                    }
                }
                .padding(.leading, 6)
                .padding(.trailing, 14)
                .frame(minHeight: 44)
                .background(Capsule().fill(AdminTheme.frameRaised))
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(AdminFormat.label(event.kind))
                                .font(.adminLabel)
                                .foregroundStyle(AdminTheme.muted)
                            Text(event.title.isEmpty ? AdminFormat.label(event.kind) : event.title)
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(AdminTheme.ink)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 6)
                        AdminIconDot(systemImage: Self.icon(for: event.kind), size: 32)
                    }
                    if let detail = event.detail, !detail.isEmpty {
                        Text(detail)
                            .font(.footnote)
                            .foregroundStyle(AdminTheme.inkSoft)
                            .lineLimit(4)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Text(when).font(.caption2).foregroundStyle(AdminTheme.muted)
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .adminPanel()
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel([AdminFormat.label(event.kind), event.title, event.detail, when].compactMap { $0 }
            .filter { !$0.isEmpty }.joined(separator: ", "))
        .accessibilityAddTraits(tappable ? .isButton : [])
    }
}

/// The month scrubber pinned at the bottom: a white pill bar of months, each
/// with a lime count badge, the visible one in a dark capsule.
struct AdminMonthScrubber: View {
    let months: [AdminTimelineMonth]
    @Binding var selection: String?

    var body: some View {
        HStack(spacing: 6) {
            VStack(spacing: 0) {
                Image(systemName: "calendar").font(.system(size: 12))
                Text(yearLabel).font(.system(size: 9, weight: .semibold).monospacedDigit())
            }
            .foregroundStyle(AdminTheme.onFrame)
            .frame(width: 44, height: 44)
            .background(Circle().fill(AdminTheme.frame))
            .accessibilityHidden(true)

            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 2) {
                        ForEach(months) { month in
                            let active = month.id == selection
                            Button {
                                withAnimation(.easeOut(duration: 0.3)) { selection = month.id }
                            } label: {
                                HStack(spacing: 5) {
                                    Text(month.label)
                                        .font(.caption.weight(active ? .semibold : .regular))
                                        .foregroundStyle(active ? AdminTheme.onFrame : AdminTheme.inkSoft)
                                    AdminCountBadge(count: month.events.count)
                                }
                                .padding(.horizontal, 10)
                                .frame(minHeight: 44)
                                .background(Capsule().fill(active ? AdminTheme.frame : .clear))
                                .contentShape(Capsule())
                            }
                            .buttonStyle(.plain)
                            .id(month.id)
                            .accessibilityLabel("\(month.label) \(month.year.map(String.init) ?? ""), \(month.events.count) events")
                            .accessibilityAddTraits(active ? [.isButton, .isSelected] : .isButton)
                        }
                    }
                }
                .onAppear { if let selection { proxy.scrollTo(selection, anchor: .trailing) } }
                .onChange(of: selection) { _, new in
                    guard let new else { return }
                    withAnimation(.easeOut(duration: 0.3)) { proxy.scrollTo(new, anchor: .center) }
                }
            }
        }
        .padding(4)
        .background(Capsule().fill(AdminTheme.raised))
        .overlay(Capsule().strokeBorder(AdminTheme.rule, lineWidth: 1))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Months")
    }

    private var yearLabel: String {
        let year = months.first { $0.id == selection }?.year ?? months.last?.year
        return year.map(String.init) ?? ""
    }
}

// MARK: - Chats

struct AdminChatsList: View {
    let conversations: [AdminUserDetail.Conversation]

    var body: some View {
        if conversations.isEmpty {
            AdminMessage(systemImage: "text.bubble", title: "No chats yet")
        } else {
            LazyVStack(spacing: 10) {
                ForEach(conversations.sorted { ($0.lastMessageAt ?? $0.createdAt ?? "") > ($1.lastMessageAt ?? $1.createdAt ?? "") }) { c in
                    NavigationLink(value: AdminRoute.transcript(id: c.id, title: c.title)) {
                        HStack(spacing: 12) {
                            AdminIconDot(systemImage: "text.bubble", size: 40)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(c.title?.isEmpty == false ? c.title! : "Untitled chat")
                                    .font(.subheadline.weight(.medium))
                                    .foregroundStyle(AdminTheme.ink)
                                    .lineLimit(2)
                                    .multilineTextAlignment(.leading)
                                HStack(spacing: 6) {
                                    if let mode = c.mode { AdminChip(text: AdminFormat.label(mode)) }
                                    Text("\(c.messages) messages · \(AdminFormat.relative(c.lastMessageAt ?? c.createdAt))")
                                        .font(.caption)
                                        .foregroundStyle(AdminTheme.muted)
                                }
                            }
                            Spacer(minLength: 6)
                            Image(systemName: "chevron.right")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(AdminTheme.faint)
                        }
                        .padding(14)
                        .frame(minHeight: 64)
                        .adminPanel()
                        .contentShape(RoundedRectangle(cornerRadius: AdminTheme.panelRadius))
                    }
                    .buttonStyle(AdminPressStyle())
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(c.title ?? "Untitled chat"), \(c.mode.map(AdminFormat.label) ?? ""), \(c.messages) messages, last \(AdminFormat.relative(c.lastMessageAt ?? c.createdAt))")
                    .accessibilityAddTraits(.isButton)
                }
            }
        }
    }
}

// MARK: - Memory

struct AdminMemoryView: View {
    let memory: AdminUserDetail.Memory

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            if memory.facts.isEmpty && memory.summaries.isEmpty && memory.predictions.isEmpty {
                AdminMessage(systemImage: "brain", title: "Nothing remembered yet")
            }

            if !memory.facts.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    AdminSectionHeader(title: "Facts", count: memory.facts.count)
                    ForEach(AdminFactGrouping.groups(memory.facts), id: \.category) { group in
                        VStack(alignment: .leading, spacing: 0) {
                            HStack(spacing: 8) {
                                Text(AdminFactGrouping.title(group.category))
                                    .font(.footnote.weight(.semibold))
                                    .foregroundStyle(AdminTheme.ink)
                                AdminCountBadge(count: group.facts.count)
                                Spacer()
                            }
                            .padding(.bottom, 6)
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel("\(AdminFactGrouping.title(group.category)), \(group.facts.count)")
                            .accessibilityAddTraits(.isHeader)
                            ForEach(Array(group.facts.enumerated()), id: \.element.id) { index, fact in
                                if index > 0 { Rectangle().fill(AdminTheme.rule).frame(height: 1) }
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(fact.fact)
                                        .font(.subheadline)
                                        .foregroundStyle(AdminTheme.ink)
                                        .fixedSize(horizontal: false, vertical: true)
                                    Text(factMeta(fact))
                                        .font(.caption2)
                                        .foregroundStyle(AdminTheme.muted)
                                }
                                .padding(.vertical, 10)
                                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                                .accessibilityElement(children: .combine)
                            }
                        }
                        .padding(14)
                        .adminPanel()
                    }
                }
            }

            if !memory.summaries.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    AdminSectionHeader(title: "Conversation summaries", count: memory.summaries.count)
                    ForEach(memory.summaries) { s in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(s.summary)
                                .font(.subheadline)
                                .foregroundStyle(AdminTheme.ink)
                                .fixedSize(horizontal: false, vertical: true)
                            HStack(spacing: 6) {
                                ForEach(s.topics.prefix(4), id: \.self) { AdminChip(text: AdminFormat.label($0)) }
                                Spacer(minLength: 4)
                                Text(AdminFormat.relative(s.lastMessageAt)).font(.caption2).foregroundStyle(AdminTheme.muted)
                            }
                        }
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .adminPanel()
                        .accessibilityElement(children: .combine)
                    }
                }
            }

            if !memory.predictions.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    AdminSectionHeader(title: "Predictions", count: memory.predictions.count)
                    ForEach(memory.predictions) { p in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack(spacing: 6) {
                                AdminChip(text: Self.statusLabel(p.status), style: Self.statusStyle(p.status))
                                if let topic = p.topic { AdminChip(text: AdminFormat.label(topic), style: .outline) }
                                Spacer(minLength: 4)
                                Text(p.windowLabel).font(.caption.monospacedDigit()).foregroundStyle(AdminTheme.muted)
                            }
                            Text(p.claim)
                                .font(.subheadline)
                                .foregroundStyle(AdminTheme.ink)
                                .fixedSize(horizontal: false, vertical: true)
                            if let confidence = p.confidence {
                                Text(AdminFormat.label(confidence)).font(.caption2).foregroundStyle(AdminTheme.muted)
                            }
                        }
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .adminPanel()
                        .accessibilityElement(children: .combine)
                    }
                }
            }
        }
    }

    private func factMeta(_ f: AdminUserDetail.Fact) -> String {
        [
            f.confidence.map { "confidence \(AdminFormat.percent($0 > 1 ? $0 / 100 : $0))" },
            f.source.map { "from \($0.replacingOccurrences(of: "_", with: " "))" },
            f.updatedAt.map { AdminFormat.relative($0) },
        ].compactMap { $0 }.joined(separator: " · ")
    }

    static func statusLabel(_ status: String) -> String {
        switch status.lowercased() {
        case "open": "Open"
        case "happened": "Happened"
        case "didnt", "didn't", "missed": "Didn't happen"
        case "unsure": "Not sure"
        default: AdminFormat.label(status)
        }
    }

    static func statusStyle(_ status: String) -> AdminChip.Style {
        switch status.lowercased() {
        case "happened": .lime
        case "didnt", "didn't", "missed": .dark
        case "unsure": .outline
        default: .plain
        }
    }
}

// MARK: - Usage

struct AdminUsagePanel: View {
    let usage: [AdminUserDetail.UsageDay]
    let stats: AdminUserDetail.Stats

    private struct Day: Identifiable {
        let date: Date
        let readings: Int
        let cost: Double
        var id: Date { date }
    }

    var body: some View {
        let days = usage.compactMap { u in u.date.map { Day(date: $0, readings: u.readings, cost: u.costUsd) } }
            .sorted { $0.date < $1.date }
        let peak = days.map(\.readings).max() ?? 0
        let totalReadings = days.map(\.readings).reduce(0, +)
        let totalCost = days.map(\.cost).reduce(0, +)

        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                Text("Daily readings").font(.adminTitle(22)).foregroundStyle(AdminTheme.ink)
                Spacer()
                Text("\(days.count) days").font(.caption).foregroundStyle(AdminTheme.muted)
            }

            if days.isEmpty {
                Text("No usage recorded.")
                    .font(.subheadline)
                    .foregroundStyle(AdminTheme.muted)
                    .frame(maxWidth: .infinity, minHeight: 120)
            } else {
                Chart(days) { d in
                    BarMark(x: .value("Day", d.date, unit: .day), y: .value("Readings", d.readings))
                        .foregroundStyle(d.readings == peak && peak > 0 ? AdminTheme.lime : AdminTheme.frame.opacity(0.75))
                        .clipShape(Capsule())
                }
                .chartYAxis {
                    AxisMarks(position: .leading, values: .automatic(desiredCount: 3)) { _ in
                        AxisGridLine().foregroundStyle(AdminTheme.rule)
                        AxisValueLabel().foregroundStyle(AdminTheme.muted).font(.caption2)
                    }
                }
                .chartXAxis {
                    AxisMarks(values: .automatic(desiredCount: 4)) { _ in
                        AxisValueLabel(format: .dateTime.day().month(.abbreviated)).foregroundStyle(AdminTheme.muted).font(.caption2)
                    }
                }
                .frame(height: 150)
                .accessibilityLabel("Readings per day")
                .accessibilityValue("\(totalReadings) readings over \(days.count) days, peak \(peak) in a day")

                Text("Cost per day").font(.adminLabel).foregroundStyle(AdminTheme.muted)
                Chart(days) { d in
                    AreaMark(x: .value("Day", d.date, unit: .day), y: .value("Cost", d.cost))
                        .interpolationMethod(.monotone)
                        .foregroundStyle(AdminTheme.lime.opacity(0.6))
                    LineMark(x: .value("Day", d.date, unit: .day), y: .value("Cost", d.cost))
                        .interpolationMethod(.monotone)
                        .foregroundStyle(AdminTheme.ink.opacity(0.7))
                        .lineStyle(StrokeStyle(lineWidth: 1.2))
                }
                .chartYAxis(.hidden)
                .chartXAxis(.hidden)
                .frame(height: 56)
                .accessibilityLabel("Cost per day")
                .accessibilityValue("\(AdminFormat.money(totalCost)) in total")
            }

            HStack(alignment: .firstTextBaseline, spacing: 18) {
                total("Readings", AdminFormat.compact(totalReadings))
                total("Cost", AdminFormat.money(totalCost))
                total("Deep", AdminFormat.compact(stats.deepReadings))
                Spacer()
            }
        }
        .padding(16)
        .adminPanel()
    }

    private func total(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.adminLabel).foregroundStyle(AdminTheme.muted)
            Text(value).font(.adminNumber(22)).foregroundStyle(AdminTheme.ink)
        }
        .accessibilityElement(children: .combine)
    }
}
