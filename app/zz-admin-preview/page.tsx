// TEMPORARY dev-only preview of the admin views with sample data. Delete before shipping.
import "../admin/admin.css";
import { notFound } from "next/navigation";
import { memoryDb } from "@/lib/admin/testDb";
import { adminConversation, adminOverview, adminUserDetail, adminUsers } from "@/lib/admin/stats";
import { OverviewView } from "@/components/admin/views/OverviewView";
import { UsersView } from "@/components/admin/views/UsersView";
import { UserView } from "@/components/admin/views/UserView";
import { TranscriptView } from "@/components/admin/views/TranscriptView";

export const dynamic = "force-dynamic";

function sample() {
  const now = Date.now();
  const names = ["Asha Rao", "Ravi Mehta", "Priya Nair", "Karan Shah", "Meera Iyer", "Arjun Das", "Sana Khan", "Vikram Joshi", "Neha Gupta", "Rohan Pillai", "Divya Menon", "Aditya Rao"];
  const users = names.map((n, i) => ({ id: `u${i}`, email: `${n.split(" ")[0].toLowerCase()}@example.com`, created_at: new Date(now - (80 - i * 6) * 864e5).toISOString(), last_sign_in_at: null }));
  const tables: Record<string, Record<string, unknown>[]> = { birth_profiles: [], conversations: [], messages: [], model_usage: [], user_facts: [], conversation_memories: [], predictions: [], daily_readings: [], alerts: [], device_tokens: [], life_events: [], admins: [{ user_id: "u11" }] };
  const titles = ["Will this year be good for my career?", "When will I get married?", "Is now a good time to buy a house?", "Why was 2021 so hard?", "Should I change jobs in spring?", "How is my health this month?"];
  const modes = ["vedic", "vedic", "western", "numerology"];
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  names.forEach((n, i) => {
    const [first, last] = n.split(" ");
    tables.birth_profiles.push({ user_id: `u${i}`, first_name: first, last_name: last, place_name: ["Pune, India", "Ahmedabad, India", "London, UK", "Toronto, Canada"][i % 4], birth_date: `199${i % 10}-0${(i % 9) + 1}-14`, birth_time: "06:30:00", timezone: "Asia/Kolkata", chart: { vedic: { ascendant: { sign: "Leo" }, moonSign: "Cancer", sunSign: "Pisces", dasha: { mahadasha: "Saturn", antardasha: "Mercury", antardashaEnd: "2027-03-02" } } } });
    if (i % 3 !== 2) tables.device_tokens.push({ token: `t${i}`, user_id: `u${i}` });
    const convCount = i === 0 ? 6 : 1 + (i % 3);
    for (let c = 0; c < convCount; c++) {
      const id = `c${i}-${c}`;
      const start = now - rnd() * 75 * 864e5;
      tables.conversations.push({ id, user_id: `u${i}`, tradition: modes[(i + c) % 4], title: titles[(i + c) % titles.length], created_at: new Date(start).toISOString() });
      const turns = 2 + Math.floor(rnd() * (i === 0 ? 10 : 5));
      for (let t = 0; t < turns; t++) {
        const at = start + t * (rnd() * 3 * 864e5);
        if (at > now) break;
        tables.messages.push({ conversation_id: id, role: "user", content: `${titles[(i + c + t) % titles.length]} I'm a nurse in Pune and engaged since June.`, created_at: new Date(at).toISOString() });
        tables.messages.push({ conversation_id: id, role: "assistant", content: "**Saturn in your 10th house** steadies your career through March 2027. Expect a promotion or a move between **November and February** — likely, not certain.\n\n**In simple words**\nWork gets better slowly; push for the raise in winter.", created_at: new Date(at + 20000).toISOString() });
        const deep = rnd() < 0.15;
        tables.model_usage.push({ user_id: `u${i}`, kind: deep ? "deep_reading" : "reading", model: deep ? "claude-opus-5-5" : "claude-sonnet-5-5", cost_usd: deep ? 0.03 + rnd() * 0.03 : 0.006 + rnd() * 0.006, created_at: new Date(at + 21000).toISOString(), conversation_id: id });
        tables.model_usage.push({ user_id: `u${i}`, kind: "memory", model: "claude-haiku-4-5", cost_usd: 0.002 + rnd() * 0.002, created_at: new Date(at + 25000).toISOString() });
      }
    }
    for (let d = 0; d < 20; d += 3) tables.daily_readings.push({ id: `d${i}-${d}`, user_id: `u${i}`, title: "A steady day for work", body: "Moon in your 10th favours finishing what you started.", slot: "morning", created_at: new Date(now - d * 864e5).toISOString() });
    tables.model_usage.push({ user_id: `u${i}`, kind: "daily", model: "claude-sonnet-5-5", cost_usd: 0.004, created_at: new Date(now - 2 * 864e5).toISOString() });
  });
  tables.model_usage.push({ user_id: "u0", kind: "deep_reading", model: "claude-opus-5-5", cost_usd: 5.2, created_at: new Date(now - 864e5).toISOString(), conversation_id: "c0-0" });
  tables.user_facts.push(
    { id: "f1", user_id: "u0", fact: "Works as a nurse in Pune", category: "work", confidence: "stated", source: "chat", created_at: new Date(now - 40 * 864e5).toISOString(), updated_at: new Date(now - 40 * 864e5).toISOString() },
    { id: "f2", user_id: "u0", fact: "Engaged since June 2026", category: "relationships", confidence: "stated", source: "on_device", created_at: new Date(now - 20 * 864e5).toISOString(), updated_at: new Date(now - 10 * 864e5).toISOString() },
    { id: "f3", user_id: "u0", fact: "Worried about father's health", category: "worries", confidence: "inferred", source: "chat", created_at: new Date(now - 5 * 864e5).toISOString(), updated_at: new Date(now - 5 * 864e5).toISOString() },
  );
  tables.conversation_memories.push({ conversation_id: "c0-0", user_id: "u0", summary: "Asked about career this year; told Saturn in the 10th steadies work, promotion likely Nov–Feb.", topics: ["work", "money"], last_message_at: new Date(now - 864e5).toISOString() });
  tables.predictions.push(
    { id: "p1", user_id: "u0", topic: "work", claim: "A promotion or move between November and February", window_start: "2026-11-01", window_end: "2027-02-28", confidence: "likely", status: "open", checked_at: null, created_at: new Date(now - 30 * 864e5).toISOString() },
    { id: "p2", user_id: "u0", topic: "money", claim: "A raise this autumn", window_start: "2026-09-01", window_end: "2026-10-01", confidence: "possible", status: "happened", checked_at: new Date(now - 3 * 864e5).toISOString(), created_at: new Date(now - 60 * 864e5).toISOString() },
    { id: "p3", user_id: "u1", topic: "home", claim: "A move this summer", window_start: "2026-06-01", window_end: "2026-08-31", confidence: "possible", status: "didnt", checked_at: new Date(now - 9 * 864e5).toISOString(), created_at: new Date(now - 70 * 864e5).toISOString() },
  );
  tables.alerts.push({ id: "a1", user_id: "u0", title: "Sade Sati eases", body: "Saturn leaves your 12th; the pressure of the last years lifts.", created_at: new Date(now - 12 * 864e5).toISOString() });
  tables.life_events.push({ id: "l1", user_id: "u0", title: "Got engaged", occurred_on: "2026-06-12", created_at: new Date(now - 33 * 864e5).toISOString() });
  return memoryDb({ tables, users });
}

export default async function Preview({ searchParams }: { searchParams: Promise<{ screen?: string; tab?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;
  const db = sample();
  let view: React.ReactNode;
  if (sp.screen === "users") {
    const { users, total } = await adminUsers(db, {});
    view = <UsersView users={users} total={total} q="" page={1} />;
  } else if (sp.screen === "user") {
    view = <UserView d={(await adminUserDetail(db, "u0"))!} sp={{ tab: sp.tab }} />;
  } else if (sp.screen === "transcript") {
    view = <TranscriptView data={(await adminConversation(db, "c0-0"))!} />;
  } else {
    view = <OverviewView o={await adminOverview(db, 30)} />;
  }
  return <div className="admin-theme">{view}</div>;
}
