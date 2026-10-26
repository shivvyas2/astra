import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resendPhoneCode, verifyPhoneCode } from "../actions";
import { Notice } from "@/components/Notice";
import { displayPhone, isSupportedE164 } from "@/lib/auth/phone";
import { authErrorMessage } from "@/lib/i18n/errors";
import { getI18n } from "@/lib/i18n/server";
import { rich } from "@/lib/i18n/rich";

/** Where the six-digit code texted by sendPhoneCode is entered. */
export default async function VerifyPhonePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; resent?: string }>;
}) {
  const sp = await searchParams;
  const phone = (await cookies()).get("astrya_pending_phone")?.value;
  if (!isSupportedE164(phone)) redirect("/login?method=phone");
  const i18n = await getI18n();
  const { t, f } = i18n;

  return (
    <div className="w-full max-w-sm">
      <div>
        <p className="screen-eyebrow">{t.auth.verifyEyebrow}</p>
        <h1 className="headline headline-arrow mt-3 text-4xl sm:text-5xl">{t.auth.verifyTitle}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          {rich(f(t.auth.verifyBody, { phone: displayPhone(phone) }), {
            b: (s) => <span className="font-semibold text-fg">{s}</span>,
          })}
        </p>

        {sp.error && <Notice className="mt-5">{authErrorMessage(i18n, sp.error)}</Notice>}
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
          <button formAction={verifyPhoneCode} className="brut-btn brut-btn-primary brut-btn-arrow min-h-[54px] w-full">
            {t.auth.verify}
          </button>
          <button formAction={resendPhoneCode} formNoValidate className="brut-btn brut-btn-secondary min-h-[48px] w-full text-sm">
            {t.auth.resendCode}
          </button>
        </form>
      </div>

      <p className="mt-8 text-sm text-muted">
        <Link href="/login?method=phone" className="font-semibold text-fg underline underline-offset-4">
          {t.auth.differentNumber}
        </Link>
      </p>
    </div>
  );
}
