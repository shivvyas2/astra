"use client";
import { useState } from "react";
import type { GeoResult } from "@/lib/geo";

export function PlaceAutocomplete({ onPick }: { onPick: (r: GeoResult) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [picked, setPicked] = useState<string | null>(null);

  async function search(value: string) {
    setQ(value);
    setPicked(null);
    if (value.trim().length < 2) return setResults([]);
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(value)}`);
    setResults(await res.json());
  }

  return (
    <div className="relative w-full">
      <input
        value={q}
        onChange={(e) => search(e.target.value)}
        placeholder="Birthplace (city)"
        className="w-full min-w-0 rounded-md border border-white/15 bg-white/5 px-3 py-2.5 outline-none focus:border-accent"
      />
      {picked && <p className="mt-1 text-xs text-muted">Selected: {picked}</p>}
      {results.length > 0 && !picked && (
        <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-white/15 bg-bg">
          {results.map((r, i) => (
            <li key={i}>
              <button type="button"
                onClick={() => { onPick(r); setPicked(r.name); setResults([]); setQ(r.name); }}
                className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-white/10">
                {r.name} <span className="text-muted">· {r.timezone}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
