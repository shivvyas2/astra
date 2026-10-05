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
  /** Migration 0012. Absent on a database that has not had it applied. */
  birth_time_known?: boolean | null;
};

/** Both traditions for one birth, computed together so they always agree. */
export type ChartPair = { vedic: Chart; western: Chart };

/**
 * The one code path that turns birth details into the stored `{ vedic,
 * western }` pair — for the account's own chart and for every saved person.
 */
export async function computeChartPair(birth: BirthInput): Promise<ChartPair> {
  const [vedic, western] = await Promise.all([computeChart(birth, "vedic"), computeChart(birth, "western")]);
  return { vedic, western };
}

/**
 * Whether a stored row's birth time is known: the 0012 column when it exists,
 * else the flag stamped on the chart itself, else known (every row before
 * this feature).
 */
export function timeKnownOf(row: {
  birth_time_known?: boolean | null;
  chart?: { vedic?: unknown } | null;
}): boolean {
  if (typeof row.birth_time_known === "boolean") return row.birth_time_known;
  const vedic = row.chart?.vedic as { timeKnown?: boolean } | undefined;
  return vedic?.timeKnown !== false;
}

/** PostgREST's "column not in the schema cache" (or Postgres's undefined column). */
function isMissingColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "PGRST204" || error.code === "42703") return true;
  const m = (error.message ?? "").toLowerCase();
  return m.includes("birth_time_known") && (m.includes("schema cache") || m.includes("does not exist"));
}

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
    /** False when they do not know their birth time. Defaults to known. */
    birthTimeKnown?: boolean;
  },
  db?: Db,
) {
  const supabase = db ?? (await createServerSupabase());
  const timeKnown = input.birthTimeKnown !== false;
  const birth: BirthInput = {
    birthDate: input.birthDate,
    birthTime: input.birthTime,
    lat: input.lat,
    lng: input.lng,
    timezone: input.timezone,
    ...(timeKnown ? {} : { timeKnown: false }),
  };
  const { vedic, western } = await computeChartPair(birth);
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

  // The 0012 column. Production can lag migrations, so a write that finds it
  // missing is retried without it — the chart carries the same flag, which is
  // what readings actually use.
  let { error } = await supabase
    .from("birth_profiles")
    .upsert({ ...row, birth_time_known: timeKnown }, { onConflict: "user_id" });
  if (error && isMissingColumn(error)) {
    ({ error } = await supabase.from("birth_profiles").upsert(row, { onConflict: "user_id" }));
  }
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
      ...(timeKnownOf(profile) ? {} : { timeKnown: false }),
    };
    const { vedic, western } = await computeChartPair(birth);
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
