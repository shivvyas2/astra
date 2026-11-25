"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { NAME_SCRIPT_LABEL, NAME_SCRIPT_SAMPLE, NAME_SCRIPTS, NAMES_COOKIE, NAMES_COOKIE_MAX_AGE, type NameScript } from "@/lib/astrology/nameScript";
import { useI18n } from "@/lib/i18n/client";

/** Saves the choice and redraws every chart on the page with it. */
export function useChartNames(): [NameScript, (next: NameScript) => void] {
  const router = useRouter();
  const { names } = useI18n();
  // Shown at once; the refresh brings the rest of the page along.
  const [picked, setPicked] = useState<NameScript | null>(null);
  // Another chart on the page changed it: that newer choice wins.
  useEffect(() => setPicked(null), [names]);
  const choose = (next: NameScript) => {
    setPicked(next);
    document.cookie = `${NAMES_COOKIE}=${next}; path=/; max-age=${NAMES_COOKIE_MAX_AGE}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
    router.refresh();
  };
  return [picked ?? names, choose];
}

/** The names charts are drawn with, apart from the reading language. */
export function ChartNamesPicker() {
  const { t } = useI18n();
  const [names, choose] = useChartNames();
  return (
    <section className="mt-6">
      <p className="eyebrow">{t.chartNames.label}</p>
      <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={t.chartNames.label}>
        {NAME_SCRIPTS.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={names === s} onClick={() => names !== s && choose(s)} className={`brut-chip${names === s ? " is-active" : ""}`}>
            {NAME_SCRIPT_LABEL[s]}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">
        {NAME_SCRIPT_SAMPLE[names]}. {t.chartNames.helper}
      </p>
    </section>
  );
}
