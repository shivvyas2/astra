import { Notice } from "@/components/Notice";

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
      <div>
        <p className="screen-eyebrow">Account</p>
        <h1 className="headline headline-arrow mt-3 text-4xl sm:text-5xl">{title}</h1>
        {subtitle && <p className="mt-3 text-[15px] leading-relaxed text-muted">{subtitle}</p>}
        {error && <Notice className="mt-5">{error}</Notice>}
        {notice && <Notice tone="info" className="mt-5">{notice}</Notice>}
        <form className="mt-8 space-y-6">
          <label className="block">
            <span className="eyebrow block">Email</span>
            <input name="email" type="email" required placeholder="you@email.com" className="brut-field" />
          </label>
          <label className="block">
            <span className="eyebrow block">Password</span>
            <input name="password" type="password" placeholder="password" className="brut-field" />
          </label>
          <button formAction={primaryAction} className="brut-btn brut-btn-primary brut-btn-arrow mt-2 min-h-[54px] w-full">{primaryLabel}</button>
          {magicAction && (
            <button formAction={magicAction} className="brut-btn brut-btn-secondary min-h-[48px] w-full text-sm">
              Email me a magic link instead
            </button>
          )}
        </form>
      </div>
      <div className="mt-10 border-t border-rule pt-4 text-xs text-muted">{footer}</div>
    </div>
  );
}
