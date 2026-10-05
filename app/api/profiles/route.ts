import { createRouteSupabase } from "@/lib/supabase/route";
import { createPerson, listPeople, parsePersonInput, personForClient, WRITE_ERROR } from "@/lib/profiles/store";
import { PEOPLE_CEILING } from "@/lib/profiles/types";
import { readBody } from "@/lib/profiles/http";

// swisseph-wasm runs when a new person's chart is computed.
export const runtime = "nodejs";

/**
 * The people a user has saved — a partner, a parent, a friend — for
 * compatibility. Owner-only through RLS.
 *
 * There is no plan limit. The only cap is an anti-abuse ceiling no real
 * person meets (PEOPLE_CEILING), answered with a plain 400.
 *
 * `available: false` means migration 0012 has not been applied yet; clients
 * show a "coming soon" note rather than an error.
 */
export async function GET(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { people, available } = await listPeople(supabase);
  return Response.json({ people, available, ceiling: PEOPLE_CEILING }, { headers: { "cache-control": "no-store" } });
}

/** Saves a person and computes their chart. JSON or form body; see lib/profiles/store parsePersonInput. */
export async function POST(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const body = await readBody(request);
  if (!body) return Response.json({ error: "Send the person's details as JSON." }, { status: 400 });
  const parsed = parsePersonInput(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  const result = await createPerson(supabase, user.id, parsed.value);
  if (!result.ok) {
    const { status, message } = WRITE_ERROR[result.reason];
    return Response.json({ error: message, reason: result.reason }, { status });
  }
  return Response.json({ person: personForClient(result.person) }, { status: 201 });
}
