import Foundation

/// The houses a reading talks about, for the kundli seal at the top of an
/// answer: "your 10th house", "house 12", "houses 3 and 12", "the 7th bhava".
///
/// Order is first mention, so the seal's label reads the way the answer does.
/// Capped at four; past that the label stops saying anything a glance can use.
/// Answers in Hindi or Gujarati name houses in words, which this does not try
/// to read; those get the plain "Read from your chart".
enum ReadingHouses {
    static let limit = 4

    private static let patterns: [NSRegularExpression] = [
        // "10th house", "1st bhava", "12th houses"
        #"\b(1[0-2]|[1-9])(?:st|nd|rd|th)\s+(?:house|bhava)s?\b"#,
        // "house 12", "houses 3 and 12", "houses 3, 7 and 12", "bhava 4"
        #"\b(?:house|bhava)s?\s+((?:(?:1[0-2]|[1-9])(?:\s*,\s*|\s+and\s+|\s*&\s*)?)+)"#,
    ].map { try! NSRegularExpression(pattern: $0, options: [.caseInsensitive]) }

    private static let number = try! NSRegularExpression(pattern: #"1[0-2]|[1-9]"#)

    static func mentioned(in text: String) -> [Int] {
        let whole = NSRange(text.startIndex..., in: text)
        var found: [(at: Int, house: Int)] = []
        for pattern in patterns {
            for match in pattern.matches(in: text, range: whole) {
                let group = match.range(at: 1)
                guard let range = Range(group, in: text) else { continue }
                let span = String(text[range])
                for n in number.matches(in: span, range: NSRange(span.startIndex..., in: span)) {
                    if let r = Range(n.range, in: span), let house = Int(span[r]) {
                        found.append((group.location + n.range.location, house))
                    }
                }
            }
        }
        var seen = Set<Int>()
        return found
            .sorted { $0.at < $1.at }
            .map(\.house)
            .filter { seen.insert($0).inserted }
            .prefix(limit)
            .map { $0 }
    }
}
