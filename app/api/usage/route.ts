import { DateTime } from "luxon";
import { createRouteSupabase } from "@/lib/supabase/route";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getPlan, type Plan } from "@/lib/billing/plan";
import { isAdminId, json, signedInUser } from "@/lib/admin/api";
import { costSince, countReadingsSince, dayWindow } from "@/lib/usage/today";

export const runtime = "nodejs";

/**
 * The caller's own usage today. Informational: Astrya has no reading limits,
 * so there is nothing "left" to report and nothing here ever blocks.
 *
 *   { plan, unlimited: true, today: { readings, deep }, resetAt, monthCostUsd? }
 *
 * `today` is the caller's local day (their birth-profile timezone, else UTC);
 * `resetAt` is when that day ends. `monthCostUsd` (this UTC month's model
 * spend) is included only for admins.
 */
export async function GET(request: Request) {
  const user = await signedInUser(request);
  if (!user) return json({ error: "unauthorized" }, 401);

  let timezone: string | null = null;
  try {
    const supabase = await createRouteSupabase(request);
    const { data } = await supabase.from("birth_profiles").select("timezone").maybeSingle();
    timezone = (data?.timezone as string | undefined) ?? null;
  } catch {
    timezone = null;
  }
  const { start, resetAt } = dayWindow(timezone);

  let admin: ReturnType<typeof createAdminSupabase> | null = null;
  try {
    admin = createAdminSupabase();
  } catch (err) {
    console.error("usage: service client unavailable", err);
  }

  let plan: Plan = "free";
  try {
    plan = admin ? await getPlan(admin, user.id) : "free";
  } catch {
    plan = "free";
  }

  if (!admin) return json({ plan, unlimited: true, today: { readings: 0, deep: 0 }, resetAt });

  const [today, isAdmin] = await Promise.all([countReadingsSince(admin, user.id, start), isAdminId(admin, user.id)]);
  const body: Record<string, unknown> = {
    plan,
    unlimited: true,
    today: { readings: today.readings, deep: today.deep },
    resetAt,
  };
  if (isAdmin) {
    const monthStart = DateTime.utc().startOf("month").toISO()!;
    body.monthCostUsd = await costSince(admin, user.id, monthStart);
  }
  return json(body);
}
