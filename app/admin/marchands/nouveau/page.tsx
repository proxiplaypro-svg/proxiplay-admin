"use client";

import { FirebaseError } from "firebase/app";
import { sendPasswordResetEmail } from "firebase/auth";
import Link from "next/link";
import { useState } from "react";
import { auth } from "@/lib/firebase/auth";

type FormState = {
  name: string;
  email: string;
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getInviteErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "auth/network-request-failed":
        return "Le compte a ete cree, mais l email d invitation n a pas pu etre envoye. Verifie la connexion puis reessaie.";
      case "auth/too-many-requests":
        return "Le compte a ete cree, mais Firebase bloque temporairement l envoi de l email. Reessaie dans quelques minutes.";
      default:
        return "Le compte a ete cree, mais l email d invitation n a pas pu etre envoye.";
    }
  }

  return "Le compte a ete cree, mais l email d invitation n a pas pu etre envoye.";
}

function getCreateErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Impossible de creer le compte marchand pour le moment.";
}

export default function NewMerchantPage() {
  const [form, setForm] = useState<FormState>({ name: "", email: "" });
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleChange = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (submitting) {
      return;
    }

    const nextValidationErrors: string[] = [];
    const trimmedName = form.name.trim();
    const normalizedEmail = form.email.trim().toLowerCase();

    if (!trimmedName) {
      nextValidationErrors.push("Le nom du commerce est obligatoire.");
    }

    if (!normalizedEmail) {
      nextValidationErrors.push("L email du commercant est obligatoire.");
    } else if (!isValidEmail(normalizedEmail)) {
      nextValidationErrors.push("L adresse email saisie n est pas valide.");
    }

    setValidationErrors(nextValidationErrors);
    setError(null);
    setSuccess(null);

    if (nextValidationErrors.length > 0) {
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/admin/marchands", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: trimmedName,
          email: normalizedEmail,
        }),
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Impossible de creer le compte marchand pour le moment.");
      }

      await sendPasswordResetEmail(auth, normalizedEmail);

      setSuccess(`Compte cree. Un email d invitation a ete envoye a ${normalizedEmail}.`);
      setForm({ name: "", email: "" });
      setValidationErrors([]);
    } catch (submitError) {
      console.error(submitError);

      if (submitError instanceof FirebaseError) {
        setError(getInviteErrorMessage(submitError));
      } else {
        setError(getCreateErrorMessage(submitError));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="content-grid">
      <div className="panel panel-wide">
        <div className="panel-heading game-details-header">
          <div>
            <h2>Nouveau marchand</h2>
            <p>Creation d un compte marchand avec invitation Firebase et enregistrement direct dans `enseignes`.</p>
          </div>
          <div className="game-details-header-actions">
            <Link className="secondary-button inline-secondary-button" href="/admin/commercants">
              Retour aux commercants
            </Link>
          </div>
        </div>
      </div>

      <div className="panel panel-wide">
        <form className="game-edit-form" onSubmit={handleSubmit}>
          <div className="panel-heading">
            <h2>Compte marchand</h2>
            <p>Le compte Firebase Auth est cree avec un mot de passe temporaire, puis un email permet au commercant de definir son propre mot de passe.</p>
          </div>

          <div className="game-edit-grid">
            <label className="game-edit-field">
              <span className="search-label">Nom du commerce</span>
              <input
                className="search-input"
                type="text"
                value={form.name}
                onChange={(event) => handleChange("name", event.target.value)}
                disabled={submitting}
                autoComplete="organization"
              />
            </label>

            <label className="game-edit-field">
              <span className="search-label">Email du commercant</span>
              <input
                className="search-input"
                type="email"
                value={form.email}
                onChange={(event) => handleChange("email", event.target.value)}
                disabled={submitting}
                autoComplete="email"
              />
            </label>
          </div>

          {validationErrors.length > 0 ? (
            <div className="dashboard-feedback-stack">
              {validationErrors.map((item) => (
                <div key={item} className="dashboard-banner error">
                  <strong>Validation</strong>
                  <p>{item}</p>
                </div>
              ))}
            </div>
          ) : null}

          {error ? (
            <div className="dashboard-banner error">
              <strong>Creation impossible</strong>
              <p>{error}</p>
            </div>
          ) : null}

          {success ? (
            <div className="dashboard-banner success">
              <strong>Invitation envoyee</strong>
              <p>{success}</p>
            </div>
          ) : null}

          <div className="dashboard-actions game-edit-actions">
            <button className="primary-button" type="submit" disabled={submitting}>
              {submitting ? "Creation..." : "Creer le compte"}
            </button>
            <Link className="secondary-button inline-secondary-button" href="/admin/commercants">
              Annuler
            </Link>
          </div>
        </form>
      </div>
    </section>
  );
}
