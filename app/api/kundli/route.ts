import { createServerSupabase } from "@/lib/supabase/server";
import { generateKundliPdf } from "@/lib/pdf/kundli";
import { computeNumerology, computeNameNumber } from "@/lib/astrology/numerology";
import type { Chart } from "@/lib/astrology/types";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { data: p } = await supabase.from("birth_profiles").select("*").maybeSingle();
  if (!p?.chart) return new Response("Complete your birth details first.", { status: 400 });

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
      "content-disposition": 'attachment; filename="astra-kundli.pdf"',
      "cache-control": "no-store",
    },
  });
}
