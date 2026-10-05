import { DateTime, IANAZone } from "luxon";

/**
 * Birth details as a form or a JSON body sends them, checked once for every
 * place that accepts them: the account's own intake (web action and
 * `POST /api/profile`) and saved people (`/api/profiles`).
 *
 * Unknown birth time: `birth_time_known` is "false" and `birth_time` may be
 * absent. The chart is then cast for noon — or for the middle of the part of
 * the day they chose ("roughly: evening") — and flagged, so nothing that
 * depends on the hour is read from it. An older client that never sends the
 * flag is treated as knowing its time, which is what it always meant.
 */

/** A rough part of the day, for someone who does not know the exact time. */
export type ApproxTime = "morning" | "afternoon" | "evening" | "night";

/**
 * The clock time each rough part of the day is cast for. Each is roughly the
 * middle of its span (morning 6–12, afternoon 12–17, evening 17–21); night is
 * late evening rather than after midnight, because "born at night" on a given
 * date usually means that date's night.
 */
export const APPROX_TIMES: Record<ApproxTime, string> = {
  morning: "09:00",
  afternoon: "15:00",
  evening: "19:00",
  night: "23:00",
};

/** The time used when the birth time is unknown and no part of day was chosen. */
export const UNKNOWN_TIME = "12:00";

export function isApproxTime(value: unknown): value is ApproxTime {
  return typeof value === "string" && value in APPROX_TIMES;
}

/** The part of day a stored time stands for, when the time is unknown; null for plain noon. */
export function approxFromTime(time: string | null | undefined): ApproxTime | null {
  const hm = String(time ?? "").slice(0, 5);
  const hit = (Object.entries(APPROX_TIMES) as [ApproxTime, string][]).find(([, t]) => t === hm);
  return hit ? hit[0] : null;
}

export type BirthFields = {
  firstName: string;
  lastName: string;
  birthDate: string;
  /** Always `HH:mm`: the real time, or the stand-in when it is unknown. */
  birthTime: string;
  birthTimeKnown: boolean;
  placeName: string;
  lat: number;
  lng: number;
  timezone: string;
};

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

type Source = { get(name: string): unknown };

/** Reads either a FormData or a plain JSON object through one interface. */
export function sourceOf(input: FormData | Record<string, unknown>): Source {
  if (typeof FormData !== "undefined" && input instanceof FormData) {
    return { get: (name) => input.get(name) };
  }
  const obj = input as Record<string, unknown>;
  return { get: (name) => obj[name] };
}

function text(src: Source, name: string): string {
  const v = src.get(name);
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

/** "false", "0", "no", false → false. Anything else, including absent, → true. */
export function parseTimeKnown(value: unknown): boolean {
  if (value === false) return false;
  if (typeof value === "string") return !["false", "0", "no", "off"].includes(value.trim().toLowerCase());
  return true;
}

const TIME = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates birth details. `requireName` is false for a saved person, whose
 * last name is optional (a partner is often just "Priya").
 */
export function parseBirthFields(
  input: FormData | Record<string, unknown>,
  opts: { requireLastName?: boolean; today?: DateTime } = {},
): Parsed<BirthFields> {
  const src = sourceOf(input);
  const requireLastName = opts.requireLastName ?? true;

  const firstName = text(src, "first_name");
  const lastName = text(src, "last_name");
  if (!firstName) return { ok: false, error: "Missing required field: first_name" };
  if (requireLastName && !lastName) return { ok: false, error: "Missing required field: last_name" };
  if (firstName.length > 80 || lastName.length > 80) return { ok: false, error: "Names must be 80 characters or fewer" };

  const birthDate = text(src, "birth_date");
  if (!birthDate) return { ok: false, error: "Missing required field: birth_date" };
  const date = DateTime.fromISO(birthDate, { zone: "utc" });
  if (!DATE.test(birthDate) || !date.isValid) return { ok: false, error: "birth_date must be YYYY-MM-DD" };
  const today = opts.today ?? DateTime.utc();
  if (date.year < 1800 || date > today.plus({ days: 1 })) {
    return { ok: false, error: "birth_date must be a real date in the past" };
  }

  const birthTimeKnown = parseTimeKnown(src.get("birth_time_known"));
  let birthTime: string;
  if (birthTimeKnown) {
    const raw = text(src, "birth_time");
    if (!raw) return { ok: false, error: "Missing required field: birth_time" };
    if (!TIME.test(raw)) return { ok: false, error: "birth_time must be HH:mm" };
    birthTime = raw.slice(0, 5);
  } else {
    const approx = text(src, "birth_time_approx");
    if (approx && !isApproxTime(approx)) {
      return { ok: false, error: "birth_time_approx must be morning, afternoon, evening or night" };
    }
    birthTime = isApproxTime(approx) ? APPROX_TIMES[approx] : UNKNOWN_TIME;
  }

  const placeName = text(src, "place_name");
  if (!placeName) return { ok: false, error: "Missing required field: place_name" };
  const latRaw = text(src, "lat");
  const lngRaw = text(src, "lng");
  if (!latRaw) return { ok: false, error: "Missing required field: lat" };
  if (!lngRaw) return { ok: false, error: "Missing required field: lng" };
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, error: "lat and lng must be numbers" };
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return { ok: false, error: "lat and lng are out of range" };

  const timezone = text(src, "timezone");
  if (!timezone) return { ok: false, error: "Missing required field: timezone" };
  if (!IANAZone.isValidZone(timezone)) return { ok: false, error: "timezone must be an IANA zone" };

  return {
    ok: true,
    value: { firstName, lastName, birthDate, birthTime, birthTimeKnown, placeName, lat, lng, timezone },
  };
}
