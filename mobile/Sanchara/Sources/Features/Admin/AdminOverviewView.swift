import Charts
import SwiftUI

/// The numbers at a glance: stat strips, activity over the chosen range,
/// predictions, where the money goes, and who is spending it.
struct AdminOverviewView: View {
    @Environment(AdminStore.self) private var store

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                rangeBar
                    .padding(.horizontal, 16)

                if let overview = store.overview {
                    content(overview)
                } else if case .failed(let message) = store.overviewPhase {
                    AdminMessage(systemImage: "exclamationmark", title: "Couldn't load the numbers", detail: message,
                                 actionTitle: "Try again") { Task { await store.loadOverview() } }
                        .padding(.horizontal, 16)
                } else {
                    AdminMessage(systemImage: "", title: "Reading the numbers…", isLoading: true)
                        .padding(.horizontal, 16)
                }
            }
            .padding(.top, 14)
            .padding(.bottom, 48)
        }
        .scrollIndicators(.hidden)
        .refreshable { await store.loadOverview() }
        .task {
            if store.overview == nil { await store.loadOverview() }
        }
    }

    private var rangeBar: some View {
        HStack(spacing: 6) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Overview")
                    .font(.adminTitle(24))
                    .foregroundStyle(AdminTheme.ink)
                    .accessibilityAddTraits(.isHeader)
                Text(updatedLine)
                    .font(.adminLabel)
                    .foregroundStyle(AdminTheme.muted)
            }
            Spacer(minLength: 8)
            ForEach(AdminStore.ranges, id: \.self) { days in
                AdminPill(title: "\(days)d", isSelected: store.range == days) {
                    Task { await store.selectRange(days) }
                }
                .accessibilityLabel("Last \(days) days")
            }
        }
    }

    private var updatedLine: String {
        guard let overview = store.overview else { return "Last \(store.range) days" }
        let when = AdminFormat.relative(overview.generatedAt)
        return "Last \(overview.days) days · updated \(when)"
    }

    @ViewBuilder
    private func content(_ o: AdminOverview) -> some View {
        let t = o.totals
        AdminStatStrip(stats: [
            AdminStat(label: "Users", value: AdminFormat.compact(t.users), note: "+\(AdminFormat.compact(t.newUsers)) new",
                      systemImage: "person.2", highlighted: true, spokenValue: AdminFormat.grouped(t.users)),
            AdminStat(label: "Active, 7 days", value: AdminFormat.compact(t.activeUsers7d), systemImage: "waveform.path.ecg",
                      spokenValue: AdminFormat.grouped(t.activeUsers7d)),
            AdminStat(label: "Readings", value: AdminFormat.compact(t.readings), note: "\(AdminFormat.compact(t.readingsToday)) today",
                      systemImage: "sparkles", spokenValue: AdminFormat.grouped(t.readings)),
            AdminStat(label: "Cost", value: AdminFormat.moneyNumber(t.costUsd), unit: "USD",
                      note: "\(AdminFormat.money(t.costToday)) today", systemImage: "dollarsign",
                      spokenValue: AdminFormat.money(t.costUsd)),
            AdminStat(label: "Per reading", value: AdminFormat.moneyNumber(t.costPerReading), unit: "USD",
                      systemImage: "divide", spokenValue: AdminFormat.money(t.costPerReading)),
            AdminStat(label: "Deep readings", value: "\(Int((t.deepShare * 100).rounded()))", unit: "%",
                      systemImage: "circle.hexagongrid", spokenValue: AdminFormat.percent(t.deepShare)),
        ])

        activityPanel(o)
            .padding(.horizontal, 16)

        HStack(alignment: .top, spacing: 10) {
            hitRatePanel(t)
        }
        .padding(.horizontal, 16)

        AdminStatStrip(stats: [
            AdminStat(label: "Facts", value: AdminFormat.compact(t.facts), systemImage: "brain",
                      spokenValue: AdminFormat.grouped(t.facts)),
            AdminStat(label: "Memories", value: AdminFormat.compact(t.conversationMemories), systemImage: "text.bubble",
                      spokenValue: AdminFormat.grouped(t.conversationMemories)),
            AdminStat(label: "Daily readings", value: AdminFormat.compact(t.dailyReadings), systemImage: "sun.horizon",
                      spokenValue: AdminFormat.grouped(t.dailyReadings)),
            AdminStat(label: "Alerts sent", value: AdminFormat.compact(t.alertsSent), systemImage: "bell",
                      spokenValue: AdminFormat.grouped(t.alertsSent)),
            AdminStat(label: "Push devices", value: AdminFormat.compact(t.pushDevices), systemImage: "iphone",
                      spokenValue: AdminFormat.grouped(t.pushDevices)),
            AdminStat(label: "Life events", value: AdminFormat.compact(t.lifeEvents), systemImage: "pin",
                      spokenValue: AdminFormat.grouped(t.lifeEvents)),
            AdminStat(label: "Heavy users", value: AdminFormat.compact(t.heavyUsers), systemImage: "flame",
                      spokenValue: AdminFormat.grouped(t.heavyUsers)),
        ])

        if !o.topUsers.isEmpty {
            topUsersPanel(o.topUsers)
                .padding(.horizontal, 16)
        }

        if !o.modes.isEmpty {
            breakdownPanel(
                title: "Readings by mode",
                rows: o.modes.sorted { $0.readings > $1.readings }.map {
                    BreakdownRow(id: $0.mode, label: AdminFormat.label($0.mode), share: Double($0.readings),
                                 value: AdminFormat.compact($0.readings), detail: nil,
                                 spoken: "\(AdminFormat.label($0.mode)), \(AdminFormat.grouped($0.readings)) readings")
                }
            )
            .padding(.horizontal, 16)
        }

        if !o.models.isEmpty {
            breakdownPanel(
                title: "Spend by model",
                rows: o.models.sorted { $0.costUsd > $1.costUsd }.map {
                    BreakdownRow(id: $0.model, label: AdminFormat.modelName($0.model), share: $0.costUsd,
                                 value: AdminFormat.money($0.costUsd), detail: "\(AdminFormat.compact($0.calls)) calls",
                                 spoken: "\(AdminFormat.modelName($0.model)), \(AdminFormat.money($0.costUsd)), \(AdminFormat.grouped($0.calls)) calls")
                }
            )
            .padding(.horizontal, 16)
        }

        if !o.kinds.isEmpty {
            breakdownPanel(
                title: "Spend by kind",
                rows: o.kinds.sorted { $0.costUsd > $1.costUsd }.map {
                    BreakdownRow(id: $0.kind, label: AdminFormat.label($0.kind), share: $0.costUsd,
                                 value: AdminFormat.money($0.costUsd), detail: "\(AdminFormat.compact($0.calls)) calls",
                                 spoken: "\(AdminFormat.label($0.kind)), \(AdminFormat.money($0.costUsd)), \(AdminFormat.grouped($0.calls)) calls")
                }
            )
            .padding(.horizontal, 16)
        }
    }

    // MARK: Activity chart

    private func activityPanel(_ o: AdminOverview) -> some View {
        AdminActivityChart(series: o.series)
    }

    // MARK: Predictions

    private func hitRatePanel(_ t: AdminOverview.Totals) -> some View {
        HStack(spacing: 18) {
            AdminRing(value: t.hitRate)
                .frame(width: 104, height: 104)
            VStack(alignment: .leading, spacing: 10) {
                Text("Predictions")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(AdminTheme.inkSoft)
                legendRow(color: AdminTheme.lime, label: "Happened", value: t.predictionsHappened)
                legendRow(color: AdminTheme.frame, label: "Didn't", value: t.predictionsDidnt)
                legendRow(color: AdminTheme.raised, label: "Open", value: t.predictionsOpen, outlined: true)
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(maxWidth: .infinity)
        .adminPanel()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "Prediction hit rate, \(t.hitRate.map(AdminFormat.percent) ?? "not enough settled yet"). "
                + "Happened \(t.predictionsHappened), didn't \(t.predictionsDidnt), open \(t.predictionsOpen)."
        )
    }

    private func legendRow(color: Color, label: String, value: Int, outlined: Bool = false) -> some View {
        HStack(spacing: 8) {
            Circle().fill(color)
                .overlay(Circle().strokeBorder(outlined ? AdminTheme.line : .clear, lineWidth: 1))
                .frame(width: 10, height: 10)
            Text(label).font(.caption).foregroundStyle(AdminTheme.muted)
            Spacer(minLength: 6)
            Text(AdminFormat.compact(value)).font(.subheadline.monospacedDigit()).foregroundStyle(AdminTheme.ink)
        }
    }

    // MARK: Top users

    private func topUsersPanel(_ users: [AdminOverview.TopUser]) -> some View {
        let maxCost = users.map(\.costUsd30d).max() ?? 0
        return VStack(alignment: .leading, spacing: 4) {
            AdminSectionHeader(title: "Top users by cost (30d)")
                .padding(.bottom, 6)
            ForEach(Array(users.enumerated()), id: \.element.id) { index, user in
                NavigationLink(value: AdminRoute.user(id: user.id, name: user.displayName)) {
                    HStack(spacing: 12) {
                        Text("\(index + 1)")
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(AdminTheme.muted)
                            .frame(width: 18, alignment: .trailing)
                        AdminAvatar(name: user.displayName, active: index == 0, size: 36)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(user.displayName)
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(AdminTheme.ink)
                                .lineLimit(1)
                            Text("\(AdminFormat.compact(user.readings30d)) readings")
                                .font(.caption)
                                .foregroundStyle(AdminTheme.muted)
                        }
                        Spacer(minLength: 8)
                        VStack(alignment: .trailing, spacing: 4) {
                            Text(AdminFormat.money(user.costUsd30d))
                                .font(.subheadline.monospacedDigit())
                                .foregroundStyle(AdminTheme.ink)
                            AdminBar(share: maxCost > 0 ? user.costUsd30d / maxCost : 0)
                                .frame(width: 56, height: 4)
                        }
                        Image(systemName: "chevron.right")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(AdminTheme.faint)
                            .accessibilityHidden(true)
                    }
                    .frame(minHeight: 48)
                    .contentShape(Rectangle())
                }
                .buttonStyle(AdminPressStyle())
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(index + 1). \(user.displayName), \(AdminFormat.money(user.costUsd30d)), \(AdminFormat.grouped(user.readings30d)) readings")
                .accessibilityAddTraits(.isButton)
                if index < users.count - 1 {
                    Rectangle().fill(AdminTheme.rule).frame(height: 1).padding(.leading, 66)
                }
            }
        }
        .padding(16)
        .adminPanel()
    }

    // MARK: Breakdowns

    struct BreakdownRow: Identifiable {
        let id: String
        let label: String
        let share: Double
        let value: String
        let detail: String?
        let spoken: String
    }

    private func breakdownPanel(title: String, rows: [BreakdownRow]) -> some View {
        let total = rows.map(\.share).reduce(0, +)
        return VStack(alignment: .leading, spacing: 4) {
            AdminSectionHeader(title: title)
                .padding(.bottom, 6)
            ForEach(rows) { row in
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(row.label)
                            .font(.subheadline)
                            .foregroundStyle(AdminTheme.ink)
                            .lineLimit(1)
                        if let detail = row.detail {
                            Text(detail).font(.caption).foregroundStyle(AdminTheme.muted)
                        }
                        Spacer(minLength: 8)
                        Text(row.value)
                            .font(.subheadline.monospacedDigit())
                            .foregroundStyle(AdminTheme.ink)
                    }
                    AdminBar(share: total > 0 ? row.share / total : 0)
                        .frame(height: 6)
                }
                .frame(minHeight: 44)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(row.spoken)
            }
        }
        .padding(16)
        .adminPanel()
    }
}

/// A lime fill on a pale track.
struct AdminBar: View {
    let share: Double
    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(AdminTheme.rule)
                Capsule().fill(AdminTheme.lime)
                    .overlay(Capsule().strokeBorder(AdminTheme.ink.opacity(0.08), lineWidth: 1))
                    .frame(width: max(proxy.size.height, proxy.size.width * min(max(share, 0), 1)))
            }
        }
        .accessibilityHidden(true)
    }
}

/// The prediction hit-rate ring: lime arc on a pale track, the rate inside.
struct AdminRing: View {
    let value: Double?
    var body: some View {
        ZStack {
            Circle().stroke(AdminTheme.rule, lineWidth: 10)
            Circle()
                .trim(from: 0, to: min(max(value ?? 0, 0), 1))
                .stroke(AdminTheme.lime, style: StrokeStyle(lineWidth: 10, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Circle()
                .trim(from: 0, to: min(max(value ?? 0, 0), 1))
                .stroke(AdminTheme.ink.opacity(0.12), style: StrokeStyle(lineWidth: 1))
                .padding(-5)
                .rotationEffect(.degrees(-90))
            VStack(spacing: 0) {
                HStack(alignment: .firstTextBaseline, spacing: 1) {
                    Text(value.map { "\(Int(($0 * 100).rounded()))" } ?? "—")
                        .font(.adminNumber(28))
                        .foregroundStyle(AdminTheme.ink)
                    if value != nil {
                        Text("%").font(.caption2.weight(.medium)).foregroundStyle(AdminTheme.muted)
                    }
                }
                Text("hit rate").font(.caption2).foregroundStyle(AdminTheme.muted)
            }
        }
        .accessibilityHidden(true)
    }
}

/// Readings, cost, signups or active users per day, with a scrub-to-read
/// marker like the reference's "180 / 120" bubble.
struct AdminActivityChart: View {
    enum Metric: String, CaseIterable, Identifiable {
        case readings = "Readings", cost = "Cost", signups = "Signups", active = "Active"
        var id: String { rawValue }
    }

    let series: [AdminOverview.Point]
    @State private var metric: Metric = .readings
    @State private var selected: Date?

    private struct Sample: Identifiable {
        let date: Date
        let value: Double
        var id: Date { date }
    }

    private var samples: [Sample] {
        series.compactMap { p in
            guard let d = p.date else { return nil }
            return Sample(date: d, value: value(p))
        }
        .sorted { $0.date < $1.date }
    }

    private func value(_ p: AdminOverview.Point) -> Double {
        switch metric {
        case .readings: Double(p.readings)
        case .cost: p.costUsd
        case .signups: Double(p.signups)
        case .active: Double(p.activeUsers)
        }
    }

    private func format(_ v: Double) -> String {
        metric == .cost ? AdminFormat.money(v) : AdminFormat.compact(Int(v.rounded()))
    }

    var body: some View {
        let data = samples
        let total = data.map(\.value).reduce(0, +)
        let average = data.isEmpty ? 0 : total / Double(data.count)
        let marker = nearest(to: selected, in: data) ?? data.last

        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Activity")
                    .font(.adminTitle(22))
                    .foregroundStyle(AdminTheme.ink)
                Spacer()
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(Metric.allCases) { m in
                        AdminPill(title: m.rawValue, isSelected: metric == m) {
                            metric = m
                            selected = nil
                        }
                    }
                }
            }

            if data.isEmpty {
                Text("No activity in this range yet.")
                    .font(.subheadline)
                    .foregroundStyle(AdminTheme.muted)
                    .frame(maxWidth: .infinity, minHeight: 160)
            } else {
                Chart {
                    ForEach(data) { s in
                        AreaMark(x: .value("Day", s.date, unit: .day), y: .value(metric.rawValue, s.value))
                            .interpolationMethod(.monotone)
                            .foregroundStyle(LinearGradient(
                                colors: [AdminTheme.lime, AdminTheme.lime.opacity(0.25)],
                                startPoint: .top, endPoint: .bottom))
                        LineMark(x: .value("Day", s.date, unit: .day), y: .value(metric.rawValue, s.value))
                            .interpolationMethod(.monotone)
                            .foregroundStyle(AdminTheme.ink.opacity(0.75))
                            .lineStyle(StrokeStyle(lineWidth: 1.4))
                    }
                    if let marker {
                        RuleMark(x: .value("Day", marker.date, unit: .day))
                            .foregroundStyle(AdminTheme.ink.opacity(0.6))
                            .lineStyle(StrokeStyle(lineWidth: 1))
                            .annotation(position: .top, spacing: 4, overflowResolution: .init(x: .fit(to: .chart), y: .disabled)) {
                                VStack(spacing: 2) {
                                    Text(AdminFormat.shortDate(marker.date))
                                        .font(.caption2)
                                        .foregroundStyle(AdminTheme.muted)
                                    Text(format(marker.value))
                                        .font(.caption.weight(.semibold).monospacedDigit())
                                        .foregroundStyle(AdminTheme.onFrame)
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 4)
                                        .background(Capsule().fill(AdminTheme.frame))
                                }
                            }
                        PointMark(x: .value("Day", marker.date, unit: .day), y: .value(metric.rawValue, marker.value))
                            .symbolSize(40)
                            .foregroundStyle(AdminTheme.ink)
                    }
                }
                .chartXSelection(value: $selected)
                .chartYAxis {
                    AxisMarks(position: .leading, values: .automatic(desiredCount: 3)) { _ in
                        AxisGridLine(stroke: StrokeStyle(lineWidth: 1)).foregroundStyle(AdminTheme.rule)
                        AxisValueLabel().foregroundStyle(AdminTheme.muted).font(.caption2)
                    }
                }
                .chartXAxis {
                    AxisMarks(values: .automatic(desiredCount: 4)) { _ in
                        AxisValueLabel(format: .dateTime.day().month(.abbreviated))
                            .foregroundStyle(AdminTheme.muted).font(.caption2)
                    }
                }
                .frame(height: 200)
                // Room above the plot for the value bubble, clear of the pills.
                .padding(.top, 36)
                .accessibilityLabel("\(metric.rawValue) per day")
                .accessibilityValue("Total \(format(total)), average \(format(average)) a day")
            }

            HStack(alignment: .firstTextBaseline, spacing: 18) {
                summary("Average", format(average), "/day")
                summary("Total", format(total), nil)
                Spacer()
            }
        }
        .padding(16)
        .adminPanel()
    }

    private func summary(_ label: String, _ value: String, _ unit: String?) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text("\(label):").font(.caption).foregroundStyle(AdminTheme.muted)
            Text(value).font(.adminNumber(20)).foregroundStyle(AdminTheme.ink)
            if let unit { Text(unit).font(.caption2).foregroundStyle(AdminTheme.muted) }
        }
        .accessibilityElement(children: .combine)
    }

    private func nearest(to date: Date?, in data: [Sample]) -> Sample? {
        guard let date else { return nil }
        return data.min { abs($0.date.timeIntervalSince(date)) < abs($1.date.timeIntervalSince(date)) }
    }
}
