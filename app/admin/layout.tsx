export const dynamic = "force-dynamic";

// Passthrough: the login page renders bare; authenticated pages wrap themselves
// in <AdminShell> so the sidebar never appears on the login screen.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh">{children}</div>;
}
