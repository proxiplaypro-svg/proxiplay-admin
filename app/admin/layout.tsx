"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/auth";
import { useAdminAuth } from "@/lib/firebase/useAdminAuth";

const navItems = [
  { href: "/admin/dashboard", label: "Dashboard", shortLabel: "01" },
  { href: "/admin/games", label: "Jeux", shortLabel: "02" },
  { href: "/admin/commercants", label: "Commercants", shortLabel: "03" },
  { href: "/admin/commercants-technique", label: "Commercants Tech", shortLabel: "04" },
  { href: "/admin/games-technique", label: "Jeux Tech", shortLabel: "05" },
  { href: "/admin/joueurs", label: "Joueurs", shortLabel: "06" },
  { href: "/admin/winners", label: "Gagnants", shortLabel: "07" },
  { href: "/admin/classements", label: "Classements", shortLabel: "08" },
  { href: "/admin/parrainage", label: "Parrainage", shortLabel: "09" },
  { href: "/admin/activite", label: "Activite", shortLabel: "10" },
  { href: "/admin/settings", label: "Parametres", shortLabel: "11" },
];

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, isAdmin, user } = useAdminAuth();
  const isActivePath = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, router, user]);

  if (loading) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="loader" aria-hidden="true" />
          <h1>Verification de la session</h1>
          <p className="hero-text">
            Controle des autorisations administrateur en cours.
          </p>
        </section>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  if (!isAdmin) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <span className="eyebrow">Acces refuse</span>
          <h1>Ce compte n est pas autorise</h1>
          <p className="hero-text">
            Seul le compte admin ProxiPlay peut acceder a cette interface.
          </p>
          <p className="feedback error">
            Connecte avec {user.email ?? "un compte Google non autorise"}.
          </p>
          <button
            className="primary-button"
            onClick={() => signOut(auth)}
            type="button"
          >
            Changer de compte
          </button>
        </section>
      </main>
    );
  }

  return (
    <div className="admin-layout-shell">
      <aside className="admin-sidebar">
        <div className="sidebar-brand">
          <span className="eyebrow">ProxiPlay</span>
          <h1>Admin Console</h1>
          <p>Centre de pilotage des jeux, joueurs et gains.</p>
        </div>

        <nav className="sidebar-nav" aria-label="Navigation admin">
          {navItems.map((item) => {
            const isActive = isActivePath(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-link ${isActive ? "active" : ""}`}
              >
                <span className="sidebar-link-index">{item.shortLabel}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user-card">
            <span className="status-pill ok">Admin autorise</span>
            <strong>{user.displayName ?? "Equipe ProxiPlay"}</strong>
            <p>{user.email}</p>
          </div>

          <button
            className="secondary-button"
            onClick={() => signOut(auth)}
            type="button"
          >
            Se deconnecter
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <div>
            <span className="eyebrow">Navigation</span>
            <h2>
              {navItems.find((item) => isActivePath(item.href))?.label ?? "Administration"}
            </h2>
          </div>
          <div className="status-row">
            <span className="status-pill neutral">Session active</span>
            <span className="status-pill ok">{user.email ?? "admin"}</span>
          </div>
        </header>

        <section className="admin-page-content">{children}</section>
      </div>
    </div>
  );
}
