import { createServerSupabase } from "@/lib/supabase/server";
import { computeChart } from "@/lib/astrology/chart";
import { isChartStale } from "@/lib/astrology/derived";
import type { BirthInput, Chart } from "@/lib/astrology/types";
import type { Db } from "@/lib/supabase/route";

export type BirthProfileRow = {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  birth_time: string;
  place_name: string;
  lat: number;
  lng: number;
  timezone: string;
  avatar_url: string | null;
  chart: { vedic: unknown; western: unknown } | null;
};

export async function getBirthProfile(db?: Db): Promise<BirthProfileRow | null> {
  const supabase = db ?? (await createServerSupabase());
  const { data, error } = await supabase.from("birth_profiles").select("*").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return ensureCurrentChart(data as BirthProfileRow, supabase);
}

export async function saveBirthProfile(
  input: {
    userId: string;
    firstName: string;
    lastName: string;
    birthDate: string;
    birthTime: string;
    placeName: string;
    lat: number;
    lng: number;
    timezone: string;
    avatarUrl?: string | null;
  },
  db?: Db,
) {
  const supabase = db ?? (await createServerSupabase());
  const birth: BirthInput = {
    birthDate: input.birthDate,
    birthTime: input.birthTime,
    lat: input.lat,
    lng: input.lng,
    timezone: input.timezone,
  };
  const [vedic, western] = await Promise.all([
    computeChart(birth, "vedic"),
    computeChart(birth, "western"),
  ]);
  const row: Record<string, unknown> = {
    user_id: input.userId,
    first_name: input.firstName,
    last_name: input.lastName,
    birth_date: input.birthDate,
    birth_time: input.birthTime,
    place_name: input.placeName,
    lat: input.lat,
    lng: input.lng,
    timezone: input.timezone,
    chart: { vedic, western },
    updated_at: new Date().toISOString(),
  };
  // Only overwrite the avatar when a new one was uploaded.
  if (input.avatarUrl) row.avatar_url = input.avatarUrl;

  const { error } = await supabase.from("birth_profiles").upsert(row, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
}

/**
 * Rewrites a stored chart that predates the whole-sign change.
 *
 * Readers can always derive correct facts in process, but the numbers the
 * kundli, the PDF and the iOS app draw come from the stored chart, so it has to
 * be rewritten for those to agree. Doing it on read means no migration and no
 * backfill job: a chart corrects the first time its owner uses the app.
 *
 * Both traditions are recomputed together, so a profile is never half upgraded.
 * A failure is swallowed: an upgrade that cannot be written is not a reason to
 * fail the request that triggered it. supabase-js resolves rather than throws
 * on a write rejection (RLS, a constraint), so the write's `error` is checked
 * and turned into a throw — that is what routes it into the catch below,
 * alongside a thrown compute failure, through the one swallow point.
 */
export async function ensureCurrentChart(
  profile: BirthProfileRow,
  db?: Db,
): Promise<BirthProfileRow> {
  const stored = profile.chart as { vedic?: Chart; western?: Chart } | null;
  if (!stored?.vedic || !isChartStale(stored.vedic)) return profile;

  let stage: "compute" | "write" = "compute";
  try {
    const birth: BirthInput = {
      birthDate: String(profile.birth_date),
      birthTime: String(profile.birth_time).slice(0, 5),
      lat: Number(profile.lat),
      lng: Number(profile.lng),
      timezone: String(profile.timezone),
    };
    const [vedic, western] = await Promise.all([
      computeChart(birth, "vedic"),
      computeChart(birth, "western"),
    ]);
    stage = "write";
    const supabase = db ?? (await createServerSupabase());
    const { error } = await supabase
      .from("birth_profiles")
      .update({ chart: { vedic, western } })
      .eq("user_id", profile.user_id);
    if (error) throw new Error(error.message);
    return { ...profile, chart: { vedic, western } };
  } catch (err) {
    const reason = stage === "compute" ? "recompute failed" : "write failed";
    console.error(`chart upgrade skipped (${reason})`, err);
    return profile;
  }
}
