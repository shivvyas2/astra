import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { APPROX_TIMES, UNKNOWN_TIME, approxFromTime, parseBirthFields, parseTimeKnown } from "./birth";

const valid = {
  first_name: "Shiv",
  last_name: "Vyas",
  birth_date: "1998-02-09",
  birth_time: "06:30",
  place_name: "Mumbai, India",
  lat: "19.076",
  lng: "72.8777",
  timezone: "Asia/Kolkata",
};

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

describe("parseBirthFields", () => {
  it("accepts a complete form, treating a missing flag as a known time", () => {
    const r = parseBirthFields(form(valid));
    expect(r).toEqual({
      ok: true,
      value: {
        firstName: "Shiv", lastName: "Vyas", birthDate: "1998-02-09", birthTime: "06:30", birthTimeKnown: true,
        placeName: "Mumbai, India", lat: 19.076, lng: 72.8777, timezone: "Asia/Kolkata",
      },
    });
  });

  it("accepts JSON with numbers, and Postgres's HH:mm:ss", () => {
    const r = parseBirthFields({ ...valid, lat: 19.076, lng: 72.8777, birth_time: "06:30:00" });
    expect(r.ok && r.value.birthTime).toBe("06:30");
  });

  it("requires a time when the time is known", () => {
    const { birth_time: _t, ...rest } = valid;
    void _t;
    expect(parseBirthFields(form(rest))).toEqual({ ok: false, error: "Missing required field: birth_time" });
    expect(parseBirthFields(form({ ...valid, birth_time: "25:00" }))).toEqual({ ok: false, error: "birth_time must be HH:mm" });
  });

  it("casts an unknown time for noon, ignoring any time sent", () => {
    const r = parseBirthFields(form({ ...valid, birth_time_known: "false", birth_time: "06:30" }));
    expect(r.ok && r.value).toMatchObject({ birthTimeKnown: false, birthTime: UNKNOWN_TIME });
  });

  it("casts an unknown time for the middle of the rough part of day chosen", () => {
    for (const [approx, time] of Object.entries(APPROX_TIMES)) {
      const r = parseBirthFields({ ...valid, birth_time_known: false, birth_time_approx: approx });
      expect(r.ok && r.value).toMatchObject({ birthTimeKnown: false, birthTime: time });
      expect(approxFromTime(`${time}:00`)).toBe(approx);
    }
    expect(approxFromTime("12:00:00")).toBeNull();
    expect(parseBirthFields({ ...valid, birth_time_known: "false", birth_time_approx: "dawn" })).toEqual({
      ok: false,
      error: "birth_time_approx must be morning, afternoon, evening or night",
    });
  });

  it("rejects impossible dates, coordinates and zones", () => {
    const today = DateTime.fromISO("2026-10-05", { zone: "utc" });
    expect(parseBirthFields(form({ ...valid, birth_date: "1998-02-30" }), { today }).ok).toBe(false);
    expect(parseBirthFields(form({ ...valid, birth_date: "2030-01-01" }), { today }).ok).toBe(false);
    expect(parseBirthFields(form({ ...valid, lat: "not-a-number" }))).toEqual({ ok: false, error: "lat and lng must be numbers" });
    expect(parseBirthFields(form({ ...valid, lat: "91" })).ok).toBe(false);
    expect(parseBirthFields(form({ ...valid, timezone: "Mars/Olympus" })).ok).toBe(false);
  });

  it("makes the last name optional only when asked", () => {
    expect(parseBirthFields(form({ ...valid, last_name: "" })).ok).toBe(false);
    expect(parseBirthFields(form({ ...valid, last_name: "" }), { requireLastName: false }).ok).toBe(true);
  });
});

describe("parseTimeKnown", () => {
  it("reads false only from an explicit false", () => {
    expect(parseTimeKnown(undefined)).toBe(true);
    expect(parseTimeKnown(null)).toBe(true);
    expect(parseTimeKnown("true")).toBe(true);
    expect(parseTimeKnown("false")).toBe(false);
    expect(parseTimeKnown("0")).toBe(false);
    expect(parseTimeKnown(false)).toBe(false);
  });
});
