import type { Db } from "@/lib/supabase/route";
import type { BirthInput, Chart } from "@/lib/astrology/types";
import { isChartStale } from "@/lib/astrology/derived";
import { computeChartPair } from "@/lib/data/birthProfile";
import { approxFromTime, parseBirthFields, sourceOf, type BirthFields, type Parsed } from "./birth";
import {
  PEOPLE_CEILING,
  RELATIONSHIP_LABEL,
  isRelationship,
  type PersonRow,
  type PersonSummary,
  type Relationship,
} from "./types";

/**
 * Reads and writes of `people`, always through the caller's own Supabase
 * client so Row Level Security decides what is visible; every statement is
 * also filtered on owner_id, the same belt-and-braces lib/facts uses.
 *
 * Production can lag the repo by a migration (main deploys on every push), so
 * a missing table is not an error here: reads come back empty with
 * `available: false`, and writes say "unavailable" so the API can answer with
 * a friendly message rather than a 500.
 */

type PgError = { code?: string; message?: string } | null | undefined;

/** Postgres undefined_table, or PostgREST's "not in the schema cache". */
export function isMissingPeopleTable(error: PgError): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const m = (error.message ?? "").toLowerCase();
  return m.includes("people") && (m.includes("does not exist") || m.includes("schema cache"));
}

let missingLogged = false;
function logPeopleError(where: string, error: unknown): void {
  if (isMissingPeopleTable(error as PgError)) {
    if (missingLogged) return;
    missingLogged = true;
    console.warn(`people table missing (${where}); saved people are off until migration 0012 is applied`);
    return;
  }
  console.error(`people ${where} error`, error);
}

/** For tests. */
export function resetPeopleLogForTests(): void {
  missingLogged = false;
}

const SUMMARY_COLUMNS =
  "id, label, relationship, first_name, last_name, birth_date, birth_time, birth_time_known, " +
  "place_name, lat, lng, timezone, created_at, updated_at, " +
  "moonSign:chart->vedic->>moonSign, sunSign:chart->vedic->>sunSign";

export type PersonInput = BirthFields & { label: string; relationship: Relationship };

/**
 * Validates a person. `label` defaults to the first name; `relationship` to
 * "other". Last name is optional — a partner is often just "Priya".
 */
export function parsePersonInput(input: FormData | Record<string, unknown>): Parsed<PersonInput> {
  const birth = parseBirthFields(input, { requireLastName: false });
  if (!birth.ok) return birth;
  const src = sourceOf(input);
  const rawRel = src.get("relationship");
  const relationship = rawRel === undefined || rawRel === null || rawRel === "" ? "other" : rawRel;
  if (!isRelationship(relationship)) {
    return { ok: false, error: `relationship must be one of ${Object.keys(RELATIONSHIP_LABEL).join(", ")}` };
  }
  const rawLabel = src.get("label");
  const label = (typeof rawLabel === "string" ? rawLabel.trim() : "") || birth.value.firstName;
  if (label.length > 60) return { ok: false, error: "label must be 60 characters or fewer" };
  return { ok: true, value: { ...birth.value, label, relationship } };
}

/** A stored person in the field names `parsePersonInput` reads, for merging a PATCH. */
export function personAsInput(row: PersonRow): Record<string, unknown> {
  return {
    label: row.label,
    relationship: row.relationship,
    first_name: row.first_name,
    last_name: row.last_name,
    birth_date: row.birth_date,
    birth_time: String(row.birth_time).slice(0, 5),
    birth_time_known: row.birth_time_known === false ? "false" : "true",
    birth_time_approx: row.birth_time_known === false ? approxFromTime(row.birth_time) ?? "" : "",
    place_name: row.place_name,
    lat: row.lat,
    lng: row.lng,
    timezone: row.timezone,
  };
}

function birthOf(p: Pick<PersonInput, "birthDate" | "birthTime" | "lat" | "lng" | "timezone" | "birthTimeKnown">): BirthInput {
  return {
    birthDate: p.birthDate,
    birthTime: p.birthTime,
    lat: p.lat,
    lng: p.lng,
    timezone: p.timezone,
    ...(p.birthTimeKnown ? {} : { timeKnown: false }),
  };
}

async function rowFor(ownerId: string, input: PersonInput) {
  const chart = await computeChartPair(birthOf(input));
  return {
    owner_id: ownerId,
    label: input.label,
    relationship: input.relationship,
    first_name: input.firstName,
    last_name: input.lastName,
    birth_date: input.birthDate,
    birth_time: input.birthTime,
    birth_time_known: input.birthTimeKnown,
    place_name: input.placeName,
    lat: input.lat,
    lng: input.lng,
    timezone: input.timezone,
    chart,
    updated_at: new Date().toISOString(),
  };
}

export type ListResult = { people: PersonSummary[]; available: boolean };

/** The caller's people, oldest first (the order they were added). Never throws. */
export async function listPeople(db: Db): Promise<ListResult> {
  try {
    const { data, error } = await db
      .from("people")
      .select(SUMMARY_COLUMNS)
      .order("created_at", { ascending: true })
      .limit(PEOPLE_CEILING);
    if (error) {
      logPeopleError("list", error);
      return { people: [], available: !isMissingPeopleTable(error) };
    }
    return { people: (data ?? []) as unknown as PersonSummary[], available: true };
  } catch (err) {
    logPeopleError("list", err);
    return { people: [], available: true };
  }
}

export type GetResult = { person: PersonRow | null; available: boolean };

/** One person with their chart, upgraded in place if it predates a chart-schema change. */
export async function getPerson(db: Db, id: string): Promise<GetResult> {
  try {
    const { data, error } = await db.from("people").select("*").eq("id", id).maybeSingle();
    if (error) {
      logPeopleError("read", error);
      return { person: null, available: !isMissingPeopleTable(error) };
    }
    if (!data) return { person: null, available: true };
    return { person: await ensurePersonChart(db, data as PersonRow), available: true };
  } catch (err) {
    logPeopleError("read", err);
    return { person: null, available: true };
  }
}

/** The same on-read upgrade `ensureCurrentChart` gives the account's own chart. Never throws. */
export async function ensurePersonChart(db: Db, row: PersonRow): Promise<PersonRow> {
  const vedic = (row.chart as { vedic?: Chart } | null)?.vedic;
  if (vedic && !isChartStale(vedic)) return row;
  try {
    const chart = await computeChartPair({
      birthDate: String(row.birth_date),
      birthTime: String(row.birth_time).slice(0, 5),
      lat: Number(row.lat),
      lng: Number(row.lng),
      timezone: String(row.timezone),
      ...(row.birth_time_known === false ? { timeKnown: false } : {}),
    });
    const { error } = await db.from("people").update({ chart }).eq("id", row.id).eq("owner_id", row.owner_id);
    if (error) console.error("person chart upgrade not written", error);
    return { ...row, chart };
  } catch (err) {
    console.error("person chart upgrade skipped", err);
    return row;
  }
}

export type WriteResult =
  | { ok: true; person: PersonRow }
  | { ok: false; reason: "unavailable" | "ceiling" | "not_found" | "error" };

/** Saves a new person with their chart. */
export async function createPerson(db: Db, ownerId: string, input: PersonInput): Promise<WriteResult> {
  try {
    const { count, error: countError } = await db
      .from("people")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ownerId);
    if (countError) {
      logPeopleError("count", countError);
      return { ok: false, reason: isMissingPeopleTable(countError) ? "unavailable" : "error" };
    }
    if ((count ?? 0) >= PEOPLE_CEILING) return { ok: false, reason: "ceiling" };

    const row = await rowFor(ownerId, input);
    const { data, error } = await db.from("people").insert(row).select("*").single();
    if (error) {
      logPeopleError("insert", error);
      if (isMissingPeopleTable(error)) return { ok: false, reason: "unavailable" };
      if ((error.message ?? "").includes("people_ceiling")) return { ok: false, reason: "ceiling" };
      return { ok: false, reason: "error" };
    }
    return { ok: true, person: data as PersonRow };
  } catch (err) {
    logPeopleError("insert", err);
    return { ok: false, reason: "error" };
  }
}

/** Replaces a person's details and recomputes their chart. */
export async function updatePerson(db: Db, ownerId: string, id: string, input: PersonInput): Promise<WriteResult> {
  try {
    const row = await rowFor(ownerId, input);
    const { data, error } = await db
      .from("people")
      .update(row)
      .eq("id", id)
      .eq("owner_id", ownerId)
      .select("*")
      .maybeSingle();
    if (error) {
      logPeopleError("update", error);
      return { ok: false, reason: isMissingPeopleTable(error) ? "unavailable" : "error" };
    }
    if (!data) return { ok: false, reason: "not_found" };
    return { ok: true, person: data as PersonRow };
  } catch (err) {
    logPeopleError("update", err);
    return { ok: false, reason: "error" };
  }
}

/** Deletes a person. True when a row was removed. */
export async function deletePerson(
  db: Db,
  ownerId: string,
  id: string,
): Promise<{ ok: true } | { ok: false; reason: "unavailable" | "not_found" | "error" }> {
  try {
    const { data, error } = await db.from("people").delete().eq("id", id).eq("owner_id", ownerId).select("id");
    if (error) {
      logPeopleError("delete", error);
      return { ok: false, reason: isMissingPeopleTable(error) ? "unavailable" : "error" };
    }
    if (!data || (data as unknown[]).length === 0) return { ok: false, reason: "not_found" };
    return { ok: true };
  } catch (err) {
    logPeopleError("delete", err);
    return { ok: false, reason: "error" };
  }
}

/** The JSON a client gets for one person: the row without owner_id. */
export function personForClient(row: PersonRow): Omit<PersonRow, "owner_id"> {
  const { owner_id: _owner, ...rest } = row;
  void _owner;
  return rest;
}

/** The user-facing sentence for each write failure. */
export const WRITE_ERROR: Record<"unavailable" | "ceiling" | "not_found" | "error", { status: number; message: string }> = {
  unavailable: {
    status: 503,
    message: "Saving other people isn't switched on yet. Please try again a little later.",
  },
  ceiling: {
    status: 400,
    message: `You've saved ${PEOPLE_CEILING} people, which is as many as one account can hold. Remove someone to add another.`,
  },
  not_found: { status: 404, message: "That person isn't in your list." },
  error: { status: 500, message: "Something went wrong saving that. Please try again." },
};
