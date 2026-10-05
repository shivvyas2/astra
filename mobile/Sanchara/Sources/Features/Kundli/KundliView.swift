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
    @State private var showPeriods = false
    @State private var showAddTime = false
    @Environment(\.navigator) private var navigator
    /// Sanskrit, Hindi, Gujarati or English names for grahas and rashis.
    @AppStorage(NameScript.storageKey) private var script: NameScript = .sanskrit

    var body: some View {
        NavigationStack {
            ZStack {
                Atmosphere(mood: .dusk)
                ScrollView {
                    VStack(alignment: .leading, spacing: 28) {
                        hero
                        if !chart.isTimeKnown { timeUnknownNotice }
                        signRows
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
            .clearsTabBar(active: embedded)
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
            HouseDetailSheet(house: house, onAsk: askFromHouse, fromMoon: !chart.isTimeKnown)
        }
        .sheet(isPresented: $showPeriods) {
            PeriodExplainerView()
        }
        .sheet(isPresented: $showAddTime) {
            // Saving posts `.birthDetailsSaved`; the ProfileStore behind this
            // screen reloads and hands down the recomputed chart.
            IntakeView(initial: details, addingBirthTime: true, onCancel: { showAddTime = false }) {
                showAddTime = false
            }
        }
        .sheet(item: $share) { payload in
            ShareSheet(items: [payload.url])
        }
    }

    /// Into Ask with the question waiting, to edit or send. Only as a tab:
    /// as a sheet there is no Ask tab behind it to switch to.
    private var askFromHouse: ((String) -> Void)? {
        guard embedded else { return nil }
        let navigator = navigator
        return { question in navigator.ask(question, false) }
    }

    // MARK: - Hero

    /// The lagna as the screen's one large word, in an outlined card with an
    /// orbit behind it. The whole diagram is oriented from the lagna, so it
    /// leads.
    private var hero: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    HStack(spacing: 8) {
                        Circle().fill(Theme.accent).frame(width: 7, height: 7)
                        Text("Birth chart")
                            .font(.system(size: 11, weight: .semibold))
                            .textCase(.uppercase)
                            .tracking(1.4)
                            .foregroundStyle(Theme.accent)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityAddTraits(.isHeader)
                    Spacer(minLength: 8)
                    namesMenu
                }
                if embedded {
                    Text("Where every planet sat the moment you were born. Tap a house to see what it holds.")
                        .font(.brutBody(15))
                        .foregroundStyle(Theme.muted)
                        .lineSpacing(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            VStack(alignment: .leading, spacing: 0) {
                Text(chart.isTimeKnown ? "Lagna (ascendant)" : "Chandra lagna (Moon sign)")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.muted)
                    .padding(.bottom, 64)

                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    // Without a birth time the real lagna is a noon guess, so
                    // the hero shows the Moon's sign — what the chart below is
                    // then read from — in a quieter colour.
                    Text(chart.isTimeKnown ? chart.ascendantRashi.name(in: script) : rashiName(chart.moonSign))
                        .font(.brutDisplay(56))
                        .tracking(-56 * 0.035)
                        .foregroundStyle(chart.isTimeKnown ? Theme.accent : Theme.fg)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                    if chart.isTimeKnown {
                        Text(chart.ascendantDegreeText)
                            .font(.brutMono(13))
                            .foregroundStyle(Theme.accent.opacity(0.8))
                            .fixedSize()
                    }
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(details.fullName)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.fg)
                    Text("\(birthLine)\n\(details.placeName)")
                        .font(.brutMono(12, weight: .medium))
                        .foregroundStyle(Theme.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.top, 12)
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(alignment: .topTrailing) {
                // Kept in the card's top corner, clear of the lagna's name.
                OrbitDecoration(color: Theme.fg.opacity(0.3))
                    .frame(width: 150, height: 96)
                    .offset(x: 6, y: -4)
            }
            .clipShape(RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous))
            .brutCard()
            .accessibilityElement(children: .combine)
            .accessibilityLabel(
                chart.isTimeKnown
                    ? "Lagna \(chart.ascendantRashi.sanskrit), \(chart.ascendantDegreeText). \(details.fullName), born \(birthLine), \(details.placeName)"
                    : "Chandra lagna \(Rashi(english: chart.moonSign)?.sanskrit ?? chart.moonSign). Ascendant unknown. \(details.fullName), born \(birthLine), \(details.placeName)"
            )
        }
    }

    // MARK: - Moon and Sun

    /// The other two facts a Vedic chart is identified by.
    private var signRows: some View {
        VStack(alignment: .leading, spacing: 0) {
            DataRow(
                label: "Chandra (Moon sign)",
                value: rashiName(chart.moonSign),
                detail: script == .english ? nil : chart.moonSign
            )
            DataRow(
                label: "Surya (Sun sign)",
                value: rashiName(chart.sunSign),
                detail: script == .english ? nil : chart.sunSign
            )
        }
    }

    private var birthLine: String {
        chart.isTimeKnown ? "\(formattedBirthDate) at \(details.birthTimeShort)" : "\(formattedBirthDate), time unknown"
    }

    /// The chart the diagram and the table are drawn from: the birth chart,
    /// or — with no birth time — the same positions turned to the Moon.
    private var drawnChart: NatalChart {
        chart.isTimeKnown ? chart : chart.chandraLagna()
    }

    // MARK: - Unknown time

    /// Says plainly what is missing and offers the fix.
    private var timeUnknownNotice: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Image(systemName: "clock.badge.questionmark")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.accent)
                    .accessibilityHidden(true)
                Text("Ascendant uncertain — birth time unknown")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.fg)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text(moonCaveat)
                .font(.brutBody(13))
                .foregroundStyle(Theme.muted)
                .lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
            SancharaPrimaryButton(title: "Add birth time", kind: .accent) { showAddTime = true }
                .accessibilityHint("Opens your birth details with the time picker")
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .brutCard(fill: Theme.accent.opacity(0.06), line: Theme.accent.opacity(0.5))
    }

    private var moonCaveat: String {
        let base = "The chart below is counted from the Moon, so houses are “from the Moon” rather than from the ascendant."
        if let day = chart.moonDay, day.changesSign {
            return "\(base) The Moon moved from \(rashiName(day.startSign)) into \(rashiName(day.endSign)) that day, so even the Moon sign depends on the hour."
        }
        return "\(base) The Moon stayed in \(rashiName(chart.moonSign)) all day, so the Moon sign is certain."
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

    /// A dasha lord, which the API names in English, in the chosen script.
    private func grahaName(_ english: String) -> String {
        ChartPlanet.name(english: english, in: script)
    }

    /// "until Apr 2032", with the English name first when the value is not
    /// in English: "Venus · until Apr 2032".
    private func dashaDetail(_ lord: String, until end: String) -> String {
        let until = "until \(shortDate(end))"
        return script == .english ? until : "\(lord) · \(until)"
    }

    private func rashiName(_ english: String) -> String {
        Rashi(english: english)?.name(in: script) ?? english
    }

    /// The names toggle: a capsule showing the current choice, opening a
    /// menu of the four, each written in its own script.
    private var namesMenu: some View {
        Menu {
            Picker("Names", selection: $script) {
                ForEach(NameScript.allCases) { option in
                    Text(option.label).tag(option)
                }
            }
        } label: {
            HStack(spacing: 6) {
                Text("Names")
                    .foregroundStyle(Theme.muted)
                Text(script.label)
                    .foregroundStyle(Theme.fg)
                Image(systemName: "chevron.down")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(Theme.muted)
            }
            .font(.system(size: 13, weight: .semibold))
            .padding(.horizontal, 14)
            .frame(minHeight: 36)
            .background {
                Capsule().fill(Theme.fg.opacity(0.06))
                Capsule().strokeBorder(Theme.line, lineWidth: Theme.lineWidth)
            }
            .contentShape(Capsule())
        }
        .accessibilityLabel("Planet and sign names: \(script.label)")
        .accessibilityHint("Choose Sanskrit, Hindi, Gujarati or English")
    }

    // MARK: - The chart

    private var chartBlock: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(chart.isTimeKnown ? "Rashi chart" : "Chandra chart · houses from the Moon").eyebrow()

            KundliChartView(chart: drawnChart, selected: $selectedHouse, script: script)
                .padding(14)
                .brutCard()

            // `charting-data.md › Designing effective charts`: "If you need to
            // create a chart that presents data in a novel way, help people
            // learn how to interpret the chart." Most people meeting a North
            // Indian kundli for the first time assume the numbers are houses.
            Text(chart.isTimeKnown
                 ? "Houses sit in fixed places — the top diamond is always the first. The numeral in each is its rashi, counted from Mesha. Tap a house to see what it holds."
                 : "The Moon's sign sits in the top diamond, and each house after it is counted from the Moon. The numeral in each is its rashi, counted from Mesha.")
                .font(.brutBody(13))
                .foregroundStyle(Theme.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: - Dasha

    @ViewBuilder
    private var dashaBlock: some View {
        if let dasha = chart.dasha {
            VStack(alignment: .leading, spacing: 0) {
                Text("Vimshottari dasha").eyebrow()
                    .padding(.bottom, 2)
                DataRow(
                    label: "Mahadasha",
                    value: grahaName(dasha.mahadasha),
                    detail: dashaDetail(dasha.mahadasha, until: dasha.mahadashaEnd)
                )
                DataRow(
                    label: "Antardasha",
                    value: grahaName(dasha.antardasha),
                    detail: dashaDetail(dasha.antardasha, until: dasha.antardashaEnd),
                    showsRule: false
                )
                ViewMoreRow(title: "What the periods are") { showPeriods = true }
                if embedded {
                    ViewMoreRow(title: "See them on your life map", showsTopRule: false) {
                        navigator.open(.life)
                    }
                }
            }
        }
    }

    private func shortDate(_ iso: String) -> String {
        ChartFacts.calendarDay(iso, format: "MMM yyyy")
    }

    // MARK: - The table

    /// Everything the diagram encodes, in rows. This is the accessible path
    /// through the chart and the one that survives the largest text sizes.
    private var planetTable: some View {
        VStack(alignment: .leading, spacing: 10) {
            TableBand(leading: "Graha", trailing: "Sign · House")

            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(drawnChart.planets.enumerated()), id: \.element.id) { index, planet in
                    if index > 0 {
                        BrutDivider()
                    }
                    Button {
                        selectedHouse = drawnChart.house(planet.house)
                    } label: {
                        HStack(spacing: 12) {
                            GlyphCircle(glyph: planet.glyph)
                            VStack(alignment: .leading, spacing: 2) {
                                HStack(alignment: .firstTextBaseline, spacing: 6) {
                                    Text(planet.name(in: script) + (planet.retrograde ? " ℞" : ""))
                                        .font(.system(size: 15, weight: .semibold))
                                        .foregroundStyle(Theme.fg)
                                    if script != .english {
                                        Text(planet.name)
                                            .font(.system(size: 12, weight: .medium))
                                            .foregroundStyle(Theme.muted)
                                    }
                                }
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                                if let nakshatra = planet.nakshatra {
                                    Text(nakshatra)
                                        .font(.brutMono(11, weight: .medium))
                                        .foregroundStyle(Theme.muted)
                                }
                            }
                            Spacer(minLength: 8)
                            VStack(alignment: .trailing, spacing: 2) {
                                Text(planet.name == "Moon" && !chart.isTimeKnown ? rashiName(planet.sign) : "\(rashiName(planet.sign)) \(planet.degreeText)")
                                    .font(.brutMono(12))
                                    .foregroundStyle(Theme.fg)
                                Text(chart.isTimeKnown ? "House \(planet.house)" : "\(planet.house) from Moon")
                                    .font(.brutMono(11, weight: .medium))
                                    .foregroundStyle(Theme.muted)
                            }
                            Image(systemName: "chevron.right")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(Theme.muted)
                                .accessibilityHidden(true)
                        }
                        .padding(.vertical, 10)
                        .frame(minHeight: 54)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(planet.spokenDescription)
                    .accessibilityHint("Opens house \(planet.house)")
                }
            }
            .padding(.horizontal, 4)
            .overlay(alignment: .bottom) { BrutDivider() }
        }
    }

    // MARK: - Footer

    private var footer: some View {
        VStack(alignment: .leading, spacing: 12) {
            ViewMoreRow(
                title: "Export as PDF",
                systemImage: "square.and.arrow.up",
                isLoading: isPreparingPDF
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
    /// Carries a question about this house to Ask. Nil hides the button —
    /// when the kundli is itself a sheet there is no Ask tab to go to.
    var onAsk: ((String) -> Void)? = nil
    /// True when the birth time is unknown and houses are counted from the Moon.
    var fromMoon = false

    @Environment(\.dismiss) private var dismiss
    @AppStorage(NameScript.storageKey) private var script: NameScript = .sanskrit

    /// "1st", "2nd", "7th", "11th".
    private var ordinal: String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .ordinal
        return formatter.string(from: NSNumber(value: house.number)) ?? "\(house.number)"
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Atmosphere(mood: .dusk)
                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(fromMoon
                                 ? (house.isLagna ? "House 1 · the Moon's sign" : "House \(house.number) from the Moon")
                                 : (house.isLagna ? "House 1 · Lagna" : "House \(house.number)"))
                                .eyebrow()
                            Text(house.rashi.name(in: script))
                                .font(.brutDisplay(44))
                                .tracking(-44 * 0.035)
                                .foregroundStyle(Theme.accent)
                                .lineLimit(1)
                                .minimumScaleFactor(0.6)
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
                                        BrutDivider()
                                    }
                                    HStack(spacing: 14) {
                                        GlyphCircle(glyph: planet.glyph)
                                        VStack(alignment: .leading, spacing: 3) {
                                            Text(planet.name(in: script) + (script == .english ? "" : " · \(planet.name)") + (planet.retrograde ? " ℞ retrograde" : ""))
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
                            .overlay(alignment: .top) { BrutDivider() }
                            .overlay(alignment: .bottom) { BrutDivider() }
                        }

                        if let onAsk {
                            SancharaPrimaryButton(title: fromMoon ? "Ask about the \(ordinal) from my Moon" : "Ask Astrya about my \(ordinal) house", kind: .accent) {
                                dismiss()
                                onAsk(fromMoon
                                      ? "Counting from my Moon, what does the \(ordinal) house (\(house.rashi.sanskrit)) say about \(house.domain.lowercased())?"
                                      : "What does my \(ordinal) house (\(house.rashi.sanskrit)) say about \(house.domain.lowercased())?")
                            }
                            .accessibilityHint("Opens Ask with this question ready to send")
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

// MARK: - Glyph

/// A graha's glyph in a thin outlined circle: the round node the table and the
/// house sheet both use.
private struct GlyphCircle: View {
    let glyph: String
    var size: CGFloat = 34

    var body: some View {
        Text(glyph)
            .font(.system(size: size * 0.48))
            .foregroundStyle(Theme.accent)
            .frame(width: size, height: size)
            .background {
                Circle().fill(Theme.fg.opacity(0.04))
                Circle().strokeBorder(Theme.line, lineWidth: Theme.lineWidth)
            }
            .accessibilityHidden(true)
    }
}
