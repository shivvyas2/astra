import "server-only";
import { createHash } from "node:crypto";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Notes that someone opened Astrya, at most once an hour per session and per
 * server instance. Runs after the response and never throws: not knowing only
 * means their notifications may pause. Migration 0020.
 */
const HOUR_MS = 3_600_000;
const MAX_HELD = 2000;
const seen = new Map<string, number>();

export function touchActivity(db: SupabaseClient, session: string, now = Date.now()): void {
  const key = createHash("sha256").update(session).digest("hex").slice(0, 24);
  if (now - (seen.get(key) ?? -Infinity) < HOUR_MS) return;
  if (seen.size >= MAX_HELD) seen.clear();
  seen.set(key, now);
  const touch = async () => {
    try {
      await db.rpc("touch_activity");
    } catch {
      // Not worth a log line: the next visit says it again.
    }
  };
  try {
    after(touch);
  } catch {
    // Outside a request (tests, scripts).
  }
}

export function resetActivityForTests(): void {
  seen.clear();
}
