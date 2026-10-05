import "./admin.css";

export const dynamic = "force-dynamic";

// The admin's light theme is scoped to this wrapper (app/admin/admin.css), so
// the user app keeps its dark one. The login page renders bare inside it;
// authenticated pages wrap themselves in <AdminShell>.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="admin-theme">{children}</div>;
}
