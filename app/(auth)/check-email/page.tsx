import Link from "next/link";
import { resendConfirmation } from "../actions";
import { Notice } from "@/components/Notice";

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; resent?: string }>;
}) {
  const sp = await searchParams;
  const email = sp.email ?? "";

  return (
    <div className="w-full max-w-sm">
      <div>
        <p className="screen-eyebrow">One more step</p>
        <h1 className="headline headline-arrow mt-3 text-4xl sm:text-5xl">Confirm your email</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          We sent a confirmation link to{" "}
          <span className="font-semibold text-fg">{email || "your email"}</span>. Open it to activate your account,
          then you&apos;ll be signed in automatically.
        </p>

        <div className="brut-bordered mt-6 px-4 py-3 text-sm text-muted">
          Didn&apos;t get it? Check spam, or resend below. The link opens Astrya and logs you in.
        </div>

        {sp.resent && <Notice tone="info" className="mt-3">Confirmation email resent.</Notice>}

        <form className="mt-6">
          <input type="hidden" name="email" value={email} />
          <button formAction={resendConfirmation} className="brut-btn brut-btn-secondary min-h-[48px] w-full text-sm">
            Resend confirmation email
          </button>
        </form>
      </div>

      <p className="mt-8 text-sm text-muted">
        <Link href="/login" className="font-semibold text-fg underline underline-offset-4">Back to sign in</Link>
      </p>
    </div>
  );
}
