import Link from "next/link";
import { resendConfirmation } from "../actions";
import { Notice } from "@/components/Notice";
import { getI18n } from "@/lib/i18n/server";
import { rich } from "@/lib/i18n/rich";

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; resent?: string }>;
}) {
  const sp = await searchParams;
  const email = sp.email ?? "";
  const { t, f } = await getI18n();

  return (
    <div className="w-full max-w-sm">
      <div>
        <p className="screen-eyebrow">{t.auth.checkEyebrow}</p>
        <h1 className="headline headline-arrow mt-3 text-4xl sm:text-5xl">{t.auth.checkTitle}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          {rich(f(t.auth.checkBody, { email: email || t.auth.yourEmail }), {
            b: (s) => <span className="font-semibold text-fg">{s}</span>,
          })}
        </p>

        <div className="brut-bordered mt-6 px-4 py-3 text-sm text-muted">{t.auth.checkHint}</div>

        {sp.resent && <Notice tone="info" className="mt-3">{t.auth.resent}</Notice>}

        <form className="mt-6">
          <input type="hidden" name="email" value={email} />
          <button formAction={resendConfirmation} className="brut-btn brut-btn-secondary min-h-[48px] w-full text-sm">
            {t.auth.resend}
          </button>
        </form>
      </div>

      <p className="mt-8 text-sm text-muted">
        <Link href="/login" className="font-semibold text-fg underline underline-offset-4">{t.auth.backToSignIn}</Link>
      </p>
    </div>
  );
}
