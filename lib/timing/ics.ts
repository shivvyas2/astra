import type { TimingEvent } from "./engine";

/**
 * The timing engine's dates as an iCalendar file: one all-day event on the
 * day each window opens, with the day it closes in the description. Stable
 * UIDs, so importing a fresh copy updates the events rather than doubling them.
 */
function escape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

const encoder = new TextEncoder();

/**
 * Lines longer than 75 octets are folded, as RFC 5545 asks. Counted in UTF-8
 * bytes, never splitting a character, so a Hindi or Gujarati title (three
 * bytes a letter) folds as cleanly as an English one.
 */
function fold(line: string): string {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    if (bytes + size > 74) {
      out.push(current);
      current = " ";
      bytes = 1;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n");
}

/** The words the file adds around each event; English unless the route passes the reader's. */
export type IcsWords = {
  calendarName: string;
  tone: Record<TimingEvent["tone"], string>;
  closes: (date: string) => string;
  computed: string;
  /** The event's own title and detail, already in the reader's language. */
  text?: (e: TimingEvent) => { title: string; detail: string };
};

const ENGLISH: IcsWords = {
  calendarName: "Astrya key dates",
  tone: { supportive: "Supportive", challenging: "Challenging", mixed: "Mixed" },
  closes: (date) => `Window closes ${date}.`,
  computed: "Computed by Astrya from your chart.",
};

const day = (iso: string) => iso.replace(/-/g, "");
function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function timingIcs(events: TimingEvent[], stamp: Date = new Date(), words: IcsWords = ENGLISH): string {
  const dtstamp = stamp.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Astrya//Key dates//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    fold(`X-WR-CALNAME:${escape(words.calendarName)}`),
  ];
  for (const e of events) {
    // A window shows as a single start-day event: a months-long all-day bar
    // would cover the calendar. The close date is in the description.
    const { title, detail } = words.text ? words.text(e) : { title: e.title, detail: e.detail };
    const description = `${detail}${e.end ? ` ${words.closes(e.end)}` : ""} ${words.tone[e.tone]}. ${words.computed}`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@astrya`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${day(e.date)}`,
      `DTEND;VALUE=DATE:${day(nextDay(e.date))}`,
      fold(`SUMMARY:${escape(title)}`),
      fold(`DESCRIPTION:${escape(description)}`),
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
