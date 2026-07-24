import { adminSignIn } from "../actions";

export default async function AdminLogin({
  searchParams,
}: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <form action={adminSignIn} className="w-full max-w-sm space-y-3">
        <h1 className="text-3xl font-bold">Astra Admin</h1>
        {sp.error && <p className="text-sm text-accent">{sp.error}</p>}
        <input name="email" type="email" required placeholder="admin email"
          className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2" />
        <input name="password" type="password" required placeholder="password"
          className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2" />
        <button className="w-full rounded-md bg-fg px-3 py-2 font-medium text-bg">Enter</button>
      </form>
    </main>
  );
}
