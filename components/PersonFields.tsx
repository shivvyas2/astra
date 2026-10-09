import { RELATIONSHIPS, RELATIONSHIP_LABEL, type Relationship } from "@/lib/profiles/types";

/** The two fields a saved person has beyond birth details: what you call them, and who they are to you. */
export function PersonFields({ label, relationship }: { label?: string; relationship?: Relationship }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="block">
        <span className="eyebrow block">Call them</span>
        <input name="label" maxLength={60} placeholder="Priya, Mom…" defaultValue={label ?? ""} className="brut-field" />
      </label>
      <label className="block">
        <span className="eyebrow block">They are your</span>
        <select name="relationship" defaultValue={relationship ?? "partner"} className="brut-field cursor-pointer [color-scheme:dark]">
          {RELATIONSHIPS.map((r) => (
            <option key={r} value={r}>{RELATIONSHIP_LABEL[r]}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** Two initials in an outlined circle: the avatar a saved person gets. */
export function Initials({ first, last, size = 44 }: { first: string; last?: string; size?: number }) {
  const text = `${first.trim()[0] ?? ""}${(last ?? "").trim()[0] ?? ""}`.toUpperCase() || "?";
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full border border-line bg-fg/[0.06] font-medium tracking-tight"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {text}
    </span>
  );
}
