"use client";
import { useState } from "react";
import type { GeoResult } from "@/lib/geo";
import { PlaceAutocomplete } from "./PlaceAutocomplete";
import { resolveTimezone } from "@/lib/geo";

export type IntakeInitial = {
  firstName?: string;
  lastName?: string;
  birthDate?: string; // YYYY-MM-DD
  birthTime?: string; // HH:mm
  placeName?: string;
  lat?: number;
  lng?: number;
  timezone?: string;
  avatarUrl?: string | null;
};

export function IntakeForm({ action, initial }: { action: (fd: FormData) => void; initial?: IntakeInitial }) {
  const editing = !!initial;
  const [geo, setGeo] = useState<GeoResult | null>(
    initial?.lat != null && initial?.lng != null && initial?.timezone
      ? { name: initial.placeName ?? "", lat: initial.lat, lng: initial.lng, timezone: initial.timezone, country: "" }
      : null,
  );
  const [manual, setManual] = useState(false);
  const [birthDate, setBirthDate] = useState(initial?.birthDate ?? "");
  const [preview, setPreview] = useState<string | null>(initial?.avatarUrl ?? null);

  const prettyDate = birthDate
    ? new Date(`${birthDate}T00:00:00`).toLocaleDateString("en-US", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
      })
    : "";

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
      <div className="flex items-center gap-4">
        <label className="cursor-pointer">
          <div className="brut-bordered grid h-16 w-16 place-items-center overflow-hidden text-center text-[10px] font-bold uppercase tracking-wide text-muted transition-colors hover:border-accent">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Profile preview" className="h-full w-full object-cover" />
            ) : (
              <span>Add photo</span>
            )}
          </div>
          <input type="file" name="photo" accept="image/png,image/jpeg,image/webp" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; setPreview(f ? URL.createObjectURL(f) : null); }} />
        </label>
        <div>
          <p className="eyebrow">Photo</p>
          <p className="mt-1 text-xs text-muted">Optional. PNG, JPEG or WebP.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="eyebrow mb-1.5 block">First name</span>
          <input name="first_name" required placeholder="First name" defaultValue={initial?.firstName ?? ""} className="brut-field" />
        </label>
        <label className="block">
          <span className="eyebrow mb-1.5 block">Last name</span>
          <input name="last_name" required placeholder="Last name" defaultValue={initial?.lastName ?? ""} className="brut-field" />
        </label>
      </div>

      <label className="block">
        <span className="eyebrow mb-1.5 block">Birth date</span>
        <input name="birth_date" type="date" required value={birthDate} onChange={(e) => setBirthDate(e.target.value)}
          className="brut-field [color-scheme:dark]" />
        <span className={`mt-1.5 block text-xs ${birthDate ? "text-accent" : "text-muted"}`}>
          {birthDate ? `Selected: ${prettyDate}` : "No date selected yet"}
        </span>
      </label>

      <TimePicker initialTime={initial?.birthTime} />

      {!manual ? (
        <div>
          <PlaceAutocomplete onPick={setGeo} />
          <button type="button" onClick={() => { setManual(true); setGeo(null); }}
            className="mt-2 text-xs text-muted underline underline-offset-2 transition-colors hover:text-fg">
            Can&apos;t find your birthplace? Enter coordinates manually
          </button>
        </div>
      ) : (
        <ManualCoords onChange={manualGeo} onBack={() => { setManual(false); setGeo(null); }} />
      )}

      <input type="hidden" name="place_name" value={geo?.name ?? ""} />
      <input type="hidden" name="lat" value={geo?.lat ?? ""} />
      <input type="hidden" name="lng" value={geo?.lng ?? ""} />
      <input type="hidden" name="timezone" value={geo?.timezone ?? ""} />
      <button disabled={!geo} className="brut-btn brut-btn-primary w-full py-3">
        {editing ? "Update my details" : "Save & build my chart"}
      </button>
      {geo && <p className="text-xs text-muted">{geo.name ? `${geo.name} · ` : ""}{geo.timezone}</p>}
    </form>
  );
}

// Reliable time picker: Hour (1-12) / Minute / AM-PM selects that emit a 24h HH:mm
// value via a hidden `birth_time` field. Avoids the flaky native <input type="time">.
function parseTime(t?: string): { hour: number; minute: number; meridiem: "AM" | "PM" } {
  if (!t) return { hour: 12, minute: 0, meridiem: "PM" };
  const [hStr, mStr] = t.split(":");
  const h24 = Number(hStr);
  const minute = Number(mStr) || 0;
  const meridiem: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
  const hour = h24 % 12 === 0 ? 12 : h24 % 12;
  return { hour, minute, meridiem };
}

function TimePicker({ initialTime }: { initialTime?: string }) {
  const init = parseTime(initialTime);
  const [hour, setHour] = useState(init.hour); // 1-12
  const [minute, setMinute] = useState(init.minute); // 0-59
  const [meridiem, setMeridiem] = useState<"AM" | "PM">(init.meridiem);

  const hour24 = meridiem === "PM" ? (hour % 12) + 12 : hour % 12;
  const value = `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

  const selectCls = "brut-field cursor-pointer appearance-none pr-8 text-center [color-scheme:dark]";
  const chevron = {
    backgroundImage:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23f4f1ea' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 0.55rem center",
  } as const;

  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="eyebrow">Birth time</span>
        <span className="text-xs text-muted">as exact as you know</span>
      </div>
      <div className="mt-1.5 grid grid-cols-3 gap-2">
        <select aria-label="Hour" value={hour} onChange={(e) => setHour(Number(e.target.value))} className={selectCls} style={chevron}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
            <option key={h} value={h}>{h}</option>
          ))}
        </select>
        <select aria-label="Minute" value={minute} onChange={(e) => setMinute(Number(e.target.value))} className={selectCls} style={chevron}>
          {Array.from({ length: 60 }, (_, i) => i).map((m) => (
            <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
          ))}
        </select>
        <select aria-label="AM or PM" value={meridiem} onChange={(e) => setMeridiem(e.target.value as "AM" | "PM")} className={selectCls} style={chevron}>
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
      <span className="mt-1.5 block text-xs text-accent">Selected: {hour}:{String(minute).padStart(2, "0")} {meridiem} · noon is fine if unknown</span>
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
    <div className="brut-bordered w-full space-y-2 p-3">
      <span className="eyebrow block">Coordinates</span>
      <input value={place} onChange={(e) => { setPlace(e.target.value); push(lat, lng, e.target.value); }}
        placeholder="Place name (optional)" className="brut-field" />
      <div className="grid grid-cols-2 gap-2">
        <input value={lat} onChange={(e) => { setLat(e.target.value); push(e.target.value, lng, place); }}
          placeholder="Latitude" inputMode="decimal" className="brut-field" />
        <input value={lng} onChange={(e) => { setLng(e.target.value); push(lat, e.target.value, place); }}
          placeholder="Longitude" inputMode="decimal" className="brut-field" />
      </div>
      <button type="button" onClick={onBack} className="text-xs text-muted underline underline-offset-2 transition-colors hover:text-fg">Back to search</button>
    </div>
  );
}
