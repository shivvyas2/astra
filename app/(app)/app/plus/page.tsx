import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { getPlan } from "@/lib/billing/plan";
import { MANAGE_SUBSCRIPTIONS_URL, PLUS_BENEFITS, PLUS_PRICES, PRIVACY_PATH, TERMS_URL } from "@/lib/billing/copy";

export const dynamic = "force-dynamic";

/**
 * Astrya Plus on the web. Subscriptions are bought in the iPhone app (StoreKit)
 * for now; selling on the web would need a web payment provider (Stripe),
 * which is deliberately not wired up. This page explains Plus, shows the plan
 * the account is on, and points subscribers to Apple to manage it.
 */
export default async function PlusPage() {
  const db = await createServerSupabase();
  const { data: { user } } = await db.auth.getUser();
  const plan = user ? await getPlan(db, user.id) : "free";
  let renews: string | null = null;
  if (user && plan === "plus") {
    const { data } = await db.from("subscriptions").select("expires_at").eq("user_id", user.id).maybeSingle();
    const at = (data as { expires_at?: string } | null)?.expires_at;
    if (at) renews = new Date(at).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-xl px-4 py-10 sm:px-6">
        <p className="eyebrow flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-accent" aria-hidden />
          Astrya Plus
        </p>
        <h1 className="mt-3 text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl">Support Astrya</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-muted">
          Every reading is free and unlimited, Deep readings included. Plus is a way to keep it that way.
        </p>

        <div className="mt-8 border-t-2 border-fg/20">
          <div className="flex items-baseline justify-between gap-4 border-b-2 border-fg/20 py-4">
            <span className="text-sm text-muted">Your plan</span>
            <span className="text-2xl font-black tracking-tight">{plan === "plus" ? "Plus" : "Free"}</span>
          </div>
          {renews && (
            <div className="flex items-baseline justify-between gap-4 border-b-2 border-fg/20 py-4">
              <span className="text-sm text-muted">Renews or ends</span>
              <span className="font-mono text-sm">{renews}</span>
            </div>
          )}
        </div>

        <ul className="mt-8 space-y-5">
          {PLUS_BENEFITS.map((b, i) => (
            <li key={b.title} className="flex gap-4">
              <span className="font-mono text-sm font-bold text-accent">{String(i + 1).padStart(2, "0")}.</span>
              <span>
                <span className="block font-extrabold">{b.title}</span>
                <span className="mt-1 block text-sm text-muted">{b.detail}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-8 grid grid-cols-2 gap-3">
          {[PLUS_PRICES.monthly, PLUS_PRICES.yearly].map((p) => (
            <div key={p.id} className="brut-card p-4">
              <p className="eyebrow">{p.label}</p>
              <p className="mt-2 text-2xl font-black tracking-tight">{p.price}</p>
              <p className="text-xs text-muted">
                per {p.per}
                {"perMonth" in p ? ` · ${p.perMonth}/month` : ""}
              </p>
            </div>
          ))}
        </div>

        <div className="brut-bordered mt-6 p-4">
          <p className="text-sm font-bold">Subscribe in the iPhone app</p>
          <p className="mt-1 text-sm text-muted">
            For now Plus is sold through the App Store, in Astrya for iPhone under You → Astrya Plus. It is billed to your
            Apple ID and you can cancel any time in your Apple ID settings.
          </p>
          {plan === "plus" && (
            <a href={MANAGE_SUBSCRIPTIONS_URL} target="_blank" rel="noreferrer" className="brut-btn brut-btn-secondary mt-4 px-4 py-2 text-sm">
              Manage on iPhone
            </a>
          )}
        </div>

        <p className="mt-8 text-xs text-muted">
          <a href={TERMS_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2">Terms of Use</a>
          {" · "}
          <Link href={PRIVACY_PATH} className="underline underline-offset-2">Privacy Policy</Link>
        </p>
      </div>
    </div>
  );
}
