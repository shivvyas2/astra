import type { TimingEvent } from "./engine";

/**
 * The timing engine's dates as an iCalendar file: one all-day event on the
 * day each window opens, with the day it closes in the description. Stable
 * UIDs, so importing a fresh copy updates the events rather than doubling them.
 */
function escape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** Lines longer than 75 octets are folded, as RFC 5545 asks. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = " " + rest.slice(74);
  }
  out.push(rest);
  return out.join("\r\n");
}

const day = (iso: string) => iso.replace(/-/g, "");
function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function timingIcs(events: TimingEvent[], stamp: Date = new Date()): string {
  const dtstamp = stamp.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Astrya//Key dates//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Astrya key dates",
  ];
  for (const e of events) {
    // A window shows as a single start-day event: a months-long all-day bar
    // would cover the calendar. The close date is in the description.
    const tone = e.tone === "supportive" ? "Supportive" : e.tone === "challenging" ? "Challenging" : "Mixed";
    const description = `${e.detail}${e.end ? ` Window closes ${e.end}.` : ""} ${tone}. Computed by Astrya from your chart.`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@astrya`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${day(e.date)}`,
      `DTEND;VALUE=DATE:${day(nextDay(e.date))}`,
      fold(`SUMMARY:${escape(e.title)}`),
      fold(`DESCRIPTION:${escape(description)}`),
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
