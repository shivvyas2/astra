import Foundation

/// The countries phone sign-in takes. Codes go out through Twilio Verify, set
/// up as Supabase's phone provider (docs/PHONE_SIGN_IN.md).
enum PhoneCountry: String, CaseIterable, Identifiable {
    case india = "IN"
    case unitedStates = "US"

    var id: String { rawValue }

    var flag: String { self == .india ? "🇮🇳" : "🇺🇸" }
    var dialCode: String { self == .india ? "+91" : "+1" }
    var name: String { self == .india ? L10n.string("India") : L10n.string("United States") }
    /// A sample number in the shape people write it.
    var placeholder: String { self == .india ? "98765 43210" : "(555) 123-4567" }

    /// The US for US phones, India for everyone else: most of Astrya's readers.
    static var preferred: PhoneCountry {
        Locale.current.region?.identifier == "US" ? .unitedStates : .india
    }

    /// The number in E.164 ("+919876543210"), or nil when it can't be a
    /// mobile number in this country. Accepts what people actually type or
    /// paste: spaces, dashes, brackets, a leading 0 (India), a leading 1 (US),
    /// or the country code itself.
    func e164(_ input: String) -> String? {
        var digits = input.filter(\.isASCIIDigit)
        let code = String(dialCode.dropFirst())
        if digits.count == 10 + code.count, digits.hasPrefix(code) { digits.removeFirst(code.count) }
        if self == .india, digits.count == 11, digits.hasPrefix("0") { digits.removeFirst() }
        guard digits.count == 10, let first = digits.first else { return nil }
        switch self {
        case .india:
            // Indian mobile numbers start with 6, 7, 8 or 9.
            guard "6789".contains(first) else { return nil }
        case .unitedStates:
            // Neither the area code nor the exchange starts with 0 or 1.
            let exchange = digits[digits.index(digits.startIndex, offsetBy: 3)]
            guard !"01".contains(first), !"01".contains(exchange) else { return nil }
        }
        return dialCode + digits
    }

    /// The country an E.164 number belongs to, among these two.
    static func of(e164: String) -> PhoneCountry? {
        if e164.hasPrefix("+91") { return .india }
        if e164.hasPrefix("+1") { return .unitedStates }
        return nil
    }

    /// "+91 98765 43210", "+1 (555) 123-4567": for showing a number back.
    static func display(_ e164: String) -> String {
        guard let country = of(e164: e164) else { return e164 }
        let d = Array(e164.dropFirst(country.dialCode.count))
        guard d.count == 10 else { return e164 }
        switch country {
        case .india:
            return "+91 \(String(d[0..<5])) \(String(d[5..<10]))"
        case .unitedStates:
            return "+1 (\(String(d[0..<3]))) \(String(d[3..<6]))-\(String(d[6..<10]))"
        }
    }
}

private extension Character {
    var isASCIIDigit: Bool { isASCII && isNumber }
}
