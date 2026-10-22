import { BASIS_TITLE, SIMPLE_TITLE } from "./language";

/** The heading of a reading's last section; the prompt asks for it by this name. */
export const CHART_BASIS_TITLE = "Chart basis";

/**
 * A reading split the way it is shown: the body, the closing "In simple
 * words" callout, and the chart facts it rests on, which readers fold into
 * "Why Astrya said this". Each part is null until its heading has streamed
 * in, so a half-written reading renders as ordinary prose. Mirrored on iOS by
 * `MarkdownBlock.splitReading`.
 */
export type ReadingParts = { main: string; simple: string | null; basis: string[] | null };

// Every language's title is recognised, so a Gujarati or Hindi reading splits
// the same way an English one does.
const titles = (map: Record<string, string>) => [...new Set(Object.values(map))].join("|");
const SIMPLE = new RegExp(`\\*\\*\\s*(?:${titles(SIMPLE_TITLE)})\\s*:?\\s*\\*\\*`, "i");
const BASIS = new RegExp(`\\*\\*\\s*(?:${titles(BASIS_TITLE)})\\s*:?\\s*\\*\\*`, "i");

export function splitReading(content: string): ReadingParts {
  let rest = content;
  let basis: string[] | null = null;
  const b = BASIS.exec(rest);
  if (b) {
    basis = rest
      .slice(b.index + b[0].length)
      .split("\n")
      .map((line) => line.trim().replace(/^[-*•]\s+/, ""))
      .filter((line) => line.length > 0);
    rest = rest.slice(0, b.index);
  }
  const s = SIMPLE.exec(rest);
  if (!s) return { main: rest, simple: null, basis };
  return { main: rest.slice(0, s.index), simple: rest.slice(s.index).trimEnd(), basis };
}
