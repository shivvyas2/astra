import SwiftUI

/// Everything Astrya has sent: the twice-daily readings, kept by date, and the
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
                // First light for the tab; the sheet keeps the lime field.
                Atmosphere(mood: embedded ? .dawn : .lime)
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        if embedded {
                            todayHeader
                                .padding(.top, 8)
                                .padding(.bottom, 24)
                            MoodCheckinCard()
                                .padding(.bottom, 24)
                        }
                        picker
                            .padding(.bottom, 20)
                        switch tab {
                        case .daily: dailyContent
                        case .alerts: alertContent
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, embedded ? 0 : 8)
                    .padding(.bottom, 32)
                }
                .refreshable {
                    await daily.load()
                    await alerts.load()
                }
            }
            .clearsTabBar(active: embedded)
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
            .toolbar(embedded ? .hidden : .automatic, for: .navigationBar)
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

    /// "Friday, 3 October".
    private static func todayTitle(_ date: Date = Date()) -> String {
        let formatter = DateFormatter()
        formatter.setLocalizedDateFormatFromTemplate("EEEEdMMMM")
        return formatter.string(from: date)
    }

    private static func todayPart(_ template: String, _ date: Date = Date()) -> String {
        let formatter = DateFormatter()
        formatter.setLocalizedDateFormatFromTemplate(template)
        return formatter.string(from: date)
    }

    /// The date as a figure: "05" large, the month beside it on the
    /// baseline, the weekday under it — then what the screen is for.
    private var todayHeader: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Circle().fill(Theme.accent).frame(width: 7, height: 7)
                Text("Today")
                    .font(.system(size: 11, weight: .semibold))
                    .textCase(.uppercase)
                    .tracking(1.4)
                    .foregroundStyle(Theme.accent)
                Spacer(minLength: 0)
                AstraMark(size: 16)
            }
            BigNumber(
                value: Self.todayPart("dd"),
                unit: Self.todayPart("MMMM"),
                caption: Self.todayPart("EEEE"),
                size: 88,
                unitColor: Theme.fg
            )
            Text("A reading every morning and night, written from today's sky and your chart. Alerts come only when a dosha or hard transit starts or ends.")
                .font(.brutBody(15))
                .foregroundStyle(Theme.muted)
                .lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Today, \(Self.todayTitle()). A reading every morning and night, written from today's sky and your chart. Alerts come only when a dosha or hard transit starts or ends.")
        .accessibilityAddTraits(.isHeader)
    }

    // MARK: - Picker

    /// Underlined word tabs, each carrying its unread count when there is one.
    private var picker: some View {
        BrutSegmented(
            options: [
                (Tab.daily, label(Tab.daily.label, unread: daily.unreadCount)),
                (Tab.alerts, label(Tab.alerts.label, unread: alerts.unreadCount)),
            ],
            selection: $tab
        )
    }

    private func label(_ base: String, unread: Int) -> String {
        unread > 0 ? "\(base) · \(unread)" : base
    }

    // MARK: - Daily

    @ViewBuilder
    private var dailyContent: some View {
        if let featured = daily.readings.first {
            featuredCard(featured)
                .padding(.bottom, 28)

            let earlier = earlierDays(excluding: featured)
            if !earlier.isEmpty {
                Text("Earlier").eyebrow()
                    .padding(.bottom, 4)
                ForEach(earlier) { day in
                    Text(day.label)
                        .font(.brutMono(11))
                        .textCase(.uppercase)
                        .tracking(1)
                        .foregroundStyle(Theme.muted)
                        .padding(.top, 16)
                        .padding(.bottom, 2)
                    ForEach(Array(day.readings.enumerated()), id: \.element.id) { index, reading in
                        Button { daily.selected = reading } label: { row(for: reading) }
                            .buttonStyle(.plain)
                            .accessibilityValue(reading.isUnread ? "Unread" : "")
                            .accessibilityHint("Opens the full reading")
                        if index < day.readings.count - 1 {
                            BrutDivider()
                        }
                    }
                }
            }
        } else {
            BrutEmptyState(
                title: "Your first reading is on its way",
                message: "A reading arrives every morning and every night, written from that day's sky and your chart. The next one lands here at the start of your morning or evening, and they collect by date.",
                systemImage: "sun.max"
            )
            // No dead end: the chart can be read right now.
            SancharaPrimaryButton(title: "Ask about today now", kind: .accent) {
                askNow("What does today's sky mean for me? Read it from my chart.")
            }
            .padding(.top, 16)
        }
    }

    /// The days below the featured reading, without it.
    private func earlierDays(excluding featured: DailyReading) -> [DailyReadingDay] {
        daily.days.compactMap { day in
            let rest = day.readings.filter { $0.id != featured.id }
            return rest.isEmpty ? nil : DailyReadingDay(date: day.date, readings: rest)
        }
    }

    /// The newest reading, set large. The whole card opens it.
    private func featuredCard(_ reading: DailyReading) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                BrutTag(
                    text: reading.slotLabel,
                    fill: reading.isMorning ? Theme.accent : Theme.violet,
                    textColor: Theme.ink
                )
                Text(DailyReadingDay(date: reading.forDate, readings: []).label)
                    .font(.brutMono(11))
                    .foregroundStyle(Theme.muted)
                Spacer(minLength: 0)
                if reading.isUnread { unreadDot }
            }

            Text(reading.title)
                .brutHeading(30)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)

            Text(reading.body)
                .font(.brutBody(15))
                .foregroundStyle(Theme.muted)
                .lineSpacing(2)
                .lineLimit(3)
                .multilineTextAlignment(.leading)

            BrutDivider()
                .padding(.top, 4)

            StepFooter(step: 1, label: "Read it") {
                daily.selected = reading
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .brutCard()
        .contentShape(RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous))
        .onTapGesture { daily.selected = reading }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(reading.slotLabel) reading: \(reading.title). \(reading.body)")
        .accessibilityValue(reading.isUnread ? "Unread" : "")
        .accessibilityHint("Opens the full reading")
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { daily.selected = reading }
        .accessibilityAction(named: "Ask Astrya about this") { onAsk(Self.askPrompt(for: reading)) }
        .contextMenu {
            Button("Read it", systemImage: "book") { daily.selected = reading }
            Button("Ask Astrya about this", systemImage: "text.bubble") { onAsk(Self.askPrompt(for: reading)) }
        }
    }

    /// The question a reading carries over to Ask.
    static func askPrompt(for reading: DailyReading) -> String {
        "About my \(reading.slotLabel.lowercased()) reading: \(reading.title). \(reading.body) Tell me more."
    }

    private func row(for reading: DailyReading) -> some View {
        HStack(alignment: .center, spacing: 14) {
            iconCircle(
                reading.isMorning ? "sun.max" : "moon.stars",
                tint: reading.isMorning ? Theme.accent : Theme.violet
            )
            .opacity(reading.isUnread ? 1 : 0.6)

            VStack(alignment: .leading, spacing: 4) {
                Text(reading.title)
                    .font(.system(size: 15, weight: reading.isUnread ? .semibold : .regular))
                    .foregroundStyle(Theme.fg)
                    .multilineTextAlignment(.leading)
                    .lineLimit(2)
                Text(reading.body)
                    .font(.brutBody(13))
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.leading)
                    .lineLimit(1)
                Text(reading.slotLabel)
                    .font(.brutMono(10))
                    .textCase(.uppercase)
                    .tracking(1)
                    .foregroundStyle(Theme.muted)
            }

            Spacer(minLength: 8)
            if reading.isUnread { unreadDot }
            chevron
        }
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .contentShape(Rectangle())
    }

    // MARK: - Alerts

    @ViewBuilder
    private var alertContent: some View {
        if alerts.alerts.isEmpty {
            BrutEmptyState(
                title: "Nothing flagged",
                message: "When a dosha or a hard transit starts or ends in your chart, an alert lands here the same day. Until then, quiet is good news.",
                systemImage: "bell"
            )
            ViewMoreRow(title: "Ask what's ahead this month") {
                askNow("What transits are coming up for me this month, and what should I watch for?")
            }
            .padding(.top, 16)
        } else {
            ForEach(Array(alerts.alerts.enumerated()), id: \.element.id) { index, alert in
                Button { alerts.selected = alert } label: { alertRow(alert) }
                    .buttonStyle(.plain)
                    .accessibilityValue(alert.isUnread ? "Unread" : "")
                    .accessibilityHint("Opens the alert")
                if index < alerts.alerts.count - 1 {
                    BrutDivider()
                }
            }
        }
    }

    private func alertRow(_ alert: SancharaAlert) -> some View {
        HStack(alignment: .center, spacing: 14) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    BrutTag(text: alert.severity, fill: severityColor(alert.severity), textColor: Theme.ink)
                    Text(alert.createdAt.formatted(date: .abbreviated, time: .shortened))
                        .font(.brutMono(11, weight: .regular))
                        .foregroundStyle(Theme.muted)
                }
                Text(alert.title)
                    .font(.system(size: 16, weight: alert.isUnread ? .semibold : .regular))
                    .foregroundStyle(Theme.fg)
                    .multilineTextAlignment(.leading)
                    .lineLimit(2)
                Text(alert.body)
                    .font(.brutBody(13))
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.leading)
                    .lineLimit(2)
            }

            Spacer(minLength: 8)
            if alert.isUnread { unreadDot }
            chevron
        }
        .padding(.vertical, 16)
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .contentShape(Rectangle())
    }

    /// Carries a question to Ask, closing the inbox first when it is a sheet.
    private func askNow(_ question: String) {
        if !embedded { dismiss() }
        onAsk(question)
    }

    // MARK: - Pieces

    /// A round, outlined tile for a row's icon.
    private func iconCircle(_ systemImage: String, tint: Color) -> some View {
        Image(systemName: systemImage)
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(tint)
            .frame(width: 36, height: 36)
            .background {
                Circle().fill(Theme.fg.opacity(0.04))
                Circle().strokeBorder(Theme.line, lineWidth: Theme.lineWidth)
            }
            .accessibilityHidden(true)
    }

    private var unreadDot: some View {
        Circle()
            .fill(Theme.accent)
            .frame(width: 8, height: 8)
            .accessibilityHidden(true)
    }

    private var chevron: some View {
        Image(systemName: "chevron.right")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(Theme.muted)
            .accessibilityHidden(true)
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
                Atmosphere(mood: .lime)
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        HStack(spacing: 8) {
                            Image(systemName: reading.isMorning ? "sun.max" : "moon.stars")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(reading.isMorning ? Theme.accent : Theme.violet)
                                .accessibilityHidden(true)
                            Text("\(reading.slotLabel) · \(DailyReadingDay(date: reading.forDate, readings: []).label)")
                                .eyebrow()
                        }

                        Text(reading.title)
                            .brutHeading(34)
                            .fixedSize(horizontal: false, vertical: true)

                        BrutDivider()

                        MarkdownText(markdown: reading.detail)

                        SancharaPrimaryButton(title: "Ask Astrya about this", kind: .accent) {
                            onAsk(InboxView.askPrompt(for: reading))
                        }
                        .padding(.top, 8)
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 32)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(Theme.fg)
                }
            }
            .toolbarBackground(Theme.bg, for: .navigationBar)
        }
        .presentationBackground(Theme.bg)
    }
}
