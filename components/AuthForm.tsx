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
    <div className="w-full max-w-sm text-center">
      <span aria-hidden className="text-2xl text-accent">✦</span>
      <h1 className="mt-3 text-2xl font-light tracking-tight sm:text-3xl">{title}</h1>
      {error && <p className="mt-4 text-sm text-accent">{error}</p>}
      {notice && <p className="mt-4 text-sm text-muted">{notice}</p>}
      <form className="mt-6 space-y-3 text-left">
        <input name="email" type="email" required placeholder="you@email.com"
          className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 outline-none focus:border-accent" />
        <input name="password" type="password" placeholder="password"
          className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 outline-none focus:border-accent" />
        <button formAction={primaryAction}
          className="w-full rounded-lg bg-fg px-3 py-2.5 font-medium text-bg">{primaryLabel}</button>
        {magicAction && (
          <button formAction={magicAction}
            className="w-full rounded-lg border border-white/15 px-3 py-2.5 text-sm text-muted transition-colors hover:text-fg">
            Email me a magic link instead
          </button>
        )}
      </form>
      <div className="mt-6 text-sm text-muted">{footer}</div>
    </div>
  );
}
