"use client";
import { useEffect, useState } from "react";

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
    if (!publicKey) return setMessage("Browser notifications aren't set up on the server yet.");
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
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not save this browser.");
      setState("on");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not turn notifications on.");
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
      if (!body.configured) setMessage("Browser notifications aren't set up on the server yet.");
      else if (body.results.length === 0) setMessage("No browser is subscribed for this account yet.");
      else
        setMessage(
          body.results
            .map((r) => `${r.endpointHost}: ${r.ok ? "sent" : `refused (${r.status})`}`)
            .join(". ") + ". It should appear within a few seconds.",
        );
    } catch {
      setMessage("The test could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  const note: Partial<Record<State, string>> = {
    unsupported: "This browser can't show notifications from websites.",
    "needs-home-screen": "On iPhone, add Astrya to your Home Screen (Share, then Add to Home Screen), open it from there, and turn notifications on. Or use the iPhone app.",
    denied: "Notifications are blocked for this site. Allow them in your browser's site settings, then reload.",
  };

  return (
    <section className="rounded-[20px] border border-line bg-fg/[0.04] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">Notifications in this browser</p>
          <p className="mt-1 text-sm text-muted">
            {state === "on" ? "On. Your morning and evening readings and any alerts arrive here too." : note[state] ?? "Get your readings and alerts here, as well as on your phone."}
          </p>
        </div>
        {state === "off" && (
          <button type="button" onClick={turnOn} disabled={busy} className="brut-btn brut-btn-primary px-4 py-2 text-sm">
            Turn on
          </button>
        )}
        {state === "on" && (
          <>
            <button type="button" onClick={sendTest} disabled={busy} className="brut-btn brut-btn-primary px-4 py-2 text-sm">
              Send a test
            </button>
            <button type="button" onClick={turnOff} disabled={busy} className="brut-btn brut-btn-secondary px-4 py-2 text-sm">
              Turn off
            </button>
          </>
        )}
      </div>
      {message && <p className="mt-3 text-sm text-muted">{message}</p>}
    </section>
  );
}
