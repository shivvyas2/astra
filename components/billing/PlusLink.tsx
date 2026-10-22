import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";

/**
 * A row linking to /app/plus. Place on app/(app)/app/profile/page.tsx (or in
 * AppShell's NAV as { href: "/app/plus", label: "Astrya Plus", blurb: "Support Astrya" }).
 */
export async function PlusLink({ plan }: { plan: "free" | "plus" }) {
  const { t } = await getI18n();
  return (
    <Link href="/app/plus" className="mt-8 flex items-center justify-between gap-3 border-y border-rule py-3">
      <span>
        <span className="screen-eyebrow">{t.plus.eyebrow}</span>
        <span className="mt-1.5 block text-[15px] font-semibold">{plan === "plus" ? t.plus.thanks : t.plus.support}</span>
      </span>
      <span aria-hidden className="grid h-9 w-9 place-items-center rounded-full border border-line">→</span>
    </Link>
  );
}
