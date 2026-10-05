import { createRouteSupabase } from "@/lib/supabase/route";
import { generateKundliPdf } from "@/lib/pdf/kundli";
import { computeNumerology, computeNameNumber } from "@/lib/astrology/numerology";
import { ensureCurrentChart, type BirthProfileRow } from "@/lib/data/birthProfile";
import type { Chart } from "@/lib/astrology/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { data: loaded, error: profileError } = await supabase.from("birth_profiles").select("*").maybeSingle();
  if (profileError) {
    console.error("kundli profile read error", profileError);
    return new Response("Something went wrong loading your profile. Please try again.", { status: 500 });
  }
  if (!loaded?.chart) return new Response("Complete your birth details first.", { status: 400 });
  const p = await ensureCurrentChart(loaded as BirthProfileRow, supabase);

  const chart = (p.chart as { vedic: Chart }).vedic;
  const fullName = `${p.first_name} ${p.last_name}`.trim();
  const num = computeNumerology(String(p.birth_date));

  const pdf = await generateKundliPdf({
    name: fullName,
    birthDate: String(p.birth_date),
    birthTime: String(p.birth_time).slice(0, 5),
    place: String(p.place_name),
    timezone: String(p.timezone),
    chart,
    numerology: { mulank: num.mulank, bhagyank: num.bhagyank, namank: computeNameNumber(fullName) },
  });

  return new Response(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'attachment; filename="astrya-kundli.pdf"',
      "cache-control": "no-store",
    },
  });
}
