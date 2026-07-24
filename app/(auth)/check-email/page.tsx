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
    <div className="w-full max-w-sm text-center">
      <h1 className="text-2xl font-light tracking-tight sm:text-3xl">Confirm your email</h1>
      <p className="mt-3 text-sm text-muted">
        We sent a confirmation link to{" "}
        <span className="text-fg">{email || "your email"}</span>. Open it to activate your account,
        then you&apos;ll be signed in automatically.
      </p>

      <div className="mt-6 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-xs text-muted">
        Didn&apos;t get it? Check spam, or resend below. The link opens Astra and logs you in.
      </div>

      {sp.resent && <p className="mt-3 text-sm text-accent">Confirmation email resent.</p>}

      <form className="mt-4">
        <input type="hidden" name="email" value={email} />
        <button formAction={resendConfirmation}
          className="w-full rounded-lg border border-white/15 px-3 py-2.5 text-sm text-muted transition-colors hover:text-fg">
          Resend confirmation email
        </button>
      </form>

      <p className="mt-6 text-sm text-muted">
        <Link href="/login" className="text-fg underline">Back to sign in</Link>
      </p>
    </div>
  );
}
