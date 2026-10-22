import XCTest
@testable import Sanchara

/// The app's words in Hindi and Gujarati.
///
/// The catalog test reads the source `Localizable.xcstrings`, not the compiled
/// tables, so a key added in code without a translation fails here instead of
/// quietly showing English to someone who reads only Gujarati.
final class LocalizationTests: XCTestCase {

    // MARK: - Catalog

    private struct Catalog: Decodable {
        let strings: [String: Entry]
        struct Entry: Decodable {
            var shouldTranslate: Bool?
            var localizations: [String: Localization]?
        }
        struct Localization: Decodable {
            var stringUnit: Unit?
            var variations: Variations?
        }
        struct Variations: Decodable { var plural: [String: Localization]? }
        struct Unit: Decodable { var value: String }
    }

    private func catalog() throws -> Catalog {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Resources/Localizable.xcstrings")
        return try JSONDecoder().decode(Catalog.self, from: Data(contentsOf: url))
    }

    /// Every value a localization holds: one, or one per plural form.
    private func values(_ localization: Catalog.Localization?) -> [String] {
        guard let localization else { return [] }
        if let value = localization.stringUnit?.value { return [value] }
        return (localization.variations?.plural ?? [:]).values.flatMap { values($0) }
    }

    /// `%@`, `%lld` and `%2$@` reduced to their types, sorted, so a translation
    /// that reorders its placeholders still matches its key.
    private func placeholders(_ text: String) -> [String] {
        let pattern = try! NSRegularExpression(pattern: "%(?:\\d+\\$)?(lld|ld|lf|li|d|f|@|u|llu)")
        let range = NSRange(text.startIndex..., in: text)
        return pattern.matches(in: text, range: range)
            .compactMap { Range($0.range(at: 1), in: text).map { String(text[$0]) } }
            .sorted()
    }

    func testEveryKeyHasHindiAndGujarati() throws {
        let catalog = try catalog()
        XCTAssertGreaterThan(catalog.strings.count, 300, "The catalog looks empty")
        var missing: [String] = []
        for (key, entry) in catalog.strings where entry.shouldTranslate != false {
            for language in ["hi", "gu"] {
                let texts = values(entry.localizations?[language])
                if texts.isEmpty || texts.contains(where: { $0.trimmingCharacters(in: .whitespaces).isEmpty }) {
                    missing.append("\(language): \(key)")
                }
            }
        }
        XCTAssertEqual(missing.sorted(), [], "Untranslated keys")
    }

    func testTranslationsKeepTheirPlaceholdersAndHaveNoEmDash() throws {
        for (key, entry) in try catalog().strings where entry.shouldTranslate != false {
            for language in ["hi", "gu"] {
                for text in values(entry.localizations?[language]) {
                    XCTAssertFalse(text.contains("—"), "Em dash in \(language) for \(key)")
                    // A plural form may drop the count ("one day"), never add one.
                    let have = placeholders(text), want = placeholders(key)
                    if entry.localizations?[language]?.variations == nil {
                        XCTAssertEqual(have, want, "Placeholders differ in \(language) for \(key)")
                    } else {
                        XCTAssertTrue(Set(have).isSubset(of: Set(want)), "Placeholders differ in \(language) for \(key)")
                    }
                }
            }
            XCTAssertFalse(key.contains("—"), "Em dash in English: \(key)")
        }
    }

    // MARK: - The language setting

    func testReadingLanguageDrivesTheUILanguage() {
        XCTAssertEqual(ReadingLanguage.hindi.uiCode, "hi")
        XCTAssertEqual(ReadingLanguage.gujarati.uiCode, "gu")
        XCTAssertEqual(ReadingLanguage.english.uiCode, "en")
        XCTAssertEqual(ReadingLanguage.sanskrit.uiCode, "en")
        XCTAssertEqual(ReadingLanguage(uiCode: "gu"), .gujarati)
        XCTAssertEqual(ReadingLanguage(uiCode: "hi"), .hindi)
        XCTAssertEqual(ReadingLanguage(uiCode: "en"), .english)
    }

    func testAChoiceWinsOverTheSystemAndTheSystemOverEnglish() {
        XCTAssertEqual(AppLanguage.resolve(chosen: "en", preferred: ["hi"]), "en")
        XCTAssertEqual(AppLanguage.resolve(chosen: "gu", preferred: ["en"]), "gu")
        XCTAssertEqual(AppLanguage.resolve(chosen: nil, preferred: ["gu-IN"]), "gu")
        XCTAssertEqual(AppLanguage.resolve(chosen: nil, preferred: ["hi_IN", "en"]), "hi")
        XCTAssertEqual(AppLanguage.resolve(chosen: nil, preferred: ["en-GB"]), "en")
        XCTAssertEqual(AppLanguage.resolve(chosen: nil, preferred: ["fr"]), "en")
        XCTAssertEqual(AppLanguage.code(forReading: "hindi"), "hi")
        XCTAssertEqual(AppLanguage.code(forReading: "sanskrit"), "en")
        XCTAssertNil(AppLanguage.code(forReading: nil))
    }

    func testLocalesKeepWesternDigits() {
        for code in ["hi", "gu"] {
            let locale = AppLanguage.locale(for: code)
            XCTAssertEqual(locale.language.languageCode?.identifier, code)
            let text = 1234.5.formatted(.number.locale(locale)) + Date(timeIntervalSince1970: 0).formatted(.dateTime.year().locale(locale))
            XCTAssertTrue(text.unicodeScalars.filter { CharacterSet.decimalDigits.contains($0) }.allSatisfy { $0.isASCII }, text)
        }
    }

    /// The live switch, end to end through the compiled catalog.
    func testSwitchingChangesStringsImmediately() {
        let defaults = UserDefaults.standard
        let before = defaults.object(forKey: "AppleLanguages")
        let shared = UserDefaults(suiteName: ChartCache.appGroup)
        let mirror = shared?.object(forKey: AppLanguage.mirrorKey)
        let start = AppLanguage.shared.code
        defer {
            AppLanguage.shared.apply(code: start)
            defaults.set(before, forKey: "AppleLanguages")
            shared?.set(mirror, forKey: AppLanguage.mirrorKey)
        }

        AppLanguage.shared.apply(code: "gu")
        XCTAssertEqual(L10n.string("Today"), "આજ")
        XCTAssertEqual(defaults.stringArray(forKey: "AppleLanguages"), ["gu"])
        XCTAssertEqual(shared?.string(forKey: AppLanguage.mirrorKey), "gu")

        AppLanguage.shared.apply(code: "hi")
        XCTAssertEqual(L10n.string("Today"), "आज")

        AppLanguage.shared.apply(code: "en")
        XCTAssertEqual(L10n.string("Today"), "Today")
    }
}
