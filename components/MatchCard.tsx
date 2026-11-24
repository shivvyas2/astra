"use client";
import { useState } from "react";
import { IntakeForm } from "@/components/IntakeForm";
import type { MatchCard as Card } from "@/lib/compat/matchCard";
import { RELATIONSHIPS, type Relationship } from "@/lib/profiles/types";
import { useI18n } from "@/lib/i18n/client";

/**
 * "Is this right?": the birth details Astrya understood, to confirm before
 * anyone is saved or matched. Opens as a form when nothing was given, or on
 * Edit. Docs: docs/design/2026-11-24-chat-matching.md.
 */
export function MatchCard({
  card,
  busy,
  onMatched,
  onDismiss,
}: {
  card: Card;
  busy: boolean;
  /** The saved person, and the match question to ask about them. */
  onMatched: (personId: string, question: string) => void;
  onDismiss: () => void;
}) {
  const { t, date } = useI18n();
  const m = t.chat.match;
  const empty = !card.birthDate || card.places.length === 0;
  const [editing, setEditing] = useState(empty);
  const [relationship, setRelationship] = useState<Relationship>(card.relationship);
  const [birthDate, setBirthDate] = useState(card.altBirthDate ? null : card.birthDate);
  const [placeIndex, setPlaceIndex] = useState(card.placeAmbiguous ? -1 : 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Kept across a failed second step, so trying the same details again does
  // not save them twice. Changed details are saved afresh.
  const [saved, setSaved] = useState<{ id: string; details: string } | null>(null);
  // React resets a form after its action; what they typed is the new default.
  const [names, setNames] = useState({ first: card.name, last: "" });

  const place = card.places[placeIndex];
  const pretty = (iso: string) => date(new Date(`${iso}T00:00:00`), { day: "numeric", month: "short", year: "numeric" });
  const time =
    card.timeKnown && card.birthTime
      ? new Date(`2000-01-01T${card.birthTime}:00`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      : t.people.timeUnknown;

  async function match(body: Record<string, unknown>) {
    if (saving || busy) return;
    setSaving(true);
    setError(null);
    try {
      const details = JSON.stringify(body);
      let id = saved?.details === details ? saved.id : null;
      if (!id) {
        const res = await fetch("/api/profiles", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(String(res.status));
        id = ((await res.json()) as { person: { id: string } }).person.id;
        setSaved({ id, details });
      }
      const report = await fetch(`/api/compatibility?with=${id}`);
      if (!report.ok) throw new Error(String(report.status));
      onMatched(id, ((await report.json()) as { askPrompt: string }).askPrompt);
    } catch {
      setError(m.saveError);
      setSaving(false);
    }
  }

  const relationshipField = (
    <label className="block">
      <span className="eyebrow block">{t.people.theyAre}</span>
      <select
        value={relationship}
        onChange={(e) => setRelationship(e.target.value as Relationship)}
        disabled={saving}
        className="brut-field cursor-pointer [color-scheme:dark]"
      >
        {RELATIONSHIPS.map((r) => (
          <option key={r} value={r}>{t.people.relationships[r]}</option>
        ))}
      </select>
    </label>
  );

  const actions = "flex flex-wrap items-center gap-x-5 gap-y-2";
  const quiet = "min-h-[44px] text-sm text-muted underline underline-offset-2 transition-colors hover:text-fg disabled:opacity-40";

  return (
    <section aria-label={m.cardLabel} className="brut-card mt-4 max-w-md p-5">
      {editing ? (
        <IntakeForm
          action={(fd) => {
            setNames({ first: String(fd.get("first_name") ?? ""), last: String(fd.get("last_name") ?? "") });
            void match({ ...Object.fromEntries(fd), relationship });
          }}
          extra={relationshipField}
          initial={{
            firstName: names.first,
            lastName: names.last,
            birthDate: birthDate ?? card.birthDate ?? undefined,
            birthTime: card.birthTime ?? undefined,
            birthTimeKnown: card.timeKnown,
            ...(place ? { placeName: place.name, lat: place.lat, lng: place.lng, timezone: place.timezone } : {}),
          }}
          photo={false}
          lastNameOptional
          someoneElse
          submitLabel={saving ? m.saving : m.confirm}
        />
      ) : (
        <div className="space-y-4">
          <p className="headline text-2xl">{card.name}</p>
          {relationshipField}
          {card.altBirthDate && card.birthDate ? (
            <Choice
              label={`${m.born}: ${m.choose}`}
              options={[card.birthDate, card.altBirthDate].map((d) => ({ key: d, text: pretty(d) }))}
              value={birthDate}
              onPick={setBirthDate}
            />
          ) : null}
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="eyebrow">{m.born}</dt>
              <dd className="mt-1">{birthDate ? `${pretty(birthDate)}, ${time}` : time}</dd>
            </div>
            {!card.placeAmbiguous && place && (
              <div>
                <dt className="eyebrow">{m.place}</dt>
                <dd className="mt-1">{place.name}</dd>
              </div>
            )}
          </dl>
          {card.placeAmbiguous && (
            <Choice
              label={`${m.place}: ${m.choose}`}
              options={card.places.map((p, i) => ({ key: String(i), text: p.name }))}
              value={placeIndex < 0 ? null : String(placeIndex)}
              onPick={(key) => setPlaceIndex(Number(key))}
            />
          )}
          <button
            type="button"
            disabled={saving || busy || !birthDate || !place}
            onClick={() =>
              place &&
              void match({
                label: card.name,
                relationship,
                first_name: card.name,
                birth_date: birthDate,
                birth_time: card.birthTime ?? "",
                birth_time_known: card.timeKnown,
                place_name: place.name,
                lat: place.lat,
                lng: place.lng,
                timezone: place.timezone,
              })
            }
            className="brut-btn brut-btn-primary brut-btn-arrow min-h-[54px] w-full disabled:opacity-40"
          >
            {saving ? m.saving : m.confirm}
          </button>
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-ember">{error}</p>}
      <div className={`${actions} mt-2`}>
        {!editing && (
          <button type="button" disabled={saving} onClick={() => { setEditing(true); }} className={quiet}>{m.edit}</button>
        )}
        <button type="button" disabled={saving} onClick={onDismiss} className={quiet}>{m.notNow}</button>
      </div>
    </section>
  );
}

function Choice({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: { key: string; text: string }[];
  value: string | null;
  onPick: (key: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label}>
      <p className="eyebrow">{label}</p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={value === o.key}
            onClick={() => onPick(o.key)}
            className={`brut-chip${value === o.key ? " is-active" : ""}`}
          >
            {o.text}
          </button>
        ))}
      </div>
    </div>
  );
}
