"use client";
import { useState } from "react";
import type { GeoResult } from "@/lib/geo";
import { PlaceAutocomplete } from "./PlaceAutocomplete";
import { resolveTimezone } from "@/lib/geo";

export function IntakeForm({ action }: { action: (fd: FormData) => void }) {
  const [geo, setGeo] = useState<GeoResult | null>(null);
  const [manual, setManual] = useState(false);

  // Manual mode: user types lat/lng; timezone is derived offline via tz-lookup.
  function manualGeo(lat: number, lng: number, placeName: string) {
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      setGeo({ name: placeName || `${lat}, ${lng}`, lat, lng, timezone: resolveTimezone(lat, lng), country: "" });
    } else {
      setGeo(null);
    }
  }

  return (
    <form action={action} className="w-full max-w-md space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <input name="first_name" required placeholder="First name" className="min-w-0 rounded-md border border-white/15 bg-white/5 px-3 py-2.5" />
        <input name="last_name" required placeholder="Last name" className="min-w-0 rounded-md border border-white/15 bg-white/5 px-3 py-2.5" />
      </div>
      <label className="block text-sm text-muted">Birth date
        <input name="birth_date" type="date" required className="mt-1 w-full rounded-md border border-white/15 bg-white/5 px-3 py-2.5" />
      </label>
      <label className="block text-sm text-muted">Birth time (as exact as you know)
        <input name="birth_time" type="time" required className="mt-1 w-full rounded-md border border-white/15 bg-white/5 px-3 py-2.5" />
      </label>

      {!manual ? (
        <>
          <PlaceAutocomplete onPick={setGeo} />
          <button type="button" onClick={() => { setManual(true); setGeo(null); }} className="text-xs text-muted underline">
            Can't find your birthplace? Enter coordinates manually
          </button>
        </>
      ) : (
        <ManualCoords onChange={manualGeo} onBack={() => { setManual(false); setGeo(null); }} />
      )}

      <input type="hidden" name="place_name" value={geo?.name ?? ""} />
      <input type="hidden" name="lat" value={geo?.lat ?? ""} />
      <input type="hidden" name="lng" value={geo?.lng ?? ""} />
      <input type="hidden" name="timezone" value={geo?.timezone ?? ""} />
      <button disabled={!geo} className="w-full rounded-md bg-fg px-3 py-2.5 font-medium text-bg disabled:opacity-40">
        Save & build my chart
      </button>
      {geo && <p className="text-xs text-muted">Timezone: {geo.timezone}</p>}
    </form>
  );
}

function ManualCoords({
  onChange, onBack,
}: { onChange: (lat: number, lng: number, place: string) => void; onBack: () => void }) {
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [place, setPlace] = useState("");
  function push(nLat: string, nLng: string, nPlace: string) {
    onChange(parseFloat(nLat), parseFloat(nLng), nPlace);
  }
  return (
    <div className="w-full space-y-2 rounded-md border border-white/15 p-3">
      <input value={place} onChange={(e) => { setPlace(e.target.value); push(lat, lng, e.target.value); }}
        placeholder="Place name (optional)" className="w-full min-w-0 rounded-md border border-white/15 bg-white/5 px-3 py-2.5" />
      <div className="grid grid-cols-2 gap-2">
        <input value={lat} onChange={(e) => { setLat(e.target.value); push(e.target.value, lng, place); }}
          placeholder="Latitude" inputMode="decimal" className="min-w-0 rounded-md border border-white/15 bg-white/5 px-3 py-2.5" />
        <input value={lng} onChange={(e) => { setLng(e.target.value); push(lat, e.target.value, place); }}
          placeholder="Longitude" inputMode="decimal" className="min-w-0 rounded-md border border-white/15 bg-white/5 px-3 py-2.5" />
      </div>
      <button type="button" onClick={onBack} className="text-xs text-muted underline">Back to search</button>
    </div>
  );
}
