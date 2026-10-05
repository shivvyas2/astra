import { adminSignIn } from "../actions";
import { IconStar } from "@/components/admin/icons";

export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="adm-frame grid min-h-dvh place-items-center">
      <form action={adminSignIn} className="adm-card w-full max-w-sm space-y-3" style={{ background: "var(--adm-canvas)", borderRadius: 32, padding: 28 }}>
        <span className="adm-round adm-round--dark" aria-hidden="true">
          <IconStar size={18} />
        </span>
        <div>
          <div className="adm-label">Astrya</div>
          <h1 className="adm-title">Admin</h1>
        </div>
        {sp.error && (
          <p className="adm-note" role="alert">
            {sp.error}
          </p>
        )}
        <label className="block">
          <span className="adm-label">Email</span>
          <input name="email" type="email" required autoComplete="email" className="adm-input mt-1" style={{ paddingLeft: 18 }} />
        </label>
        <label className="block">
          <span className="adm-label">Password</span>
          <input name="password" type="password" required autoComplete="current-password" className="adm-input mt-1" style={{ paddingLeft: 18 }} />
        </label>
        <button className="adm-pill adm-pill--dark w-full justify-center" type="submit" style={{ height: 46 }}>
          Enter
        </button>
      </form>
    </main>
  );
}
