// @ts-expect-error - tz-lookup ships no types
import tzlookup from "tz-lookup";

export type GeoResult = {
  name: string;
  lat: number;
  lng: number;
  timezone: string;
  country: string;
};

export function resolveTimezone(lat: number, lng: number): string {
  return tzlookup(lat, lng);
}

export async function geocodePlace(query: string): Promise<GeoResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    results?: Array<{ name: string; latitude: number; longitude: number; country?: string; admin1?: string }>;
  };
  return (data.results ?? []).map((r) => ({
    name: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
    lat: r.latitude,
    lng: r.longitude,
    timezone: resolveTimezone(r.latitude, r.longitude),
    country: r.country ?? "",
  }));
}
