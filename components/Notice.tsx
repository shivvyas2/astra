/** An inline notice: an error in ember, or a confirmation in lime. Mirrors `BrutNotice` in the app. */
export function Notice({ tone = "error", children, className = "" }: { tone?: "error" | "info"; children: React.ReactNode; className?: string }) {
  const error = tone === "error";
  return (
    <p
      role={error ? "alert" : "status"}
      className={`flex items-baseline gap-2.5 rounded-[14px] border px-3.5 py-3 text-sm font-medium text-fg ${
        error ? "border-ember/55 bg-ember/10" : "border-accent/55 bg-accent/10"
      } ${className}`}
    >
      <span aria-hidden className={`relative top-[1px] h-2 w-2 shrink-0 rounded-full ${error ? "bg-ember" : "bg-accent"}`} />
      <span>{children}</span>
    </p>
  );
}
