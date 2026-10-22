import Link from "next/link";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";

/** The top of a legal page: the way home, the language, the title, and on a translation, which text governs. */
export function LegalHeader({ title, authoritative }: { title: string; authoritative: string }) {
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="eyebrow">Astrya</Link>
        <LocaleSwitcher />
      </div>
      <h1 className="headline mt-4 text-5xl sm:text-6xl">{title}</h1>
      {authoritative && (
        <p className="mt-4 rounded-[14px] border border-line px-3.5 py-2.5 text-sm text-muted">{authoritative}</p>
      )}
    </>
  );
}

export function LegalSection({ title, points }: { title: string; points: readonly React.ReactNode[] }) {
  return (
    <section className="mt-8 border-t border-rule pt-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-muted">
        {points.map((p, i) => <li key={i}>{p}</li>)}
      </ul>
    </section>
  );
}
