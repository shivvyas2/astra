import Link from "next/link";
import { getBirthProfile } from "@/lib/data/birthProfile";

function Glow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-1/4 -z-10 mx-auto h-[380px] max-w-lg blur-2xl"
      style={{
        background:
          "radial-gradient(closest-side, rgba(99,91,255,0.22), rgba(232,102,61,0.06) 45%, transparent 72%)",
      }}
    />
  );
}

export default async function AppHome() {
  const profile = await getBirthProfile();

  if (!profile) {
    return (
      <div className="relative mx-auto flex min-h-[calc(100dvh-8rem)] max-w-md flex-col items-center justify-center px-1 text-center">
        <Glow />
        <span aria-hidden className="text-2xl text-accent">✦</span>
        <h1 className="mt-3 text-2xl font-light tracking-tight sm:text-3xl">Let&apos;s build your chart</h1>
        <p className="mt-2 max-w-sm text-sm text-muted">
          We compute your real birth chart from your date, time, and place.
        </p>
        <Link href="/app/intake" className="mt-7 w-full max-w-xs rounded-lg bg-fg px-4 py-2.5 text-center font-medium text-bg">
          Enter birth details
        </Link>
      </div>
    );
  }

  return (
    <div className="relative mx-auto flex min-h-[calc(100dvh-8rem)] max-w-md flex-col items-center justify-center px-1 text-center">
      <Glow />
      <span aria-hidden className="text-2xl text-accent">✦</span>
      <h1 className="mt-3 text-2xl font-light tracking-tight sm:text-3xl">Hello, {profile.first_name}</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">
        Your chart is ready. Ask about your future, a kundli reading, or life advice.
      </p>
      <Link href="/app/chat" className="mt-7 w-full max-w-xs rounded-lg bg-accent px-4 py-2.5 text-center font-medium text-bg">
        Start a reading
      </Link>
    </div>
  );
}
