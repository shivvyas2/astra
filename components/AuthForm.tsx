import Link from "next/link";
import { headers } from "next/headers";
import { Notice } from "@/components/Notice";
import { PHONE_COUNTRIES } from "@/lib/auth/phone";
import { PRIVACY_PATH, TERMS_PATH } from "@/lib/billing/copy";
import { getI18n } from "@/lib/i18n/server";
import { rich } from "@/lib/i18n/rich";

export async function AuthForm({
  title,
  subtitle,
  primaryLabel,
  primaryAction,
  magicAction,
  phoneAction,
  from,
  method = "email",
  footer,
  error,
  notice,
}: {
  title: string;
  subtitle?: string;
  primaryLabel: string;
  primaryAction: (fd: FormData) => void;
  magicAction?: (fd: FormData) => void;
  /** Sends a texted code; with it, an Email | Phone switch appears. */
  phoneAction?: (fd: FormData) => void;
  /** Which page this is, so the method switch and errors come back here. */
  from?: "login" | "signup";
  method?: "email" | "phone";
  footer: React.ReactNode;
  error?: string;
  notice?: string;
}) {
  const { t } = await getI18n();
  // US visitors start on +1; everyone else on +91, where most readers are.
  const country = (await headers()).get("x-vercel-ip-country") === "US" ? "US" : "IN";
  const phone = phoneAction && method === "phone";
  const path = from === "signup" ? "/signup" : "/login";
  const link = (href: string) => (s: string) => (
    <Link href={href} className="underline underline-offset-2 hover:text-fg">{s}</Link>
  );
  return (
    <div className="w-full max-w-sm">
      <div>
        <p className="screen-eyebrow">{t.auth.eyebrow}</p>
        <h1 className="headline headline-arrow mt-3 text-4xl sm:text-5xl">{title}</h1>
        {(phone ? t.auth.phoneSubtitle : subtitle) && (
          <p className="mt-3 text-[15px] leading-relaxed text-muted">{phone ? t.auth.phoneSubtitle : subtitle}</p>
        )}
        {error && <Notice className="mt-5">{error}</Notice>}
        {notice && <Notice tone="info" className="mt-5">{notice}</Notice>}
        {phoneAction && (
          // Plain links, so the switch works without JavaScript.
          <div className="mt-8 flex items-center gap-3" role="group" aria-label={t.auth.methodEmail + " / " + t.auth.methodPhone}>
            <span className="h-px flex-1 bg-rule" aria-hidden />
            <nav className="inline-flex rounded-full border border-line p-[3px]">
              {(["email", "phone"] as const).map((m) => (
                <Link
                  key={m}
                  href={m === "phone" ? `${path}?method=phone` : path}
                  aria-current={m === method ? "true" : undefined}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${
                    m === method ? "bg-fg text-ink" : "text-muted hover:text-fg"
                  }`}
                >
                  {m === "phone" ? t.auth.methodPhone : t.auth.methodEmail}
                </Link>
              ))}
            </nav>
            <span className="h-px flex-1 bg-rule" aria-hidden />
          </div>
        )}
        {phone ? (
          <form className="mt-6 space-y-6">
            <input type="hidden" name="from" value={from ?? "login"} />
            <label className="block">
              <span className="eyebrow block">{t.auth.phone}</span>
              <span className="phone-row">
                <select name="country" defaultValue={country} aria-label={t.auth.country} className="brut-field w-[5.75rem] shrink-0 pr-1">
                  {PHONE_COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.dial}
                    </option>
                  ))}
                </select>
                <span className="h-5 w-px bg-line" aria-hidden />
                <input
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  required
                  placeholder={t.auth.phonePlaceholder}
                  className="brut-field"
                />
              </span>
              <span className="mt-2 block text-xs text-muted">{t.auth.phoneHint}</span>
            </label>
            <button formAction={phoneAction} className="brut-btn brut-btn-primary brut-btn-arrow mt-2 min-h-[54px] w-full">
              {t.auth.textMeCode}
            </button>
          </form>
        ) : (
          <form className={`${phoneAction ? "mt-6" : "mt-8"} space-y-6`}>
            <label className="block">
              <span className="eyebrow block">{t.auth.email}</span>
              <input name="email" type="email" required placeholder={t.auth.emailPlaceholder} className="brut-field" />
            </label>
            <label className="block">
              <span className="eyebrow block">{t.auth.password}</span>
              <input name="password" type="password" placeholder={t.auth.passwordPlaceholder} className="brut-field" />
            </label>
            <button formAction={primaryAction} className="brut-btn brut-btn-primary brut-btn-arrow mt-2 min-h-[54px] w-full">{primaryLabel}</button>
            {magicAction && (
              <button formAction={magicAction} className="brut-btn brut-btn-secondary min-h-[48px] w-full text-sm">
                {t.auth.magicLink}
              </button>
            )}
          </form>
        )}
      </div>
      <div className="mt-10 border-t border-rule pt-4 text-xs text-muted">
        <p>{rich(t.auth.agree, { terms: link(TERMS_PATH), privacy: link(PRIVACY_PATH) })}</p>
        <p className="mt-2">{footer}</p>
      </div>
    </div>
  );
}
