import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CodeScreen } from "@/components/CodeScreen";
import { resendCode, verifyCode } from "../actions";
import { decodePending, PENDING_EMAIL } from "@/lib/auth/pendingCode";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Where the six-digit code from an email is entered, to sign in or to confirm a new account. */
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { data: { user } } = await (await createServerSupabase()).auth.getUser();
  if (user) redirect("/app");
  const pending = decodePending((await cookies()).get(PENDING_EMAIL)?.value);
  if (!pending) redirect("/login");
  const { error } = await searchParams;
  return (
    <CodeScreen
      channel="email"
      purpose={pending.purpose}
      to={pending.to}
      sentAt={pending.sentAt}
      resends={pending.resends}
      initialError={error}
      serverNow={Date.now()}
      verify={verifyCode}
      resend={resendCode}
    />
  );
}
