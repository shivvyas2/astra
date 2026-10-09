import Image from "next/image";

/**
 * Product visuals for the landing page, drawn with the same primitives the
 * signed-in site uses (globals.css), so what a visitor sees here is what the
 * product looks like once they sign up. Sample data only — nothing is read
 * from an account.
 */

const arrow = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M7 17L17 7M9 7h8v8" />
  </svg>
);

/** "The science": the chart facts a reading starts from, as the app's data rows. */
export function ChartFactsVisual() {
  const rows: [string, string, string?][] = [
    ["Lagna", "Vrishchika", "Scorpio rising · 14°22′"],
    ["Moon", "Rohini", "Nakshatra · pada 2"],
    ["Mahadasha", "Venus", "until March 2031"],
    ["Antardasha", "Saturn", "until June 2027"],
  ];
  return (
    <div className="brut-card relative overflow-hidden p-6 sm:p-7">
      <div className="flex items-center justify-between">
        <p className="eyebrow">Your chart · computed</p>
        <span className="brut-tag bg-ember">Vedic</span>
      </div>
      <div className="mt-4 flex items-baseline gap-2">
        <span className="text-7xl font-light tabular-nums tracking-tight text-accent sm:text-8xl">38</span>
        <span className="text-lg text-muted">%</span>
      </div>
      <p className="text-sm text-muted">through your Venus period</p>
      <div className="relative mt-4 h-1 rounded-full bg-rule">
        <div className="absolute inset-y-0 left-0 w-[38%] rounded-full bg-accent" />
        <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-bg" style={{ left: "38%" }} />
      </div>
      <dl className="mt-4">
        {rows.map(([label, value, detail], i) => (
          <div key={label} className={`flex items-baseline justify-between gap-4 py-3.5 ${i < rows.length - 1 ? "border-b border-rule" : ""}`}>
            <dt className="text-[13px] font-medium text-muted">{label}</dt>
            <dd className="text-right">
              <span className="block text-2xl font-medium tracking-tight">{value}</span>
              {detail && <span className="block text-[11px] tabular-nums text-muted">{detail}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** "Your chart": the three traditions as chips over a North Indian kundli. */
export function TraditionsVisual() {
  // A North Indian chart: a square, its diagonals, and the inner diamond.
  const houses: [number, number, string, string?][] = [
    [50, 26, "1", "Asc"], [26, 12, "2"], [12, 26, "3"], [26, 50, "4", "Mo"],
    [12, 74, "5"], [26, 88, "6"], [50, 74, "7", "Ve"], [74, 88, "8"],
    [88, 74, "9", "Ju"], [74, 50, "10", "Sa"], [88, 26, "11"], [74, 12, "12", "Su"],
  ];
  return (
    <div className="brut-card p-6 sm:p-7">
      <div className="flex flex-wrap gap-2" aria-hidden>
        <span className="brut-chip is-active" style={{ ["--chip" as string]: "var(--ember)" }}>Vedic</span>
        <span className="brut-chip">Western</span>
        <span className="brut-chip">Numerology</span>
      </div>
      <p className="mt-2 text-xs text-muted">Sidereal chart, dashas and today&apos;s transits</p>
      <svg viewBox="0 0 100 100" className="mx-auto mt-6 w-full max-w-[320px]" role="img" aria-label="A sample North Indian birth chart">
        <g fill="none" stroke="rgb(244 241 234 / 0.55)" strokeWidth="0.4">
          <rect x="1" y="1" width="98" height="98" rx="2" />
          <path d="M1 1L99 99M99 1L1 99M50 1L99 50L50 99L1 50Z" />
        </g>
        {houses.map(([x, y, n, planet]) => (
          <g key={n}>
            <text x={x} y={planet ? y - 2 : y + 1.5} textAnchor="middle" fontSize="3.6" fill="var(--muted)">{n}</text>
            {planet && (
              <text x={x} y={y + 4.5} textAnchor="middle" fontSize="5" fontWeight="500" fill={planet === "Asc" ? "var(--accent)" : "var(--fg)"}>{planet}</text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

/** "Your future": a question and its answer, ending in the lime "In simple words". */
export function ReadingVisual() {
  return (
    <div className="brut-card space-y-5 p-6 sm:p-7">
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-[22px] border border-line bg-fg/[0.06] px-4 py-3 text-[15px]">
          Will my work situation change in the next six months?
        </p>
      </div>
      <div className="flex gap-3">
        <span aria-hidden className="w-0.5 shrink-0 rounded-full bg-accent" />
        <div className="prose-reading min-w-0 text-[15px]">
          <h3>Saturn is asking for patience</h3>
          <p>
            You are in <strong>Venus mahadasha, Saturn antardasha</strong>. Saturn crosses your tenth house in
            April, the usual sign of a role that grows heavier before it grows bigger.
          </p>
          <div className="callout-simple">
            <p><strong>In simple words:</strong> yes, around April. Do the slow work now; it is what gets noticed.</p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-[28px] border border-line bg-fg/[0.04] py-1 pl-[18px] pr-1" aria-hidden>
        <span className="flex-1 py-1.5 text-[15px] text-muted">Ask Astrya…</span>
        <span className="circle-btn circle-btn-accent h-10 w-10">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      </div>
    </div>
  );
}

/** The daily reading card from the app's Today tab. */
function TodayCard() {
  return (
    <div className="brut-card p-6 sm:p-7">
      <div className="flex items-center gap-3">
        <span className="brut-tag bg-violet">Night</span>
        <span className="text-xs text-muted">Yesterday</span>
      </div>
      <h3 className="headline mt-4 text-3xl">A day of quiet pressure, easing tonight</h3>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Rahu on your Moon and Saturn behind you made today heavy; tomorrow opens softer.
      </p>
      <div className="mt-6 flex items-center justify-between border-t border-rule pt-4">
        <span className="number-badge">01.</span>
        <span className="flex items-center gap-3 text-sm font-medium">
          Read it
          <span className="circle-btn circle-btn-accent h-10 w-10">{arrow}</span>
        </span>
      </div>
    </div>
  );
}

const APP_FEATURES = [
  { label: "Today", text: "A reading every morning and night, written from today's sky and your chart." },
  { label: "Ask", text: "Any question, answered from your real placements — Vedic, Western or numerology." },
  { label: "Kundli", text: "Your full birth chart, dashas and nakshatras, drawn and explained." },
  { label: "Life", text: "Your periods laid out on a timeline, with alerts when a dosha or hard transit starts." },
];

/** Astrya on iPhone: the two device renders, a Today card, and what each tab does. */
export function AppShowcase() {
  return (
    <section className="border-t border-rule px-5 py-20 sm:px-8 sm:py-28">
      <div className="reveal mx-auto flex w-full max-w-6xl flex-col">
        <div className="flex items-center gap-3">
          <span className="number-badge">04.</span>
          <p className="screen-eyebrow">On iPhone</p>
        </div>
        <h2 className="headline headline-arrow mt-6 max-w-4xl text-5xl sm:text-7xl lg:text-8xl">Your chart, in your pocket</h2>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
          The same account on the web and on iPhone: readings, people and memory follow you. The app adds a reading
          every morning and night, home-screen widgets, and alerts when your sky shifts.
        </p>

        <div className="mt-12 grid gap-4 lg:grid-cols-5">
          <figure className="relative overflow-hidden rounded-[24px] border border-line lg:col-span-3">
            <Image
              src="/images/showcase-ask.jpg"
              alt="Astrya on iPhone: the Ask screen, with tradition chips and suggested questions"
              width={2200}
              height={1467}
              sizes="(min-width: 1024px) 60vw, 100vw"
              className="h-full w-full object-cover"
            />
            <figcaption className="absolute bottom-4 left-4 brut-tag bg-fg">Ask</figcaption>
          </figure>
          <div className="flex flex-col gap-4 lg:col-span-2">
            <TodayCard />
            <div className="brut-card grid flex-1 grid-cols-2 gap-px overflow-hidden bg-rule p-0">
              {APP_FEATURES.map((f) => (
                <div key={f.label} className="bg-bg p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-accent">{f.label}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{f.text}</p>
                </div>
              ))}
            </div>
          </div>
          <figure className="relative overflow-hidden rounded-[24px] border border-line lg:col-span-5">
            <Image
              src="/images/showcase-today.jpg"
              alt="Astrya on iPhone: the Today screen, with the date, a night reading and earlier readings"
              width={2200}
              height={1467}
              sizes="100vw"
              className="h-auto w-full object-cover object-top lg:aspect-[16/9]"
            />
            <figcaption className="absolute bottom-4 left-4 brut-tag bg-fg">Today</figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
