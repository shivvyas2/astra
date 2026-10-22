import { Fragment, type ReactNode } from "react";

/**
 * A translated sentence with marked words wrapped in elements, so a link can
 * sit wherever each language puts it: `rich(t.auth.agree, { terms: (s) =>
 * <Link href="/terms">{s}</Link> })` for "…the <terms>Terms of use</terms>…".
 * Unmarked text stays plain; a tag with no renderer keeps its words.
 */
export function rich(template: string, tags: Record<string, (chunk: string) => ReactNode>): ReactNode {
  const out: ReactNode[] = [];
  const pattern = /<(\w+)>(.*?)<\/\1>/g;
  let last = 0;
  let key = 0;
  for (let m = pattern.exec(template); m; m = pattern.exec(template)) {
    if (m.index > last) out.push(template.slice(last, m.index));
    const render = tags[m[1]];
    out.push(<Fragment key={key++}>{render ? render(m[2]) : m[2]}</Fragment>);
    last = m.index + m[0].length;
  }
  if (last < template.length) out.push(template.slice(last));
  return <>{out}</>;
}

/** The same sentence with its marks taken out, for a title or an aria-label. */
export function plain(template: string): string {
  return template.replace(/<(\w+)>(.*?)<\/\1>/g, "$2");
}
