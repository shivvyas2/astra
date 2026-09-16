import SwiftUI

/// Renders the model's markdown the way `.prose-reading` does on the web:
/// bold headings at body size, disc bullets, and accent-coloured links.
///
/// SwiftUI's `AttributedString(markdown:)` handles inline syntax but collapses
/// block structure, so blocks are split here and each one's inline runs are
/// parsed on their own.
struct MarkdownText: View {
    let markdown: String

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(MarkdownBlock.parse(markdown).enumerated()), id: \.offset) { index, block in
                row(for: block)
                    .padding(.top, index == 0 ? 0 : block.topSpacing)
            }
        }
        .tint(Theme.accent)
    }

    @ViewBuilder
    private func row(for block: MarkdownBlock) -> some View {
        switch block {
        case .heading(let text):
            Text(MarkdownBlock.inline(text))
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(Theme.fg)
        case .paragraph(let text):
            Text(MarkdownBlock.inline(text))
                .font(.system(size: 15))
                .lineSpacing(4)
                .foregroundStyle(Theme.fg.opacity(0.9))
                .fixedSize(horizontal: false, vertical: true)
        case .bullet(let marker, let text):
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(marker)
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.muted)
                Text(MarkdownBlock.inline(text))
                    .font(.system(size: 15))
                    .lineSpacing(4)
                    .foregroundStyle(Theme.fg.opacity(0.9))
                    .fixedSize(horizontal: false, vertical: true)
            }
        case .rule:
            Rectangle()
                .fill(Theme.hairline)
                .frame(height: 1)
        }
    }
}

enum MarkdownBlock {
    case heading(String)
    case paragraph(String)
    /// A list item plus the marker to draw beside it ("•" or "1.").
    case bullet(marker: String, text: String)
    case rule

    /// Matches the CSS margins: paragraphs 0.6rem, headings 1.1rem, items 0.25rem.
    var topSpacing: CGFloat {
        switch self {
        case .heading: 14
        case .paragraph: 10
        case .bullet: 4
        case .rule: 14
        }
    }

    static func parse(_ markdown: String) -> [MarkdownBlock] {
        var blocks: [MarkdownBlock] = []
        var paragraph: [String] = []

        func flushParagraph() {
            let joined = paragraph.joined(separator: " ").trimmingCharacters(in: .whitespaces)
            if !joined.isEmpty { blocks.append(.paragraph(joined)) }
            paragraph.removeAll()
        }

        for rawLine in markdown.components(separatedBy: .newlines) {
            let line = rawLine.trimmingCharacters(in: .whitespaces)

            if line.isEmpty {
                flushParagraph()
                continue
            }
            if line == "---" || line == "***" || line == "___" {
                flushParagraph()
                blocks.append(.rule)
                continue
            }
            if let heading = headingText(line) {
                flushParagraph()
                blocks.append(.heading(heading))
                continue
            }
            if let item = bulletItem(line) {
                flushParagraph()
                blocks.append(item)
                continue
            }
            paragraph.append(line)
        }
        flushParagraph()
        return blocks
    }

    private static func headingText(_ line: String) -> String? {
        guard line.hasPrefix("#") else { return nil }
        let hashes = line.prefix { $0 == "#" }
        guard hashes.count <= 6 else { return nil }
        let rest = line.dropFirst(hashes.count)
        guard rest.hasPrefix(" ") else { return nil }
        return String(rest.dropFirst())
    }

    private static func bulletItem(_ line: String) -> MarkdownBlock? {
        for marker in ["- ", "* ", "+ "] where line.hasPrefix(marker) {
            return .bullet(marker: "•", text: String(line.dropFirst(marker.count)))
        }
        // "1. " / "12) " style ordered items keep their own number.
        let digits = line.prefix { $0.isNumber }
        guard !digits.isEmpty, digits.count <= 3 else { return nil }
        let rest = line.dropFirst(digits.count)
        guard rest.hasPrefix(". ") || rest.hasPrefix(") ") else { return nil }
        return .bullet(marker: "\(digits).", text: String(rest.dropFirst(2)))
    }

    /// Bold, italics, code, and links inside one block.
    static func inline(_ text: String) -> AttributedString {
        (try? AttributedString(
            markdown: text,
            options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        )) ?? AttributedString(text)
    }
}
