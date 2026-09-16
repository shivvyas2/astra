import SwiftUI

/// Everything Sanchara has sent: the twice-daily readings, kept by date, and the
/// dosha alerts. One sheet, two tabs, so the bell means "things for you".
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

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.bg.ignoresSafeArea()
                VStack(spacing: 0) {
                    picker
                    switch tab {
                    case .daily: dailyList
                    case .alerts: alertList
                    }
                }
            }
            .navigationTitle(tab == .daily ? "Your readings" : "Alerts")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }.foregroundStyle(Theme.muted)
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

    private var picker: some View {
        HStack(spacing: 4) {
            ForEach(Tab.allCases) { option in
                Button {
                    tab = option
                } label: {
                    HStack(spacing: 6) {
                        Text(option.label)
                        let unread = option == .daily ? daily.unreadCount : alerts.unreadCount
                        if unread > 0 {
                            Text("\(unread)")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(Theme.bg)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 1)
                                .background(Theme.accent)
                                .clipShape(Capsule())
                        }
                    }
                    .font(.system(size: 14, weight: tab == option ? .medium : .regular))
                    .foregroundStyle(tab == option ? Theme.fg : Theme.muted)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 9)
                    .background(tab == option ? Color.white.opacity(0.08) : .clear)
                    .clipShape(RoundedRectangle(cornerRadius: 7))
                }
            }
        }
        .padding(3)
        .background(Theme.fieldFill)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.hairline, lineWidth: 1))
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    @ViewBuilder
    private var dailyList: some View {
        if daily.readings.isEmpty {
            emptyState(
                title: "No readings yet",
                message: "Sanchara writes you a reading each morning and each night. They collect here by date."
            )
        } else {
            List {
                ForEach(daily.days) { day in
                    Section {
                        ForEach(day.readings) { reading in
                            Button { daily.selected = reading } label: { row(for: reading) }
                                .listRowBackground(Color.clear)
                                .listRowSeparatorTint(Theme.hairline)
                        }
                    } header: {
                        Text(day.label)
                            .font(.system(size: 11))
                            .tracking(2)
                            .textCase(.uppercase)
                            .foregroundStyle(Theme.muted)
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
                message: "If a dosha or a difficult transit starts, you'll hear about it here."
            )
        } else {
            List {
                ForEach(alerts.alerts) { alert in
                    Button { alerts.selected = alert } label: { alertRow(alert) }
                        .listRowBackground(Color.clear)
                        .listRowSeparatorTint(Theme.hairline)
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
        }
    }

    private func emptyState(title: String, message: String) -> some View {
        VStack(spacing: 8) {
            Spacer()
            Text(title).eyebrow()
            Text(message)
                .font(.system(size: 14))
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
            Spacer()
            Spacer()
        }
    }

    private func row(for reading: DailyReading) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: reading.isMorning ? "sun.max" : "moon.stars")
                .font(.system(size: 13))
                .foregroundStyle(reading.isMorning ? Theme.accent : Color(hex: 0x6B74FF))
                .frame(width: 18)
                .padding(.top, 2)
                .opacity(reading.isUnread ? 1 : 0.45)
            VStack(alignment: .leading, spacing: 4) {
                Text(reading.title)
                    .font(.system(size: 15, weight: reading.isUnread ? .semibold : .regular))
                    .foregroundStyle(Theme.fg)
                    .multilineTextAlignment(.leading)
                Text(reading.body)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.leading)
                    .lineLimit(2)
                Text(reading.slotLabel)
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.muted.opacity(0.7))
            }
        }
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    private func alertRow(_ alert: SancharaAlert) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Circle()
                .fill(severityColor(alert.severity))
                .frame(width: 6, height: 6)
                .padding(.top, 6)
                .opacity(alert.isUnread ? 1 : 0.35)
            VStack(alignment: .leading, spacing: 4) {
                Text(alert.title)
                    .font(.system(size: 15, weight: alert.isUnread ? .semibold : .regular))
                    .foregroundStyle(Theme.fg)
                    .multilineTextAlignment(.leading)
                Text(alert.body)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.leading)
                    .lineLimit(3)
                Text(alert.createdAt.formatted(date: .abbreviated, time: .shortened))
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.muted.opacity(0.7))
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
                                .font(.system(size: 12))
                                .foregroundStyle(reading.isMorning ? Theme.accent : Color(hex: 0x6B74FF))
                            Text(reading.slotLabel.uppercased())
                                .font(.system(size: 11))
                                .tracking(2)
                                .foregroundStyle(Theme.muted)
                            Text("·").foregroundStyle(Theme.muted)
                            Text(DailyReadingDay(date: reading.forDate, readings: []).label)
                                .font(.system(size: 11))
                                .foregroundStyle(Theme.muted)
                        }

                        Text(reading.title)
                            .font(.system(size: 24, weight: .light))
                            .tracking(-0.4)
                            .foregroundStyle(Theme.fg)

                        MarkdownText(markdown: reading.detail)

                        SancharaPrimaryButton(title: "Ask Sanchara about this") {
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
                    Button("Close") { dismiss() }.foregroundStyle(Theme.muted)
                }
            }
            .toolbarBackground(Theme.bg, for: .navigationBar)
        }
        .presentationBackground(Theme.bg)
    }
}
