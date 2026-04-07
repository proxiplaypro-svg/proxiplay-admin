"use client";

import { useEffect } from "react";
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
    <div className="grid min-h-screen grid-cols-[220px_minmax(0,1fr)] bg-[#F7F7F5] text-[#1A1A1A]">
      <Sidebar user={user} />
      <main className="h-screen overflow-y-auto bg-[#F7F7F5] p-6">
        <section className="min-h-full">{children}</section>
      </main>
    </div>
  );
}
