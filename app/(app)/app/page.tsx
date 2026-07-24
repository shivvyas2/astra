import Link from "next/link";
import { getBirthProfile } from "@/lib/data/birthProfile";

export default async function AppHome() {
  const profile = await getBirthProfile();
  if (!profile) {
    return (
      <div className="max-w-md">
        <h1 className="mb-2 text-2xl font-bold sm:text-3xl">Let's build your chart</h1>
        <p className="mb-6 text-muted">We compute your real birth chart from your date, time, and place.</p>
        <Link href="/app/intake" className="inline-block w-full rounded-md bg-fg px-4 py-2.5 text-center font-medium text-bg sm:w-auto">Enter birth details</Link>
      </div>
    );
  }
  return (
    <div className="max-w-md">
      <h1 className="mb-2 text-2xl font-bold sm:text-3xl">Hello, {profile.first_name}</h1>
      <p className="mb-6 text-muted">Your chart is ready. Ask about your future, a kundli reading, or life advice.</p>
      <Link href="/app/chat" className="inline-block w-full rounded-md bg-accent px-4 py-2.5 text-center font-medium text-bg sm:w-auto">Start a reading</Link>
    </div>
  );
}
