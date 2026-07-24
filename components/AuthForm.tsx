export function AuthForm({
  title,
  primaryLabel,
  primaryAction,
  magicAction,
  footer,
  error,
  notice,
}: {
  title: string;
  primaryLabel: string;
  primaryAction: (fd: FormData) => void;
  magicAction?: (fd: FormData) => void;
  footer: React.ReactNode;
  error?: string;
  notice?: string;
}) {
  return (
    <div className="w-full max-w-sm">
      <h1 className="mb-6 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
      {error && <p className="mb-4 text-sm text-accent">{error}</p>}
      {notice && <p className="mb-4 text-sm text-muted">{notice}</p>}
      <form className="space-y-3">
        <input name="email" type="email" required placeholder="you@email.com"
          className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2.5 outline-none focus:border-accent" />
        <input name="password" type="password" placeholder="password"
          className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2.5 outline-none focus:border-accent" />
        <button formAction={primaryAction}
          className="w-full rounded-md bg-fg px-3 py-2.5 font-medium text-bg">{primaryLabel}</button>
        {magicAction && (
          <button formAction={magicAction}
            className="w-full rounded-md border border-white/20 px-3 py-2.5 text-sm">
            Email me a magic link instead
          </button>
        )}
      </form>
      <div className="mt-6 text-sm text-muted">{footer}</div>
    </div>
  );
}
