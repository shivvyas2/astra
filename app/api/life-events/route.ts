import { createRouteSupabase } from "@/lib/supabase/route";
import { loadBirthRow } from "@/lib/timeline/load";

export const runtime = "nodejs";

const MAX_TITLE = 120;
const MAX_NOTE = 2000;
// One confirmation sheet's worth. Bulk exists so accepting a batch of extracted
// candidates is a single call, not so the table can be filled by one request.
const MAX_BATCH = 50;

type Incoming = {
  occurredOn?: string;
  precision?: string;
  title?: string;
  note?: string | null;
  source?: string;
};

/**
 * Pins one or more moments onto the timeline.
 *
 * Accepts a batch so confirming a page of extracted candidates costs one round
 * trip. A single manual add is the same call with one element.
 *
 * Dates are validated against the user's own birth date here as well as in the
 * extractor: this route is reachable directly, and an event before someone was
 * born would render as a period that does not exist.
 */
export async function POST(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const body = (await request.json().catch(() => null)) as { events?: Incoming[] } | null;
  const incoming = body?.events;
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return Response.json({ error: "No events supplied." }, { status: 400 });
  }
  if (incoming.length > MAX_BATCH) {
    return Response.json({ error: `At most ${MAX_BATCH} events at a time.` }, { status: 400 });
  }

  const row = await loadBirthRow(supabase);
  if (!row) return Response.json({ error: "Complete your birth details first." }, { status: 400 });

  const birthDate = String(row.birth_date);
  const today = new Date().toISOString().slice(0, 10);

  const rows = [];
  for (const e of incoming) {
    const occurredOn = typeof e.occurredOn === "string" ? e.occurredOn.trim() : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
      return Response.json({ error: `Not a date: ${occurredOn || "(missing)"}` }, { status: 400 });
    }
    if (occurredOn < birthDate) {
      return Response.json({ error: "That date is before you were born." }, { status: 400 });
    }
    if (occurredOn > today) {
      return Response.json({ error: "The timeline only holds what has happened." }, { status: 400 });
    }

    const title = typeof e.title === "string" ? e.title.trim().slice(0, MAX_TITLE) : "";
    if (!title) return Response.json({ error: "Every moment needs a name." }, { status: 400 });

    const note = typeof e.note === "string" && e.note.trim() ? e.note.trim().slice(0, MAX_NOTE) : null;

    rows.push({
      user_id: user.id,
      occurred_on: occurredOn,
      precision: ["day", "month", "year"].includes(String(e.precision)) ? e.precision : "day",
      title,
      note,
      source: e.source === "extracted" ? "extracted" : "manual",
    });
  }

  const { data, error } = await supabase
    .from("life_events")
    .insert(rows)
    .select("id, occurred_on, precision, title, note, source");
  if (error) {
    console.error("life event insert error", error);
    return Response.json({ error: "Could not save that." }, { status: 500 });
  }

  return Response.json({ events: data });
}

/** Unpins a moment. Scoped to the caller by RLS and by the explicit filter. */
export async function DELETE(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  const id = body?.id?.trim();
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabase
    .from("life_events")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) {
    console.error("life event delete error", error);
    return Response.json({ error: "Could not remove that." }, { status: 500 });
  }

  return Response.json({ ok: true });
}
