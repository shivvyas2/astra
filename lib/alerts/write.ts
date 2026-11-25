import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { failureReason } from "@/lib/health/ai";
import { parseAlertCopy, type AlertCopy } from "./compose";
import { AiUnavailable } from "./unavailable";
import { faultIn } from "./voice";

/**
 * One notification, written and checked. A lock-screen line that breaks the
 * voice rules is sent back once with the reason; the second try is used as it
 * is unless it still says something a notification must never say.
 */
export async function writeCopy(args: {
  label: string;
  task: string;
  call: (messages: Anthropic.MessageParam[]) => Promise<string>;
  check?: { recent?: string[]; tender?: boolean; sky?: boolean; secret?: string[] };
}): Promise<AlertCopy> {
  let first: string;
  let copy: AlertCopy | null;
  try {
    first = await args.call([{ role: "user", content: args.task }]);
    copy = parseAlertCopy(first);
  } catch (err) {
    console.error(`${args.label} compose error`, err);
    throw new AiUnavailable(failureReason(err));
  }
  if (!copy) {
    console.error(`${args.label} compose: unparseable model output`);
    throw new AiUnavailable("unparseable reply");
  }
  if (!args.check) return copy;
  const fault = faultIn(copy, args.check);
  if (!fault) return copy;
  try {
    const again = parseAlertCopy(
      await args.call([
        { role: "user", content: args.task },
        { role: "assistant", content: first },
        { role: "user", content: `${fault} Write TITLE and BODY again, and adjust the opening of DETAIL so it still answers them. Same shape, all three parts.` },
      ]),
    );
    if (again && (!faultIn(again, args.check) || !isForbidden(faultIn(again, args.check)))) return again;
  } catch (err) {
    console.error(`${args.label} second try failed`, err);
  }
  // Worn-out words are only dull. Anything forbidden is not sent.
  if (isForbidden(fault)) throw new AiUnavailable("forbidden line");
  return copy;
}

const isForbidden = (fault: string | null) => fault !== null && fault.startsWith("TITLE and BODY may not contain");
