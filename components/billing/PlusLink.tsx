import Link from "next/link";

/**
 * A row linking to /app/plus. Place on app/(app)/app/profile/page.tsx (or in
 * AppShell's NAV as { href: "/app/plus", label: "Astrya Plus", blurb: "Support Astrya" }).
 */
export function PlusLink({ plan }: { plan: "free" | "plus" }) {
  return (
    <Link href="/app/plus" className="mt-8 flex items-center justify-between gap-3 border-y-2 border-fg/20 py-3">
      <span>
        <span className="eyebrow block">Astrya Plus</span>
        <span className="mt-1 block text-[15px] font-bold">{plan === "plus" ? "Thank you for supporting Astrya" : "Support Astrya"}</span>
      </span>
      <span aria-hidden className="grid h-9 w-9 place-items-center rounded-full border-2 border-fg/30">→</span>
    </Link>
  );
}
