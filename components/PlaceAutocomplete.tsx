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
      <label className="block">
        <span className="eyebrow mb-1.5 block">Birthplace</span>
        <input
          value={q}
          onChange={(e) => search(e.target.value)}
          placeholder="Birthplace (city)"
          className="brut-field"
        />
      </label>
      {picked && <p className="mt-1.5 text-xs text-accent">Selected: {picked}</p>}
      {results.length > 0 && !picked && (
        <ul className="brut-card absolute z-10 mt-2 max-h-60 w-full overflow-y-auto">
          {results.map((r, i) => (
            <li key={i} className="border-b-2 border-fg/10 last:border-b-0">
              <button type="button"
                onClick={() => { onPick(r); setPicked(r.name); setResults([]); setQ(r.name); }}
                className="block w-full truncate px-3 py-2 text-left text-sm transition-colors hover:bg-surface-raised">
                {r.name} <span className="text-muted">· {r.timezone}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
