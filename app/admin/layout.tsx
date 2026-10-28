"use client";

import { useEffect, useState } from "react";
import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/admin/Sidebar";
import { auth } from "@/lib/firebase/auth";
import { useAdminAuth } from "@/lib/firebase/useAdminAuth";

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const { loading, isAdmin, user } = useAdminAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, router, user]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  if (loading) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="loader" aria-hidden="true" />
          <h1>Verification de la session</h1>
          <p className="hero-text">Controle des autorisations administrateur en cours.</p>
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
          <button className="primary-button" onClick={() => signOut(auth)} type="button">
            Changer de compte
          </button>
        </section>
      </main>
    );
  }

  return (
    <div className="admin-app-shell min-h-screen bg-[#F7F7F5] text-[#1A1A1A]">
      <aside className="admin-desktop-sidebar"><Sidebar user={user} /></aside>
      {menuOpen ? <div className="admin-mobile-menu" role="dialog" aria-modal="true" aria-label="Menu de navigation">
        <button type="button" className="admin-mobile-menu-backdrop" onClick={() => setMenuOpen(false)} aria-label="Fermer le menu" />
        <div className="admin-mobile-menu-panel"><Sidebar user={user} onNavigate={() => setMenuOpen(false)} onClose={() => setMenuOpen(false)} /></div>
      </div> : null}
      <div className="admin-workspace">
        <header className="admin-mobile-header">
          <button type="button" className="admin-menu-button" onClick={() => setMenuOpen(true)} aria-label="Ouvrir le menu" aria-expanded={menuOpen}><span className="admin-menu-icon" aria-hidden="true" /></button>
          <div><div className="text-[14px] font-medium text-[#1A1A1A]">Proxiplay</div><div className="text-[10px] text-[#999999]">Admin Console</div></div>
        </header>
        <main className="admin-main-content bg-[#F7F7F5]"><section className="admin-page-content min-h-full">{children}</section></main>
      </div>
    </div>
  );
}
