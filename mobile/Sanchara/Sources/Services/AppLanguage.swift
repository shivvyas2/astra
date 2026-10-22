import Foundation
import Observation

/// The language the app's own words are shown in: English, Hindi or Gujarati.
///
/// One setting drives it, the person's language chip in Profile, which is also
/// the language readings are written in (`ReadingLanguage`). Hindi shows the
/// app in Hindi, Gujarati in Gujarati, and English and "Sanskrit terms" both
/// show it in English. Until someone has chosen, the app follows the language
/// iOS gives it (Settings › Astrya › Language, or the device's own), when that
/// is Hindi or Gujarati.
///
/// The switch is live. `RootView` puts `locale` into the environment, which is
/// what `Text("…")` looks its catalog entry up with, and `L10n.string` reads
/// `code` while a view's body runs, so Observation redraws every view that
/// built a string from it. Nothing waits for a relaunch.
///
/// Compiled into the widget extension too. The extension cannot read the
/// app's own defaults, so the app mirrors the code into the App Group and the
/// widget reads it from there.
@Observable
final class AppLanguage {
    static let shared = AppLanguage()

    /// The languages the app's catalog is written in.
    static let supported = ["en", "hi", "gu"]

    /// Where the app leaves the code for the widget extension.
    static let mirrorKey = "ui.language"

    /// "en", "hi" or "gu".
    private(set) var code: String

    /// What dates, numbers and catalog lookups use. Hindi and Gujarati keep
    /// Western digits, so degrees, times and figures read the same as they do
    /// in the readings.
    var locale: Locale { Self.locale(for: code) }

    init() {
        code = Self.stored()
    }

    /// Reads the choice again. The widget calls this before each timeline:
    /// its process can outlive a change made in the app.
    func reload() {
        let current = Self.stored()
        if current != code { code = current }
    }

    /// The app's own choice, else the one it mirrored for the widget, else
    /// the language iOS offers this bundle.
    private static func stored() -> String {
        let chosen = code(forReading: UserDefaults.standard.string(forKey: readingKey))
            ?? UserDefaults(suiteName: ChartCache.appGroup)?.string(forKey: mirrorKey)
        return resolve(chosen: chosen, preferred: Bundle.main.preferredLocalizations)
    }

    /// Switches the app's language now, and tells iOS so that system strings
    /// and the next launch agree with it.
    func apply(code newCode: String) {
        let resolved = Self.resolve(chosen: newCode, preferred: [])
        code = resolved
        UserDefaults.standard.set([resolved], forKey: "AppleLanguages")
        UserDefaults(suiteName: ChartCache.appGroup)?.set(resolved, forKey: Self.mirrorKey)
    }

    // MARK: - Pure rules, kept separate so tests can check them

    /// The key `ReadingLanguage` is stored under in the app's defaults. Spelled
    /// out here because the widget extension does not compile ReadingLanguage.
    static let readingKey = "reading.language"

    /// A stored reading language's raw value to the UI language it implies.
    /// Nil when nothing has been chosen.
    static func code(forReading raw: String?) -> String? {
        switch raw {
        case "hindi": "hi"
        case "gujarati": "gu"
        case "english", "sanskrit": "en"
        default: nil
        }
    }

    /// A choice wins. Without one, the first preferred localization iOS
    /// offers the app, when it is one the catalog has; English otherwise.
    static func resolve(chosen: String?, preferred: [String]) -> String {
        if let chosen, let match = supportedCode(chosen) { return match }
        for language in preferred {
            if let match = supportedCode(language) { return match }
        }
        return "en"
    }

    static func locale(for code: String) -> Locale {
        code == "en" ? Locale(identifier: "en") : Locale(identifier: "\(code)@numbers=latn")
    }

    /// "hi-IN", "gu_IN" and "hi" all mean Hindi or Gujarati; "en-GB" is English.
    private static func supportedCode(_ identifier: String) -> String? {
        let base = identifier.lowercased().split(whereSeparator: { $0 == "-" || $0 == "_" }).first.map(String.init)
        guard let base, supported.contains(base) else { return nil }
        return base
    }
}

/// UI copy as a `String`, in the app's chosen language, for the places a `Text`
/// cannot go: component parameters, accessibility labels, alerts, errors kept
/// by stores, widget lines.
///
/// The parameter is a `LocalizedStringResource`, so the compiler extracts each
/// literal into `Localizable.xcstrings` the same way it does for `Text`, and
/// interpolations and plural variations work as they do there.
enum L10n {
    static func string(_ resource: LocalizedStringResource) -> String {
        var resource = resource
        resource.locale = AppLanguage.shared.locale
        return String(localized: resource)
    }

    /// For formatters built by hand (`DateFormatter`, `.formatted(...)`), so
    /// month and weekday names follow the app rather than the device.
    static var locale: Locale { AppLanguage.shared.locale }
}
