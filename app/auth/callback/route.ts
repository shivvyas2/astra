import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Where a link in an older email lands. A link only works in the browser that
 * asked for it, so when it does not, say so and offer a code rather than
 * dropping someone on the sign-in page with no reason given.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  if (code) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/app`);
    console.error("auth callback: code not exchanged", error.code ?? error.name);
  }
  return NextResponse.redirect(`${origin}/login?error=linkExpired`);
}
