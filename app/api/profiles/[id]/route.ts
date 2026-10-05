import { createRouteSupabase } from "@/lib/supabase/route";
import {
  deletePerson,
  getPerson,
  parsePersonInput,
  personAsInput,
  personForClient,
  updatePerson,
  WRITE_ERROR,
} from "@/lib/profiles/store";
import { readBody } from "@/lib/profiles/http";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One saved person, with their chart. */
export async function GET(request: Request, { params }: Ctx) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!UUID.test(id)) return Response.json({ error: WRITE_ERROR.not_found.message }, { status: 404 });

  const { person, available } = await getPerson(supabase, id);
  if (!available) return Response.json({ error: WRITE_ERROR.unavailable.message }, { status: 503 });
  if (!person) return Response.json({ error: WRITE_ERROR.not_found.message }, { status: 404 });
  return Response.json({ person: personForClient(person) }, { headers: { "cache-control": "no-store" } });
}

/**
 * Updates a person. Any subset of fields; the rest keep their stored values.
 * The chart is recomputed from the merged details every time, through the
 * same code path as the account's own chart.
 */
export async function PATCH(request: Request, { params }: Ctx) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!UUID.test(id)) return Response.json({ error: WRITE_ERROR.not_found.message }, { status: 404 });

  const body = await readBody(request);
  if (!body) return Response.json({ error: "Send the changes as JSON." }, { status: 400 });

  const { person, available } = await getPerson(supabase, id);
  if (!available) return Response.json({ error: WRITE_ERROR.unavailable.message }, { status: 503 });
  if (!person) return Response.json({ error: WRITE_ERROR.not_found.message }, { status: 404 });

  const changes = body instanceof FormData ? Object.fromEntries(body.entries()) : body;
  const merged: Record<string, unknown> = { ...personAsInput(person), ...changes };
  // Switching to "time unknown" without a part of day means plain noon, not
  // whatever the old exact time was.
  if (changes.birth_time_known !== undefined && String(changes.birth_time_known) === "false" && changes.birth_time_approx === undefined) {
    merged.birth_time_approx = "";
  }
  const parsed = parsePersonInput(merged);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  const result = await updatePerson(supabase, user.id, id, parsed.value);
  if (!result.ok) {
    const { status, message } = WRITE_ERROR[result.reason];
    return Response.json({ error: message, reason: result.reason }, { status });
  }
  return Response.json({ person: personForClient(result.person) });
}

export async function DELETE(request: Request, { params }: Ctx) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!UUID.test(id)) return Response.json({ error: WRITE_ERROR.not_found.message }, { status: 404 });

  const result = await deletePerson(supabase, user.id, id);
  if (!result.ok) {
    const { status, message } = WRITE_ERROR[result.reason];
    return Response.json({ error: message, reason: result.reason }, { status });
  }
  return Response.json({ ok: true });
}
