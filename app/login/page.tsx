"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAdminAuth } from "@/lib/firebase/useAdminAuth";

function getFirebaseErrorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    switch (error.code) {
      case "auth/popup-closed-by-user":
        return "La fenetre Google a ete fermee avant la fin de la connexion.";
      case "auth/unauthorized-domain":
        return "Le domaine actuel n'est pas autorise dans Firebase Authentication.";
      case "auth/popup-blocked":
        return "Le navigateur a bloque la popup Google. Autorise les popups pour continuer.";
      case "auth/cancelled-popup-request":
        return "Une autre tentative de connexion est deja en cours.";
      default:
        return `Erreur Firebase : ${error.code}`;
    }
  }

  return "Connexion impossible pour le moment.";
}

export default function LoginPage() {
  const router = useRouter();
  const { loading, isAdmin, user } = useAdminAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && isAdmin) {
      router.replace("/");
    }
  }, [loading, isAdmin, router]);

  const handleLogin = async () => {
    setErrorMessage(null);
    setIsSubmitting(true);

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    try {
      await signInWithPopup(auth, provider);
      router.replace("/");
    } catch (error) {
      console.error("Login error:", error);
      setErrorMessage(getFirebaseErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <span className="eyebrow">Connexion admin</span>
        <h1>Acceder a ProxiPlay Admin</h1>
        <p className="hero-text">
          Identifie-toi avec le compte Google autorise pour acceder au tableau de bord.
        </p>

        <div className="status-row">
          <span className="status-pill ok">Firebase connecte</span>
        </div>

        <button
          className="primary-button"
          onClick={handleLogin}
          disabled={loading || isSubmitting}
          type="button"
        >
          {isSubmitting ? "Connexion..." : "Se connecter avec Google"}
        </button>

        {user && !isAdmin ? (
          <p className="feedback error">
            Ce compte est connecte mais non autorise a acceder a l administration.
          </p>
        ) : null}

        {errorMessage ? <p className="feedback error">{errorMessage}</p> : null}
      </section>
    </main>
  );
}