/**
 * The top of a screen, as the app draws it: a dot and a small label in the
 * accent, one large phrase, and a sentence saying what the screen is for.
 * Mirrors `ScreenHeader` in mobile/Sanchara/Sources/Design/Components.swift.
 */
export function ScreenHeader({
  eyebrow,
  title,
  blurb,
  arrow = false,
  size = "lg",
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  blurb?: React.ReactNode;
  /** Ends the title with a diagonal arrow in the accent — "this way in". */
  arrow?: boolean;
  size?: "md" | "lg" | "xl";
  children?: React.ReactNode;
}) {
  const titleSize = { md: "text-3xl sm:text-4xl", lg: "text-4xl sm:text-5xl", xl: "text-5xl sm:text-6xl" }[size];
  return (
    <header>
      <div className="flex items-center gap-2">
        <p className="screen-eyebrow">{eyebrow}</p>
        <span className="astra-mark ml-auto" aria-hidden />
      </div>
      <h1 className={`headline mt-3 ${titleSize}${arrow ? " headline-arrow" : ""}`}>{title}</h1>
      {blurb && <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted">{blurb}</p>}
      {children}
    </header>
  );
}
