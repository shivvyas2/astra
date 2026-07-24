import { NextResponse } from "next/server";
import { geocodePlace } from "@/lib/geo";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const results = await geocodePlace(q);
  return NextResponse.json(results);
}
