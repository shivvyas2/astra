"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminSignOut } from "@/app/admin/actions";
import { IconBack, IconLogout, IconOverview, IconStar, IconUsers } from "@/components/admin/icons";

/**
 * The admin frame, after the reference dashboard: a graphite frame, a
 * folder-tab title with a round back button, pill navigation on the right
 * (white when selected), and a warm-grey canvas below.
 */
export function AdminShell({
  title,
  back,
  children,
}: {
  title: string;
  /** Where the round button goes. Omitted on top-level screens, where it is the Astrya mark. */
  back?: { href: string; label: string };
  children: React.ReactNode;
}) {
  const path = usePathname() ?? "";
  const nav = [
    { href: "/admin", label: "Overview", icon: <IconOverview />, on: path === "/admin" },
    { href: "/admin/users", label: "Users", icon: <IconUsers />, on: path.startsWith("/admin/users") || path.startsWith("/admin/conversations") },
  ];

  return (
    <div className="adm-frame">
      <header className="adm-head">
        <div className="adm-tab">
          {back ? (
            <Link href={back.href} className="adm-round" aria-label={back.label} title={back.label}>
              <IconBack size={18} />
            </Link>
          ) : (
            <span className="adm-round adm-round--dark" aria-hidden="true">
              <IconStar size={18} />
            </span>
          )}
          <div className="min-w-0">
            <div className="adm-label">Astrya admin</div>
            <h1 className="adm-title">{title}</h1>
          </div>
        </div>
        <nav className="adm-nav" aria-label="Admin">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="adm-pill" aria-current={n.on ? "page" : undefined}>
              {n.icon}
              {n.label}
            </Link>
          ))}
          <form action={adminSignOut}>
            <button className="adm-pill adm-pill--dark" type="submit">
              <IconLogout />
              Sign out
            </button>
          </form>
        </nav>
      </header>
      <main className="adm-canvas">
        <div className="adm-wrap">{children}</div>
      </main>
    </div>
  );
}
