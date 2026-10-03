import SwiftUI

/// Everything Sanchara has sent: the twice-daily readings, kept by date, and the
/// dosha alerts. One screen, two tabs, so the bell means "things for you".
struct InboxView: View {
    enum Tab: String, CaseIterable, Identifiable {
        case daily
        case alerts

        var id: String { rawValue }
        var label: String { self == .daily ? "Daily" : "Alerts" }
    }

    let daily: DailyStore
    let alerts: AlertsStore
    @Binding var tab: Tab
    /// Sends a question into a fresh reading and closes the inbox.
    var onAsk: (String) -> Void
    /// True when this screen sits in the tab bar rather than in a sheet: no
    /// "Done" button, no navigation title, and a header above the picker that
    /// says what the screen is for.
    var embedded = false

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.bg.ignoresSafeArea()
                VStack(spacing: 0) {
                    if embedded {
                        ScreenHeader(
                            eyebrow: "Today",
                            title: "Your readings",
                            blurb: "Sanchara writes you a reading every morning and night from today's sky and your chart. Alerts come only when a dosha or hard transit starts or ends."
                        )
                        .padding(.horizontal, 16)
                        .padding(.top, 8)
                        .padding(.bottom, 12)
                    }
                    picker
                    switch tab {
                    case .daily: dailyList
                    case .alerts: alertList
                    }
                }
            }
            .navigationTitle(embedded ? "" : (tab == .daily ? "Your readings" : "Alerts"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if !embedded {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Done") { dismiss() }
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(Theme.fg)
                    }
                }
            }
            .toolbarBackground(Theme.bg, for: .navigationBar)
        }
        .presentationBackground(Theme.bg)
        .task {
            await daily.load()
            await alerts.load()
        }
        .sheet(item: Binding(get: { daily.selected }, set: { daily.selected = $0 })) { reading in
            DailyReadingView(reading: reading) { question in
                daily.selected = nil
                dismiss()
                onAsk(question)
            }
            .task { await daily.markRead(reading) }
        }
        .sheet(item: Binding(get: { alerts.selected }, set: { alerts.selected = $0 })) { alert in
            AlertDetailView(alert: alert) { question in
                alerts.selected = nil
                dismiss()
                onAsk(question)
            }
            .task { await alerts.markRead(alert) }
        }
    }

    /// The two tabs, with the unread counts as tags beside them rather than
    /// badges inside the segments.
    private var picker: some View {
        HStack(spacing: 10) {
            BrutSegmented(options: Tab.allCases.map { ($0, $0.label) }, selection: $tab)
            if daily.unreadCount > 0 || alerts.unreadCount > 0 {
                HStack(spacing: 6) {
                    if daily.unreadCount > 0 {
                        BrutTag(text: "Daily \(daily.unreadCount)")
                    }
                    if alerts.unreadCount > 0 {
                        BrutTag(text: "Alerts \(alerts.unreadCount)")
                    }
                }
                .fixedSize()
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 8)
    }

    @ViewBuilder
    private var dailyList: some View {
        if daily.readings.isEmpty {
            emptyState(
                title: "No readings yet",
                message: "Sanchara writes you a reading each morning and each night. They collect here by date.",
                systemImage: "sun.max"
            )
        } else {
            List {
                ForEach(daily.days) { day in
                    Section {
                        ForEach(day.readings) { reading in
                            Button { daily.selected = reading } label: { row(for: reading) }
                                .listRowBackground(Color.clear)
                                .listRowSeparatorTint(Theme.rule)
                        }
                    } header: {
                        Text(day.label).eyebrow()
                    }
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
        }
    }

    @ViewBuilder
    private var alertList: some View {
        if alerts.alerts.isEmpty {
            emptyState(
                title: "Nothing flagged",
                message: "If a dosha or a difficult transit starts, you'll hear about it here.",
                systemImage: "bell"
            )
        } else {
            List {
                ForEach(alerts.alerts) { alert in
                    Button { alerts.selected = alert } label: { alertRow(alert) }
                        .listRowBackground(Color.clear)
                        .listRowSeparatorTint(Theme.rule)
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
        }
    }

    private func emptyState(title: String, message: String, systemImage: String) -> some View {
        VStack(spacing: 0) {
            Spacer()
            BrutEmptyState(title: title, message: message, systemImage: systemImage)
            Spacer()
            Spacer()
        }
        .padding(.horizontal, 16)
    }

    /// A small bordered tile for the row's icon.
    private func iconTile(_ systemImage: String, tint: Color) -> some View {
        Image(systemName: systemImage)
            .font(.system(size: 13, weight: .bold))
            .foregroundStyle(tint)
            .frame(width: 32, height: 32)
            .brutBordered(fill: Theme.surfaceRaised)
    }

    private func row(for reading: DailyReading) -> some View {
        HStack(alignment: .top, spacing: 12) {
            iconTile(reading.isMorning ? "sun.max" : "moon.stars", tint: reading.isMorning ? Theme.accent : Theme.violet)
                .opacity(reading.isUnread ? 1 : 0.5)
            VStack(alignment: .leading, spacing: 4) {
                Text(reading.title)
                    .font(.system(size: 15, weight: reading.isUnread ? .bold : .semibold))
                    .foregroundStyle(Theme.fg)
                    .multilineTextAlignment(.leading)
                Text(reading.body)
                    .font(.brutBody(13))
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.leading)
                    .lineLimit(2)
                Text(reading.slotLabel)
                    .font(.brutMono(10))
                    .textCase(.uppercase)
                    .tracking(1)
                    .foregroundStyle(Theme.muted)
            }
        }
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    private func alertRow(_ alert: SancharaAlert) -> some View {
        HStack(alignment: .top, spacing: 12) {
            iconTile("bell", tint: severityColor(alert.severity))
                .opacity(alert.isUnread ? 1 : 0.5)
            VStack(alignment: .leading, spacing: 4) {
                Text(alert.title)
                    .font(.system(size: 15, weight: alert.isUnread ? .bold : .semibold))
                    .foregroundStyle(Theme.fg)
                    .multilineTextAlignment(.leading)
                Text(alert.body)
                    .font(.brutBody(13))
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.leading)
                    .lineLimit(3)
                HStack(spacing: 8) {
                    BrutTag(text: alert.severity, fill: severityColor(alert.severity), textColor: Theme.ink)
                    Text(alert.createdAt.formatted(date: .abbreviated, time: .shortened))
                        .font(.brutMono(10, weight: .regular))
                        .foregroundStyle(Theme.muted)
                }
            }
        }
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }
}

/// One day's reading, in full.
struct DailyReadingView: View {
    let reading: DailyReading
    var onAsk: (String) -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.bg.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        HStack(spacing: 8) {
                            Image(systemName: reading.isMorning ? "sun.max" : "moon.stars")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(reading.isMorning ? Theme.accent : Theme.violet)
                            Text(reading.slotLabel).eyebrow()
                            Text("·")
                                .font(.brutMono(11))
                                .foregroundStyle(Theme.muted)
                            Text(DailyReadingDay(date: reading.forDate, readings: []).label)
                                .font(.brutMono(11))
                                .foregroundStyle(Theme.muted)
                        }

                        Text(reading.title).brutHeading(26)

                        MarkdownText(markdown: reading.detail)

                        SancharaPrimaryButton(title: "Ask Sanchara about this", kind: .accent) {
                            onAsk("About my \(reading.slotLabel.lowercased()) reading: \(reading.title). \(reading.body) Tell me more.")
                        }
                        .padding(.top, 8)
                    }
                    .padding(.horizontal, 24)
                    .padding(.vertical, 24)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Close") { dismiss() }
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(Theme.fg)
                }
            }
            .toolbarBackground(Theme.bg, for: .navigationBar)
        }
        .presentationBackground(Theme.bg)
    }
}
