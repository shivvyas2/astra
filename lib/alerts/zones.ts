import "server-only";
import { IANAZone } from "luxon";
import { isMissingRelation } from "@/lib/usage/record";

/**
 * Whose clock a notification follows.
 *
 * The birth profile carries the timezone of the birthplace, which is the
 * wrong clock for someone born in Ahmedabad and living in New York. The phone
 * reports its own zone when it registers for pushes (`/api/devices`), and
 * that wins; the birthplace is the fallback, then UTC.
 */

/** `Area/Location` (or `UTC`), as iPhones report it. */
const IANA_NAME = /^(UTC|[A-Za-z]+(?:\/[A-Za-z0-9_+-]+)+)$/;

/**
 * A valid IANA zone name, trimmed, or null for anything else. Bare offsets
 * like "+05:30" are rejected even though the runtime accepts them: they do
 * not follow daylight-saving changes, and no phone sends one.
 */
export function cleanZone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const zone = value.trim();
  if (!zone || zone.length > 64 || !IANA_NAME.test(zone) || !IANAZone.isValidZone(zone)) return null;
  return zone;
}

/** The first usable zone in preference order, else UTC. */
export function resolveZone(...candidates: (string | null | undefined)[]): string {
  for (const candidate of candidates) {
    const zone = cleanZone(candidate);
    if (zone) return zone;
  }
  return "UTC";
}

// supabase-js (service role) or a test fake.
type AnyDb = { from(table: string): any }; // eslint-disable-line @typescript-eslint/no-explicit-any

let missingLogged = false;

/**
 * Every user's zone from the device that registered most recently. Empty, so
 * that the birthplace zone is used, until migration 0013 is applied or when
 * the read fails. Never throws.
 */
export async function loadDeviceZones(admin: AnyDb): Promise<Map<string, string>> {
  const zones = new Map<string, string>();
  try {
    const { data, error } = await admin
      .from("device_tokens")
      .select("user_id, timezone, updated_at")
      .not("timezone", "is", null)
      .order("updated_at", { ascending: false })
      .limit(10_000);
    if (error) {
      if (isMissingRelation(error)) {
        if (!missingLogged) {
          missingLogged = true;
          console.warn("device_tokens.timezone missing; notifications follow the birthplace clock until migration 0013 is applied");
        }
      } else {
        console.error("device zones read failed", error);
      }
      return zones;
    }
    for (const row of (data ?? []) as { user_id: string; timezone: unknown }[]) {
      if (zones.has(row.user_id)) continue;
      const zone = cleanZone(row.timezone);
      if (zone) zones.set(row.user_id, zone);
    }
  } catch (err) {
    console.error("device zones read failed", err);
  }
  return zones;
}

/** For tests. */
export function resetZonesLogForTests(): void {
  missingLogged = false;
}
