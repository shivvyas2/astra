import Link from "next/link";
import { resendConfirmation } from "../actions";

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; resent?: string }>;
}) {
  const sp = await searchParams;
  const email = sp.email ?? "";

  return (
    <div className="w-full max-w-sm">
      <div className="brut-card p-6">
        <p className="eyebrow">One more step</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Confirm your email</h1>
        <p className="mt-3 text-sm text-muted">
          We sent a confirmation link to{" "}
          <span className="font-bold text-fg">{email || "your email"}</span>. Open it to activate your account,
          then you&apos;ll be signed in automatically.
        </p>

        <div className="brut-bordered mt-5 bg-surface-raised px-4 py-3 text-xs text-muted">
          Didn&apos;t get it? Check spam, or resend below. The link opens Astrya and logs you in.
        </div>

        {sp.resent && <p className="mt-3 text-sm font-bold text-accent">Confirmation email resent.</p>}

        <form className="mt-4">
          <input type="hidden" name="email" value={email} />
          <button formAction={resendConfirmation} className="brut-btn brut-btn-secondary w-full py-2.5 text-sm">
            Resend confirmation email
          </button>
        </form>
      </div>

      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/login" className="font-bold text-fg underline underline-offset-2">Back to sign in</Link>
      </p>
    </div>
  );
}
