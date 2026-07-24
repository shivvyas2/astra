import { createServerSupabase } from "@/lib/supabase/server";
import { computeChart } from "@/lib/astrology/chart";
import type { BirthInput } from "@/lib/astrology/types";

export type BirthProfileRow = {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  birth_time: string;
  place_name: string;
  lat: number;
  lng: number;
  timezone: string;
  avatar_url: string | null;
  chart: { vedic: unknown; western: unknown } | null;
};

export async function getBirthProfile(): Promise<BirthProfileRow | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("birth_profiles").select("*").maybeSingle();
  return (data as BirthProfileRow) ?? null;
}

export async function saveBirthProfile(input: {
  userId: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  birthTime: string;
  placeName: string;
  lat: number;
  lng: number;
  timezone: string;
  avatarUrl?: string | null;
}) {
  const supabase = await createServerSupabase();
  const birth: BirthInput = {
    birthDate: input.birthDate,
    birthTime: input.birthTime,
    lat: input.lat,
    lng: input.lng,
    timezone: input.timezone,
  };
  const [vedic, western] = await Promise.all([
    computeChart(birth, "vedic"),
    computeChart(birth, "western"),
  ]);
  const row: Record<string, unknown> = {
    user_id: input.userId,
    first_name: input.firstName,
    last_name: input.lastName,
    birth_date: input.birthDate,
    birth_time: input.birthTime,
    place_name: input.placeName,
    lat: input.lat,
    lng: input.lng,
    timezone: input.timezone,
    chart: { vedic, western },
    updated_at: new Date().toISOString(),
  };
  // Only overwrite the avatar when a new one was uploaded.
  if (input.avatarUrl) row.avatar_url = input.avatarUrl;

  const { error } = await supabase.from("birth_profiles").upsert(row, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
}
