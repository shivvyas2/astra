import { computeChart } from "@/lib/astrology/chart";

const BIRTH = { birthDate: "1999-03-14", birthTime: "06:30", lat: 23.02, lng: 72.57, timezone: "Asia/Kolkata" };
let pair: Promise<{ vedic: unknown; western: unknown }> | null = null;

/** One real chart pair, computed once. For tests. */
export function computeChartPair() {
  pair ??= (async () => ({ vedic: await computeChart(BIRTH, "vedic"), western: await computeChart(BIRTH, "western") }))();
  return pair;
}
