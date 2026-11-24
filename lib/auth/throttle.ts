import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { env } from "@/lib/env";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * Limits on sign-in codes (migration 0019). Two subjects each: the address or
 * number the code is for, and where the request came from. Supabase has its
 * own limits, but they see the server's address rather than the visitor's.
 *
 * Fails open: if the count cannot be kept in the database it is kept in this
 * instance's memory, and nobody is locked out by an outage.
 */

export type Rule = { limit: number; seconds: number };
export type Action = "send" | "verify" | "password";

const MINUTE = 60, HOUR = 3600, DAY = 86_400;

/** For the address or number, and for the visitor. */
export const RULES: Record<Action, { subject: Rule[]; visitor: Rule[] }> = {
  send: {
    subject: [{ limit: 1, seconds: 45 }, { limit: 5, seconds: HOUR }, { limit: 10, seconds: DAY }],
    visitor: [{ limit: 12, seconds: HOUR }, { limit: 30, seconds: DAY }],
  },
  // A million codes; six guesses in ten minutes, and the code dies in an hour.
  verify: {
    subject: [{ limit: 6, seconds: 10 * MINUTE }, { limit: 20, seconds: DAY }],
    visitor: [{ limit: 40, seconds: HOUR }],
  },
  password: {
    subject: [{ limit: 10, seconds: 10 * MINUTE }],
    visitor: [{ limit: 60, seconds: HOUR }],
  },
};

/** One-way, so the table holds no address, number or IP. */
export function throttleKey(action: Action, kind: "subject" | "visitor", value: string, secret: string): string {
  return createHmac("sha256", secret).update(`${action}:${kind}:${value.trim().toLowerCase()}`).digest("base64url").slice(0, 32);
}

type Entry = { key: string; seconds: number; limit: number };

export function entriesFor(action: Action, subject: string, visitor: string | null, secret: string): Entry[] {
  const of = (kind: "subject" | "visitor", value: string) =>
    RULES[action][kind].map((r) => ({ key: throttleKey(action, kind, value, secret), ...r }));
  return [...of("subject", subject), ...(visitor ? of("visitor", visitor) : [])];
}

const memory = new Map<string, { windowStart: number; hits: number }>();
const MAX_MEMORY = 5_000;

/** The same counting as the database's, for this instance only. */
export function hitInMemory(entries: Entry[], now = Date.now()): number {
  let wait = 0;
  for (const e of entries) {
    const ms = e.seconds * 1000;
    const windowStart = Math.floor(now / ms) * ms;
    const id = `${e.key}:${e.seconds}`;
    const held = memory.get(id);
    const hits = held && held.windowStart === windowStart ? held.hits + 1 : 1;
    if (!held && memory.size >= MAX_MEMORY) memory.delete(memory.keys().next().value!);
    memory.set(id, { windowStart, hits });
    if (hits > e.limit) wait = Math.max(wait, Math.ceil((windowStart + ms - now) / 1000), 1);
  }
  return wait;
}

export function resetThrottleForTests(): void {
  memory.clear();
}

/** Who is asking, as Vercel reports it. Null when it cannot be told. */
async function visitorAddress(): Promise<string | null> {
  const h = await headers();
  return h.get("x-vercel-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || null;
}

let missingLogged = false;

/** Counts one attempt. Seconds to wait, or 0 to go ahead. Never throws. */
export async function throttle(action: Action, subject: string): Promise<number> {
  try {
    const entries = entriesFor(action, subject, await visitorAddress(), env.supabaseServiceRoleKey());
    try {
      const { data, error } = await createAdminSupabase().rpc("auth_throttle_hit", {
        p_keys: entries.map((e) => e.key),
        p_seconds: entries.map((e) => e.seconds),
        p_limits: entries.map((e) => e.limit),
      });
      if (!error) return Math.max(0, Number(data) || 0);
      if (!missingLogged) {
        missingLogged = true;
        console.warn("auth throttle: counting in memory until migration 0019 is applied", error.code);
      }
    } catch (err) {
      console.error("auth throttle: database unreachable, counting in memory", (err as Error).name);
    }
    return hitInMemory(entries);
  } catch (err) {
    console.error("auth throttle skipped", (err as Error).name);
    return 0;
  }
}
