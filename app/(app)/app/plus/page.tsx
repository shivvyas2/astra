import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getPlan } from "@/lib/billing/plan";
import { MANAGE_SUBSCRIPTIONS_URL, PLUS_ENABLED, PLUS_PRICES, PRIVACY_PATH, TERMS_URL } from "@/lib/billing/copy";
import { getI18n } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/**
 * Astrya Plus on the web. Subscriptions are bought in the iPhone app (StoreKit)
 * for now; selling on the web would need a web payment provider (Stripe),
 * which is deliberately not wired up. This page explains Plus, shows the plan
 * the account is on, and points subscribers to Apple to manage it.
 */
export default async function PlusPage() {
  if (!PLUS_ENABLED) notFound();
  const db = await createServerSupabase();
  const i18n = await getI18n();
  const { t, f } = i18n;
  const p = t.plus;
  const { data: { user } } = await db.auth.getUser();
  const plan = user ? await getPlan(db, user.id) : "free";
  let renews: string | null = null;
  if (user && plan === "plus") {
    const { data } = await db.from("subscriptions").select("expires_at").eq("user_id", user.id).maybeSingle();
    const at = (data as { expires_at?: string } | null)?.expires_at;
    if (at) renews = i18n.date(at, { day: "numeric", month: "long", year: "numeric" });
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-xl px-4 py-10 sm:px-6">
        <div className="flex items-center">
          <p className="screen-eyebrow">{p.eyebrow}</p>
        </div>
        <h1 className="headline headline-arrow mt-3 text-5xl sm:text-6xl">{p.title}</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-muted">{p.intro}</p>

        <div className="mt-8 border-t border-rule">
          <div className="flex items-baseline justify-between gap-4 border-b border-rule py-4">
            <span className="text-sm text-muted">{p.yourPlan}</span>
            <span className="text-3xl font-medium tracking-tight">{plan === "plus" ? p.plus : p.free}</span>
          </div>
          {renews && (
            <div className="flex items-baseline justify-between gap-4 border-b border-rule py-4">
              <span className="text-sm text-muted">{p.renews}</span>
              <span className="font-mono text-sm">{renews}</span>
            </div>
          )}
        </div>

        <ul className="mt-8 space-y-5">
          {p.benefits.map((b, i) => (
            <li key={b.title} className="flex gap-4">
              <span className="number-badge h-fit">{String(i + 1).padStart(2, "0")}.</span>
              <span>
                <span className="block font-semibold">{b.title}</span>
                <span className="mt-1 block text-sm text-muted">{b.detail}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-8 grid grid-cols-2 gap-3">
          {[PLUS_PRICES.monthly, PLUS_PRICES.yearly].map((price) => (
            <div key={price.id} className="brut-card p-4">
              <p className="eyebrow">{price.per === "month" ? p.monthly : p.yearly}</p>
              <p className="mt-2 text-3xl font-light tabular-nums tracking-tight">{price.price}</p>
              <p className="text-xs text-muted">
                {price.per === "month" ? p.perMonth : p.perYear}
                {"perMonth" in price ? ` · ${f(p.perMonthPrice, { price: price.perMonth })}` : ""}
              </p>
            </div>
          ))}
        </div>

        <div className="brut-bordered mt-6 p-4">
          <p className="text-sm font-semibold">{p.subscribeTitle}</p>
          <p className="mt-1 text-sm text-muted">{p.subscribeBody}</p>
          {plan === "plus" && (
            <a href={MANAGE_SUBSCRIPTIONS_URL} target="_blank" rel="noreferrer" className="brut-btn brut-btn-secondary mt-4 px-4 py-2 text-sm">
              {p.manage}
            </a>
          )}
        </div>

        <p className="mt-8 text-xs text-muted">
          <a href={TERMS_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2">{p.termsOfUse}</a>
          {" · "}
          <Link href={PRIVACY_PATH} className="underline underline-offset-2">{p.privacyPolicy}</Link>
        </p>
      </div>
    </div>
  );
}
