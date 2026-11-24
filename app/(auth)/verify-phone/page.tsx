import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CodeScreen } from "@/components/CodeScreen";
import { resendCode, verifyCode } from "../actions";
import { decodePending, PENDING_PHONE } from "@/lib/auth/pendingCode";
import { displayPhone, isSupportedE164 } from "@/lib/auth/phone";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Where the six-digit code from a text is entered. */
export default async function VerifyPhonePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { data: { user } } = await (await createServerSupabase()).auth.getUser();
  if (user) redirect("/app");
  const pending = decodePending((await cookies()).get(PENDING_PHONE)?.value);
  if (!pending || !isSupportedE164(pending.to)) redirect("/login?method=phone");
  const { error } = await searchParams;
  return (
    <CodeScreen
      channel="phone"
      purpose={pending.purpose}
      to={displayPhone(pending.to)}
      sentAt={pending.sentAt}
      resends={pending.resends}
      initialError={error}
      serverNow={Date.now()}
      verify={verifyCode}
      resend={resendCode}
    />
  );
}
