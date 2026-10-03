import SwiftUI

/// Renders the model's markdown the way `.prose-reading` does on the web:
/// headings as headings, disc bullets, accent-coloured links, and the closing
/// **In simple words** section lifted into a yellow callout so the one part
/// written for someone in a hurry is the part that stands out.
///
/// SwiftUI's `AttributedString(markdown:)` handles inline syntax but collapses
/// block structure, so blocks are split here and each one's inline runs are
/// parsed on their own.
struct MarkdownText: View {
    let markdown: String

    var body: some View {
        let blocks = MarkdownBlock.parse(markdown)
        let split = MarkdownBlock.splitSimpleWords(blocks)

        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(split.main.enumerated()), id: \.offset) { index, block in
                row(for: block, ink: Theme.fg)
                    .padding(.top, index == 0 ? 0 : block.topSpacing)
            }
            if !split.simple.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(split.simple.enumerated()), id: \.offset) { index, block in
                        row(for: block, ink: Theme.ink)
                            .padding(.top, index == 0 ? 0 : block.topSpacing)
                    }
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .brutCard(fill: Theme.yellow)
                .padding(.top, 16)
                .accessibilityElement(children: .combine)
            }
        }
        .tint(Theme.accent)
    }

    @ViewBuilder
    private func row(for block: MarkdownBlock, ink: Color) -> some View {
        switch block {
        case .heading(let text):
            Text(MarkdownBlock.inline(text))
                .font(.brutTitle(16))
                .foregroundStyle(ink)
                .fixedSize(horizontal: false, vertical: true)
        case .paragraph(let text):
            Text(MarkdownBlock.inline(text))
                .font(.brutBody(15))
                .lineSpacing(4)
                .foregroundStyle(ink == Theme.ink ? ink : ink.opacity(0.92))
                .fixedSize(horizontal: false, vertical: true)
        case .bullet(let marker, let text):
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(marker)
                    .font(.brutMono(13, weight: .bold))
                    .foregroundStyle(ink == Theme.ink ? ink : Theme.accent)
                Text(MarkdownBlock.inline(text))
                    .font(.brutBody(15))
                    .lineSpacing(4)
                    .foregroundStyle(ink == Theme.ink ? ink : ink.opacity(0.92))
                    .fixedSize(horizontal: false, vertical: true)
            }
        case .rule:
            Rectangle()
                .fill(ink == Theme.ink ? Theme.ink.opacity(0.4) : Theme.rule)
                .frame(height: 1)
        }
    }
}

enum MarkdownBlock: Equatable {
    case heading(String)
    case paragraph(String)
    /// A list item plus the marker to draw beside it ("•" or "1.").
    case bullet(marker: String, text: String)
    case rule

    /// Matches the CSS margins: paragraphs 0.6rem, headings 1.1rem, items 0.25rem.
    var topSpacing: CGFloat {
        switch self {
        case .heading: 16
        case .paragraph: 10
        case .bullet: 5
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

    /// The reading's closing section, split off from the rest.
    ///
    /// The prompt asks for every answer to end with a section titled
    /// **In simple words**. Everything from that heading on is returned as
    /// `simple`; if the heading has not arrived (mid-stream, or an answer that
    /// ignored the rule) `simple` is empty and `main` is the whole thing.
    static func splitSimpleWords(_ blocks: [MarkdownBlock]) -> (main: [MarkdownBlock], simple: [MarkdownBlock]) {
        guard let index = blocks.lastIndex(where: { block in
            if case .heading(let text) = block { return isSimpleWordsHeading(text) }
            return false
        }) else {
            return (blocks, [])
        }
        return (Array(blocks[..<index]), Array(blocks[index...]))
    }

    static func isSimpleWordsHeading(_ text: String) -> Bool {
        text.replacingOccurrences(of: "*", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines.union(.punctuationCharacters))
            .lowercased() == "in simple words"
    }

    /// `# Heading`, and also a line that is nothing but one bold run
    /// (`**Career**`), which is how the prompt asks for section titles.
    private static func headingText(_ line: String) -> String? {
        if line.hasPrefix("#") {
            let hashes = line.prefix { $0 == "#" }
            guard hashes.count <= 6 else { return nil }
            let rest = line.dropFirst(hashes.count)
            guard rest.hasPrefix(" ") else { return nil }
            return String(rest.dropFirst())
        }
        if line.hasPrefix("**"), line.hasSuffix("**"), line.count > 4 {
            let inner = line.dropFirst(2).dropLast(2)
            // One run only: a sentence with two bold words is a paragraph.
            guard !inner.contains("**") else { return nil }
            let text = inner.trimmingCharacters(in: .whitespaces)
            // A heading is short. A whole bold sentence is emphasis, not a title.
            guard !text.isEmpty, text.count <= 60 else { return nil }
            return text
        }
        return nil
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
