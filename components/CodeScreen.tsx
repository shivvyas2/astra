"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { CodeState } from "@/app/(auth)/actions";
import { Notice } from "@/components/Notice";
import { clock, codeDigits, codeTimers, type PendingCode } from "@/lib/auth/pendingCode";
import { useI18n } from "@/lib/i18n/client";
import { authErrorMessage } from "@/lib/i18n/errors";
import { rich } from "@/lib/i18n/rich";

/** Wrong codes before we say a new one is the quicker way. The server's own limit is higher. */
const TRIES = 5;
const LENGTH = 6;

/**
 * Entering a sign-in code: six boxes over one real field, so typing, pasting
 * and the code the keyboard offers all work; a countdown to another code and
 * to this one running out; and a way on whatever goes wrong.
 */
export function CodeScreen({
  channel,
  purpose,
  to,
  sentAt: firstSentAt,
  resends: firstResends,
  initialError,
  serverNow,
  verify,
  resend,
}: {
  channel: "email" | "phone";
  purpose: PendingCode["purpose"];
  to: string;
  sentAt: number;
  resends: number;
  initialError?: string;
  /** The server's clock when the page was made, so the first paint is right without scripts. */
  serverNow: number;
  verify: (prev: CodeState, fd: FormData) => Promise<CodeState>;
  resend: (prev: CodeState, fd: FormData) => Promise<CodeState>;
}) {
  const i18n = useI18n();
  const { t, f } = i18n;
  const a = t.auth;
  const [checked, verifyAction, checking] = useActionState(verify, { error: initialError, sentAt: firstSentAt, resends: firstResends });
  const [sent, resendAction, sending] = useActionState(resend, {});
  // Whichever was answered last speaks; both keep their own state.
  const [last, setLast] = useState<"verify" | "resend">("verify");
  const [code, setCode] = useState("");
  const [focused, setFocused] = useState(false);
  const [now, setNow] = useState(serverNow);
  const [holdUntil, setHoldUntil] = useState(0);
  const form = useRef<HTMLFormElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const tried = useRef("");
  const busy = checking || sending;

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (checked.waitSeconds) setHoldUntil(Date.now() + checked.waitSeconds * 1000);
    // A wrong code is cleared to type again; one we could not check is kept.
    if (checked.error && checked.error !== "verifyFailed") {
      setCode("");
      tried.current = "";
    }
    if (checked.error) field.current?.focus();
  }, [checked]);
  useEffect(() => {
    if (sent.waitSeconds) setHoldUntil(Date.now() + sent.waitSeconds * 1000);
    if (sent.notice === "resent") {
      setCode("");
      tried.current = "";
      setHoldUntil(0);
      field.current?.focus();
    }
  }, [sent]);

  const pending = { purpose, sentAt: sent.sentAt ?? firstSentAt, resends: sent.resends ?? firstResends };
  const timers = codeTimers(pending, now);
  const hold = Math.max(0, Math.ceil((holdUntil - now) / 1000));
  const resendIn = Math.max(timers.resendIn, last === "resend" ? hold : 0);
  const locked = last === "verify" && checked.error === "codeLocked" && hold > 0;
  const expired = pending.sentAt > 0 && timers.expiresIn === 0;
  const state = last === "resend" ? sent : checked;
  const tries = sent.notice === "resent" && last === "resend" ? 0 : (checked.tries ?? 0);
  const left = TRIES - tries;
  const stuck = pending.resends >= 2 || tries >= 3 || ["sendBusy", "sendFailed"].includes(state.error ?? "");

  const message =
    state.error === "codeLocked"
      ? f(a.errors.codeLocked, { time: clock(hold) })
      : state.error === "resendWait" || (state.error === "rateLimit" && hold > 0)
        ? f(a.errors.resendWait, { time: clock(hold) })
        : state.error
          ? authErrorMessage(i18n, state.error)
          : null;

  function onCode(value: string) {
    const digits = codeDigits(value);
    setCode(digits);
    // Six digits is the whole code; a button press as well would be ceremony.
    if (digits.length === LENGTH && digits !== tried.current && !busy && !locked && !expired) {
      tried.current = digits;
      setLast("verify");
      requestAnimationFrame(() => form.current?.requestSubmit());
    }
  }

  return (
    <div className="w-full max-w-sm">
      <p className="screen-eyebrow">{purpose === "phone" ? a.verifyEyebrow : purpose === "signUp" ? a.checkEyebrow : a.emailCodeEyebrow}</p>
      <h1 className="headline headline-arrow mt-3 text-4xl sm:text-5xl">{purpose === "signUp" ? a.checkTitle : a.verifyTitle}</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        {rich(f(purpose === "phone" ? a.verifyBody : a.emailCodeBody, { phone: to, email: to }), {
          b: (s) => <span className="break-words font-semibold text-fg">{s}</span>,
        })}
      </p>

      <form ref={form} action={verifyAction} onSubmit={() => setLast("verify")} className="mt-8">
        <input type="hidden" name="channel" value={channel} />
        <label className="block">
          <span className="eyebrow block">{a.code}</span>
          <span className="relative mt-3 block">
            <span aria-hidden className="grid grid-cols-6 gap-2">
              {Array.from({ length: LENGTH }, (_, i) => {
                const here = focused && i === Math.min(code.length, LENGTH - 1) && !busy;
                return (
                  <span
                    key={i}
                    className={`grid h-14 place-items-center rounded-[14px] border font-mono text-2xl font-semibold transition-colors sm:h-16 ${
                      here ? "border-accent bg-accent/10" : code[i] ? "border-fg" : "border-line bg-fg/[0.03]"
                    }`}
                  >
                    {code[i] ?? ""}
                  </span>
                );
              })}
            </span>
            <input
              ref={field}
              name="code"
              value={code}
              onChange={(e) => onCode(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              aria-label={a.code}
              aria-invalid={Boolean(message)}
              aria-describedby="code-help"
              autoFocus
              required
              readOnly={busy}
              disabled={locked || expired}
              className="absolute inset-0 h-full w-full cursor-text rounded-[14px] bg-transparent font-mono text-transparent caret-transparent outline-none selection:bg-transparent disabled:cursor-not-allowed"
            />
          </span>
        </label>

        <p id="code-help" className="mt-3 text-sm text-muted">
          {expired ? a.codeExpired : pending.sentAt > 0 ? f(a.codeExpiresIn, { time: clock(timers.expiresIn) }) : " "}
        </p>

        {message && (
          <Notice className="mt-4">
            {message}
            {state.error === "codeInvalid" && left > 0 && left < TRIES && ` ${f(a.triesLeft, { count: left })}`}
            {state.error === "codeInvalid" && left <= 0 && ` ${a.newCodeBetter}`}
          </Notice>
        )}
        {!message && state.notice === "resent" && <Notice tone="info" className="mt-4">{a.codeResent}</Notice>}

        <button
          disabled={busy || locked || expired || code.length < LENGTH}
          className="brut-btn brut-btn-primary brut-btn-arrow mt-6 min-h-[54px] w-full disabled:opacity-40"
        >
          {checking ? a.checking : a.verify}
        </button>
      </form>

      <form action={resendAction} onSubmit={() => setLast("resend")} className="mt-3">
        <input type="hidden" name="channel" value={channel} />
        <button disabled={busy || resendIn > 0} className="brut-btn brut-btn-secondary min-h-[48px] w-full text-sm disabled:opacity-50">
          {sending ? a.sending : resendIn > 0 ? f(a.resendIn, { time: clock(resendIn) }) : a.resendCode}
        </button>
      </form>

      {stuck ? (
        <div className="mt-6 rounded-[18px] border border-line p-4">
          <p className="text-[15px] font-semibold">{a.stuckTitle}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">{channel === "email" ? a.stuckEmail : a.stuckPhone}</p>
          <Link
            href={channel === "email" ? "/login?method=phone" : "/login"}
            className="mt-3 inline-flex min-h-[44px] items-center text-sm font-semibold underline underline-offset-4"
          >
            {channel === "email" ? a.usePhone : a.useEmail}
          </Link>
        </div>
      ) : (
        channel === "email" && <p className="mt-5 text-sm text-muted">{a.emailCodeHint}</p>
      )}

      <p className="mt-6 text-sm text-muted">
        <Link href={channel === "email" ? "/login" : "/login?method=phone"} className="inline-flex min-h-[44px] items-center font-semibold text-fg underline underline-offset-4">
          {channel === "email" ? a.differentEmail : a.differentNumber}
        </Link>
      </p>
      <p className="sr-only" role="status" aria-live="polite">
        {checking ? a.checking : sending ? a.sending : ""}
      </p>
    </div>
  );
}
