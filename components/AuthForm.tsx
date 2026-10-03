export function AuthForm({
  title,
  subtitle,
  primaryLabel,
  primaryAction,
  magicAction,
  footer,
  error,
  notice,
}: {
  title: string;
  subtitle?: string;
  primaryLabel: string;
  primaryAction: (fd: FormData) => void;
  magicAction?: (fd: FormData) => void;
  footer: React.ReactNode;
  error?: string;
  notice?: string;
}) {
  return (
    <div className="w-full max-w-sm">
      <div className="brut-card p-6">
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
        {error && <p className="mt-4 border-l-4 border-accent pl-3 text-sm font-bold text-accent">{error}</p>}
        {notice && <p className="mt-4 border-l-4 border-fg pl-3 text-sm text-muted">{notice}</p>}
        <form className="mt-6 space-y-4">
          <label className="block">
            <span className="eyebrow mb-1.5 block">Email</span>
            <input name="email" type="email" required placeholder="you@email.com" className="brut-field" />
          </label>
          <label className="block">
            <span className="eyebrow mb-1.5 block">Password</span>
            <input name="password" type="password" placeholder="password" className="brut-field" />
          </label>
          <button formAction={primaryAction} className="brut-btn brut-btn-primary w-full py-3">{primaryLabel}</button>
          {magicAction && (
            <button formAction={magicAction} className="brut-btn brut-btn-quiet w-full py-2.5 text-sm">
              Email me a magic link instead
            </button>
          )}
        </form>
      </div>
      <div className="mt-6 text-center text-sm text-muted">{footer}</div>
    </div>
  );
}
