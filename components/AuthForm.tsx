import Link from "next/link";
import { Notice } from "@/components/Notice";
import { PRIVACY_PATH, TERMS_PATH } from "@/lib/billing/copy";
import { getI18n } from "@/lib/i18n/server";
import { rich } from "@/lib/i18n/rich";

export async function AuthForm({
  title,
  subtitle,
  primaryLabel,
  primaryAction,
  magicAction,
  footer,
  error,
  notice,
}: {
  title: string;
  subtitle?: string;
  primaryLabel: string;
  primaryAction: (fd: FormData) => void;
  magicAction?: (fd: FormData) => void;
  footer: React.ReactNode;
  error?: string;
  notice?: string;
}) {
  const { t } = await getI18n();
  const link = (href: string) => (s: string) => (
    <Link href={href} className="underline underline-offset-2 hover:text-fg">{s}</Link>
  );
  return (
    <div className="w-full max-w-sm">
      <div>
        <p className="screen-eyebrow">{t.auth.eyebrow}</p>
        <h1 className="headline headline-arrow mt-3 text-4xl sm:text-5xl">{title}</h1>
        {subtitle && <p className="mt-3 text-[15px] leading-relaxed text-muted">{subtitle}</p>}
        {error && <Notice className="mt-5">{error}</Notice>}
        {notice && <Notice tone="info" className="mt-5">{notice}</Notice>}
        <form className="mt-8 space-y-6">
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
      </div>
      <div className="mt-10 border-t border-rule pt-4 text-xs text-muted">
        <p>{rich(t.auth.agree, { terms: link(TERMS_PATH), privacy: link(PRIVACY_PATH) })}</p>
        <p className="mt-2">{footer}</p>
      </div>
    </div>
  );
}
