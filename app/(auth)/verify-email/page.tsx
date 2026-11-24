import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resendEmailCode, verifyEmailCode } from "../actions";
import { Notice } from "@/components/Notice";
import { decodePendingEmail, PENDING_EMAIL } from "@/lib/auth/pendingEmail";
import { authErrorMessage } from "@/lib/i18n/errors";
import { getI18n } from "@/lib/i18n/server";
import { rich } from "@/lib/i18n/rich";

/** Where the six-digit code from an email is entered, to sign in or to confirm a new account. */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; resent?: string }>;
}) {
  const sp = await searchParams;
  const pending = decodePendingEmail((await cookies()).get(PENDING_EMAIL)?.value);
  if (!pending) redirect("/login");
  const i18n = await getI18n();
  const { t, f } = i18n;

  return (
    <div className="w-full max-w-sm">
      <div>
        <p className="screen-eyebrow">{pending.purpose === "signUp" ? t.auth.checkEyebrow : t.auth.emailCodeEyebrow}</p>
        <h1 className="headline headline-arrow mt-3 text-4xl sm:text-5xl">{pending.purpose === "signUp" ? t.auth.checkTitle : t.auth.verifyTitle}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          {rich(f(t.auth.emailCodeBody, { email: pending.email }), {
            b: (s) => <span className="font-semibold text-fg">{s}</span>,
          })}
        </p>

        {sp.error && <Notice className="mt-5">{authErrorMessage(i18n, sp.error)}</Notice>}
        <p className="mt-3 text-sm text-muted">{t.auth.emailCodeHint}</p>
        {sp.resent && <Notice tone="info" className="mt-5">{t.auth.codeResent}</Notice>}

        <form className="mt-8 space-y-6">
          <label className="block">
            <span className="eyebrow block">{t.auth.code}</span>
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              required
              autoFocus
              placeholder="000000"
              className="brut-field font-mono text-3xl tracking-[0.4em]"
            />
          </label>
          <button formAction={verifyEmailCode} className="brut-btn brut-btn-primary brut-btn-arrow min-h-[54px] w-full">
            {t.auth.verify}
          </button>
          <button formAction={resendEmailCode} formNoValidate className="brut-btn brut-btn-secondary min-h-[48px] w-full text-sm">
            {t.auth.resendCode}
          </button>
        </form>
      </div>

      <p className="mt-8 text-sm text-muted">
        <Link href="/login" className="font-semibold text-fg underline underline-offset-4">
          {t.auth.differentEmail}
        </Link>
      </p>
    </div>
  );
}
