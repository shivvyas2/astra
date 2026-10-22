"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/client";

type State = "loading" | "unsupported" | "needs-home-screen" | "off" | "denied" | "on";

/** The VAPID public key as the bytes PushManager wants. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function isIOS(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

/**
 * Browser notifications: turn them on for this browser, turn them off, and
 * send a test. Safari on iPhone only allows them once the site is added to
 * the Home Screen, so it says that instead of offering a button that fails.
 */
export function WebPushControls({ publicKey }: { publicKey: string | null }) {
  const { t, f } = useI18n();
  const p = t.push;
  const [state, setState] = useState<State>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState(isIOS() && !isStandalone() ? "needs-home-screen" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const existing = await reg.pushManager.getSubscription();
      setState(existing ? "on" : "off");
    })();
  }, []);

  async function turnOn() {
    if (!publicKey) return setMessage(p.notConfigured);
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
      const res = await fetch("/api/web-push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      // The route's own message is English, for the iPhone and the logs.
      if (!res.ok) throw new Error(p.saveError);
      setState("on");
    } catch (err) {
      setMessage(err instanceof Error && err.message === p.saveError ? p.saveError : p.turnOnError);
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/web-push", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/web-push/test", { method: "POST" });
      const body = (await res.json()) as { configured: boolean; results: { endpointHost: string; ok: boolean; status: number }[] };
      if (!body.configured) setMessage(p.notConfigured);
      else if (body.results.length === 0) setMessage(p.noSubscription);
      else
        setMessage(
          body.results
            .map((r) => (r.ok ? f(p.sent, { host: r.endpointHost }) : f(p.refused, { host: r.endpointHost, status: r.status })))
            .join(". ") + `. ${p.arrives}`,
        );
    } catch {
      setMessage(p.testError);
    } finally {
      setBusy(false);
    }
  }

  const note: Partial<Record<State, string>> = {
    unsupported: p.unsupported,
    "needs-home-screen": p.homeScreen,
    denied: p.denied,
  };

  return (
    <section className="rounded-[20px] border border-line bg-fg/[0.04] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">{p.title}</p>
          <p className="mt-1 text-sm text-muted">{state === "on" ? p.on : note[state] ?? p.off}</p>
        </div>
        {state === "off" && (
          <button type="button" onClick={turnOn} disabled={busy} className="brut-btn brut-btn-primary px-4 py-2 text-sm">
            {p.turnOn}
          </button>
        )}
        {state === "on" && (
          <>
            <button type="button" onClick={sendTest} disabled={busy} className="brut-btn brut-btn-primary px-4 py-2 text-sm">
              {p.sendTest}
            </button>
            <button type="button" onClick={turnOff} disabled={busy} className="brut-btn brut-btn-secondary px-4 py-2 text-sm">
              {p.turnOff}
            </button>
          </>
        )}
      </div>
      {message && <p className="mt-3 text-sm text-muted">{message}</p>}
    </section>
  );
}
