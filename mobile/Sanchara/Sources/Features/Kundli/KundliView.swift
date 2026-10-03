import SwiftUI

/// The kundli screen.
///
/// The job of this screen is narrow and worth stating: help someone find where
/// a planet sits and what a house holds. It does not interpret — that is what
/// the reading is for — so nothing here is generated, and every number on it
/// comes from the ephemeris.
///
/// Two rules shaped the layout. First, `charting-data.md › Best practices`:
/// "Keep a chart simple, letting people choose when they want additional
/// details" — so the diagram shows glyphs and rashi numerals only, and degrees,
/// nakshatras and retrogrades live in the table below and in the house sheet.
/// Second, `charts.md › Best practices`: "don't require interaction to reveal
/// critical information" — so the table under the chart repeats everything the
/// diagram encodes, in plain rows that take unbounded Dynamic Type.
struct KundliView: View {
    let details: BirthProfileDetails
    let chart: NatalChart
    /// True when this view is a tab rather than a sheet: no Done button, no
    /// inline title, and a `ScreenHeader` opening the scroll content instead.
    var embedded = false

    @Environment(\.dismiss) private var dismiss
    @State private var selectedHouse: KundliHouse?
    @State private var share: SharePayload?
    @State private var isPreparingPDF = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.bg.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 28) {
                        if embedded {
                            ScreenHeader(
                                eyebrow: "Birth chart",
                                title: "Your kundli",
                                blurb: "Where every planet sat the moment you were born. Tap a house to see what it holds. The PDF is at the bottom."
                            )
                        }
                        summary
                        chartBlock
                        dashaBlock
                        planetTable
                        footer
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 24)
                    .frame(maxWidth: 480)
                    .frame(maxWidth: .infinity)
                }
            }
            .navigationTitle(embedded ? "" : "Your kundli")
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
        .sheet(item: $selectedHouse) { house in
            HouseDetailSheet(house: house)
        }
        .sheet(item: $share) { payload in
            ShareSheet(items: [payload.url])
        }
    }

    // MARK: - Summary

    /// The three facts a Vedic chart is identified by. Lagna leads because the
    /// whole diagram is oriented from it.
    private var summary: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text(details.fullName)
                    .font(.brutTitle(22))
                    .foregroundStyle(Theme.fg)
                Text("\(birthLine)\n\(details.placeName)")
                    .font(.brutMono(12, weight: .medium))
                    .foregroundStyle(Theme.muted)
            }

            HStack(spacing: 8) {
                statCell("Lagna", chart.ascendantRashi.sanskrit, chart.ascendantDegreeText)
                statCell("Chandra", rashiName(chart.moonSign), chart.moonSign)
                statCell("Surya", rashiName(chart.sunSign), chart.sunSign)
            }
            .padding(10)
            .brutCard()
        }
    }

    private func statCell(_ label: String, _ value: String, _ caption: String) -> some View {
        VStack(spacing: 4) {
            Text(label).eyebrow()
            Text(value)
                .font(.brutTitle(15))
                .foregroundStyle(Theme.fg)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
            Text(caption)
                .font(.brutMono(10, weight: .medium))
                .foregroundStyle(Theme.muted)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .padding(.horizontal, 4)
        .brutBordered(fill: Theme.surfaceRaised)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label), \(value), \(caption)")
    }

    private var birthLine: String {
        "\(formattedBirthDate) at \(details.birthTimeShort)"
    }

    private var formattedBirthDate: String {
        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.dateFormat = "yyyy-MM-dd"
        guard let day = parser.date(from: details.birthDate) else { return details.birthDate }
        let pretty = DateFormatter()
        pretty.dateStyle = .long
        pretty.timeStyle = .none
        return pretty.string(from: day)
    }

    private func rashiName(_ english: String) -> String {
        Rashi(english: english)?.sanskrit ?? english
    }

    // MARK: - The chart

    private var chartBlock: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Rashi chart").eyebrow()

            KundliChartView(chart: chart, selected: $selectedHouse)

            // `charting-data.md › Designing effective charts`: "If you need to
            // create a chart that presents data in a novel way, help people
            // learn how to interpret the chart." Most people meeting a North
            // Indian kundli for the first time assume the numbers are houses.
            Text("Houses sit in fixed places — the top diamond is always the first. The numeral in each is its rashi, counted from Mesha. Tap a house to see what it holds.")
                .font(.brutBody(13))
                .foregroundStyle(Theme.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: - Dasha

    @ViewBuilder
    private var dashaBlock: some View {
        if let dasha = chart.dasha {
            VStack(alignment: .leading, spacing: 10) {
                Text("Vimshottari dasha").eyebrow()
                periodRow("Mahadasha", dasha.mahadasha, until: dasha.mahadashaEnd)
                BrutDivider(color: Theme.rule, thickness: 1)
                periodRow("Antardasha", dasha.antardasha, until: dasha.antardashaEnd)
            }
            .padding(16)
            .brutCard()
        }
    }

    private func periodRow(_ label: String, _ lord: String, until: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label)
                .font(.brutMono(12))
                .foregroundStyle(Theme.muted)
            Spacer(minLength: 12)
            VStack(alignment: .trailing, spacing: 2) {
                Text(lord)
                    .font(.brutTitle(15))
                    .foregroundStyle(Theme.fg)
                Text("until \(shortDate(until))")
                    .font(.brutMono(11, weight: .medium))
                    .foregroundStyle(Theme.muted)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label) \(lord), until \(shortDate(until))")
    }

    private func shortDate(_ iso: String) -> String {
        ChartFacts.calendarDay(iso, format: "MMM yyyy")
    }

    // MARK: - The table

    /// Everything the diagram encodes, in rows. This is the accessible path
    /// through the chart and the one that survives the largest text sizes.
    private var planetTable: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Grahas").eyebrow()

            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(chart.planets.enumerated()), id: \.element.id) { index, planet in
                    if index > 0 {
                        Rectangle().fill(Theme.rule).frame(height: 1)
                    }
                    Button {
                        selectedHouse = chart.house(planet.house)
                    } label: {
                        HStack(spacing: 12) {
                            Text(planet.glyph)
                                .font(.system(size: 17))
                                .foregroundStyle(Theme.accent)
                                .frame(width: 24)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(planet.name + (planet.retrograde ? " ℞" : ""))
                                    .font(.system(size: 15, weight: .semibold))
                                    .foregroundStyle(Theme.fg)
                                if let nakshatra = planet.nakshatra {
                                    Text(nakshatra)
                                        .font(.brutMono(11, weight: .medium))
                                        .foregroundStyle(Theme.muted)
                                }
                            }
                            Spacer(minLength: 8)
                            VStack(alignment: .trailing, spacing: 2) {
                                Text("\(rashiName(planet.sign)) \(planet.degreeText)")
                                    .font(.brutMono(12))
                                    .foregroundStyle(Theme.fg)
                                Text("House \(planet.house)")
                                    .font(.brutMono(11, weight: .medium))
                                    .foregroundStyle(Theme.muted)
                            }
                        }
                        .padding(.vertical, 11)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(planet.spokenDescription)
                    .accessibilityHint("Opens house \(planet.house)")
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 4)
            .brutCard()
        }
    }

    // MARK: - Footer

    private var footer: some View {
        VStack(alignment: .leading, spacing: 12) {
            SancharaPrimaryButton(
                title: "Export as PDF",
                isLoading: isPreparingPDF,
                kind: .secondary
            ) {
                Task { await exportPDF() }
            }

            if let errorMessage {
                BrutNotice(text: errorMessage)
            }

            if let ayanamsa = chart.ayanamsa {
                Text("Sidereal, Lahiri ayanamsa \(String(format: "%.2f", ayanamsa))°. Computed with the Swiss Ephemeris.")
                    .font(.brutMono(10, weight: .medium))
                    .foregroundStyle(Theme.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func exportPDF() async {
        guard !isPreparingPDF else { return }
        isPreparingPDF = true
        errorMessage = nil
        defer { isPreparingPDF = false }
        do {
            let data = try await SancharaAPI.kundliPDF()
            let name = details.fullName.replacingOccurrences(of: " ", with: "-").lowercased()
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("\(name)-kundli.pdf")
            try data.write(to: url, options: .atomic)
            share = SharePayload(url: url)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - House detail

/// What one house holds. A medium detent by default, because the common case is
/// a three-line answer and a full-height sheet over a chart you were just
/// pointing at is more dislocating than it is useful
/// (`sheets.md › Best practices`).
struct HouseDetailSheet: View {
    let house: KundliHouse

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.bg.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(house.isLagna ? "House 1 · Lagna" : "House \(house.number)")
                                .eyebrow()
                            Text(house.rashi.sanskrit)
                                .brutHeading(28)
                            Text("\(house.rashi.english) · rashi \(house.rashi.number)")
                                .font(.brutMono(12))
                                .foregroundStyle(Theme.muted)
                        }

                        Text(house.domain)
                            .font(.brutBody(15))
                            .foregroundStyle(Theme.muted)
                            .fixedSize(horizontal: false, vertical: true)

                        if house.planets.isEmpty {
                            Text("No graha sits here. An empty house is read through its lord and the aspects reaching it — ask for a reading if you want that traced.")
                                .font(.brutBody(13))
                                .foregroundStyle(Theme.muted)
                                .fixedSize(horizontal: false, vertical: true)
                                .padding(14)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .brutBordered()
                        } else {
                            VStack(alignment: .leading, spacing: 0) {
                                ForEach(Array(house.planets.enumerated()), id: \.element.id) { index, planet in
                                    if index > 0 {
                                        Rectangle().fill(Theme.rule).frame(height: 1)
                                    }
                                    HStack(spacing: 14) {
                                        Text(planet.glyph)
                                            .font(.system(size: 22))
                                            .foregroundStyle(Theme.accent)
                                            .frame(width: 28)
                                        VStack(alignment: .leading, spacing: 3) {
                                            Text(planet.name + (planet.retrograde ? " ℞ retrograde" : ""))
                                                .font(.system(size: 15, weight: .semibold))
                                                .foregroundStyle(Theme.fg)
                                            Text(planet.nakshatra.map { "\(planet.degreeText) · \($0)" } ?? planet.degreeText)
                                                .font(.brutMono(12))
                                                .foregroundStyle(Theme.muted)
                                        }
                                        Spacer(minLength: 0)
                                    }
                                    .padding(.vertical, 12)
                                    .accessibilityElement(children: .combine)
                                    .accessibilityLabel(planet.spokenDescription)
                                }
                            }
                            .padding(.horizontal, 14)
                            .padding(.vertical, 4)
                            .brutCard()
                        }
                    }
                    .padding(24)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(Theme.fg)
                }
            }
            .toolbarBackground(Theme.bg, for: .navigationBar)
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(Theme.bg)
    }
}
