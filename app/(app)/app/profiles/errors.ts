import { PEOPLE_CEILING } from "@/lib/profiles/types";
import type { I18n } from "@/lib/i18n/core";
import { birthErrorMessage } from "@/lib/i18n/errors";

/** Store failures travel as `write:<reason>` (actions.ts); parse errors as the parser's English. */
export function formError(i: I18n, raw: string): string {
  if (raw.startsWith("write:")) {
    const reason = raw.slice("write:".length) as keyof I18n["t"]["people"]["errors"];
    const message = i.t.people.errors[reason] ?? i.t.people.errors.error;
    return i.f(message, { count: PEOPLE_CEILING });
  }
  return birthErrorMessage(i, raw);
}
