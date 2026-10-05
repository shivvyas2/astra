/**
 * One answer for one question, even when the question arrives twice.
 *
 * A client that retries after a dropped connection, or a double tap on Send,
 * would otherwise pay for the same reading twice and store the question twice.
 * The first request claims the question; an identical one (same user, same
 * conversation, same mode, same Deep setting, same words) that arrives while
 * the first is still answering, or up to {@link REUSE_MS} after it finished,
 * waits for that answer and returns it instead of calling the model again.
 *
 * In memory, per server instance: a retry that lands on another instance is
 * simply answered again, exactly as before. A failed or empty first answer is
 * never reused.
 */

export type Answer = { text: string; conversationId: string };

export const REUSE_MS = 10_000;
/** How long a duplicate waits on an answer still streaming before answering itself. */
export const WAIT_MS = 90_000;
const MAX_ENTRIES = 500;

type Entry = { promise: Promise<Answer | null>; settledAt: number | null };
const entries = new Map<string, Entry>();

export function answerKey(args: {
  userId: string;
  conversationId?: string | null;
  tradition: string;
  deep?: boolean;
  message: string;
}): string {
  return [args.userId, args.conversationId || "new", args.tradition, args.deep ? "deep" : "std", args.message.trim()].join("\u0000");
}

function fresh(entry: Entry, now: number): boolean {
  return entry.settledAt === null || now - entry.settledAt <= REUSE_MS;
}

/**
 * The answer to an identical question already in flight or just finished, or
 * null when there is none (or it failed). Never throws.
 */
export async function reuseAnswer(key: string, waitMs: number = WAIT_MS): Promise<Answer | null> {
  const entry = entries.get(key);
  if (!entry) return null;
  if (!fresh(entry, Date.now())) {
    entries.delete(key);
    return null;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), waitMs);
  });
  try {
    const answer = await Promise.race([entry.promise, timeout]);
    return answer && answer.text.trim() ? answer : null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type Claim = { settle(answer: Answer | null): void };

/** Marks a question as being answered. Call `settle` exactly once, with null on any failure. */
export function claimAnswer(key: string): Claim {
  let resolve: (answer: Answer | null) => void = () => {};
  const entry: Entry = {
    promise: new Promise<Answer | null>((r) => {
      resolve = r;
    }),
    settledAt: null,
  };
  if (entries.size >= MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest !== undefined) entries.delete(oldest);
  }
  entries.set(key, entry);

  let settled = false;
  return {
    settle(answer) {
      if (settled) return;
      settled = true;
      resolve(answer);
      if (!answer || !answer.text.trim()) {
        if (entries.get(key) === entry) entries.delete(key);
        return;
      }
      entry.settledAt = Date.now();
      const t = setTimeout(() => {
        if (entries.get(key) === entry) entries.delete(key);
      }, REUSE_MS + 1000);
      (t as { unref?: () => void }).unref?.();
    },
  };
}

/** For tests. */
export function resetAnswersForTests(): void {
  entries.clear();
}
