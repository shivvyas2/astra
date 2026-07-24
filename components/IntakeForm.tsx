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
    <form action={action} className="w-full max-w-md space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <input name="first_name" required placeholder="First name" className="min-w-0 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 outline-none focus:border-accent" />
        <input name="last_name" required placeholder="Last name" className="min-w-0 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 outline-none focus:border-accent" />
      </div>

      <label className="block text-sm text-muted">Birth date
        <input name="birth_date" type="date" required
          className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 outline-none [color-scheme:dark] focus:border-accent" />
      </label>

      <TimePicker />

      {!manual ? (
        <>
          <PlaceAutocomplete onPick={setGeo} />
          <button type="button" onClick={() => { setManual(true); setGeo(null); }} className="text-xs text-muted underline">
            Can&apos;t find your birthplace? Enter coordinates manually
          </button>
        </>
      ) : (
        <ManualCoords onChange={manualGeo} onBack={() => { setManual(false); setGeo(null); }} />
      )}

      <input type="hidden" name="place_name" value={geo?.name ?? ""} />
      <input type="hidden" name="lat" value={geo?.lat ?? ""} />
      <input type="hidden" name="lng" value={geo?.lng ?? ""} />
      <input type="hidden" name="timezone" value={geo?.timezone ?? ""} />
      <button disabled={!geo} className="w-full rounded-lg bg-fg px-3 py-2.5 font-medium text-bg disabled:opacity-40">
        Save &amp; build my chart
      </button>
      {geo && <p className="text-xs text-muted">Timezone: {geo.timezone}</p>}
    </form>
  );
}

// Reliable time picker: Hour (1-12) / Minute / AM-PM selects that emit a 24h HH:mm
// value via a hidden `birth_time` field. Avoids the flaky native <input type="time">.
function TimePicker() {
  const [hour, setHour] = useState(12); // 1-12
  const [minute, setMinute] = useState(0); // 0-59
  const [meridiem, setMeridiem] = useState<"AM" | "PM">("PM");

  const hour24 = meridiem === "PM" ? (hour % 12) + 12 : hour % 12;
  const value = `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

  const selectCls =
    "w-full min-w-0 appearance-none rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-center outline-none [color-scheme:dark] focus:border-accent";

  return (
    <div className="text-sm text-muted">
      Birth time <span className="text-muted/70">(as exact as you know)</span>
      <div className="mt-1 grid grid-cols-3 gap-2">
        <select aria-label="Hour" value={hour} onChange={(e) => setHour(Number(e.target.value))} className={selectCls}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
            <option key={h} value={h}>{h}</option>
          ))}
        </select>
        <select aria-label="Minute" value={minute} onChange={(e) => setMinute(Number(e.target.value))} className={selectCls}>
          {Array.from({ length: 60 }, (_, i) => i).map((m) => (
            <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
          ))}
        </select>
        <select aria-label="AM or PM" value={meridiem} onChange={(e) => setMeridiem(e.target.value as "AM" | "PM")} className={selectCls}>
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
      <p className="mt-1 text-xs text-muted/70">If you don&apos;t know it exactly, noon (12 PM) is a reasonable default.</p>
      <input type="hidden" name="birth_time" value={value} />
    </div>
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
    <div className="w-full space-y-2 rounded-lg border border-white/10 p-3">
      <input value={place} onChange={(e) => { setPlace(e.target.value); push(lat, lng, e.target.value); }}
        placeholder="Place name (optional)" className="w-full min-w-0 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 outline-none focus:border-accent" />
      <div className="grid grid-cols-2 gap-2">
        <input value={lat} onChange={(e) => { setLat(e.target.value); push(e.target.value, lng, place); }}
          placeholder="Latitude" inputMode="decimal" className="min-w-0 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 outline-none focus:border-accent" />
        <input value={lng} onChange={(e) => { setLng(e.target.value); push(lat, e.target.value, place); }}
          placeholder="Longitude" inputMode="decimal" className="min-w-0 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 outline-none focus:border-accent" />
      </div>
      <button type="button" onClick={onBack} className="text-xs text-muted underline">Back to search</button>
    </div>
  );
}
