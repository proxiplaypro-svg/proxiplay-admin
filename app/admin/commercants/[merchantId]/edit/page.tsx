"use client";

import { FirebaseError } from "firebase/app";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  deleteField,
  doc,
  getDoc,
  Timestamp,
  updateDoc,
  type DocumentReference,
  type Timestamp as FirestoreTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client-app";

type MerchantEditPageProps = {
  params: Promise<{
    merchantId: string;
  }>;
};

type FirestoreMerchantEditDocument = {
  name?: string;
  owner?: string;
  owner_id?: DocumentReference;
  contact_name?: string;
  email?: string;
  phone?: string;
  phone_number?: string;
  city?: string;
  address?: string;
  site_web_url?: string;
  website?: string;
  commercial_status?: "actif" | "a_relancer" | "inactif";
  admin_note?: string;
  last_contact_at?: FirestoreTimestamp;
  last_contact_channel?: string;
};

function extractUserIdFromOwner(owner?: string) {
  if (!owner) {
    return "";
  }

  const match = owner.match(/\/users\/([^/]+)$/);
  return match?.[1] ?? "";
}

type MerchantFormState = {
  name: string;
  contactName: string;
  ownerUserId: string;
  email: string;
  phone: string;
  city: string;
  address: string;
  website: string;
  commercialStatus: "" | "actif" | "a_relancer" | "inactif";
  adminNote: string;
  lastContactAt: string;
  lastContactChannel: string;
};

type MerchantEditSnapshot = {
  id: string;
  form: MerchantFormState;
};

function formatDateTimeInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function buildInitialForm(merchant: FirestoreMerchantEditDocument): MerchantFormState {
  return {
    name: merchant.name?.trim() ?? "",
    contactName:
      merchant.contact_name?.trim() ||
      (merchant.owner?.startsWith("/users/") ? "" : merchant.owner?.trim()) ||
      "",
    ownerUserId: merchant.owner_id?.id ?? extractUserIdFromOwner(merchant.owner),
    email: merchant.email?.trim() ?? "",
    phone: merchant.phone?.trim() || merchant.phone_number?.trim() || "",
    city: merchant.city?.trim() ?? "",
    address: merchant.address?.trim() ?? "",
    website: merchant.site_web_url?.trim() || merchant.website?.trim() || "",
    commercialStatus: merchant.commercial_status ?? "",
    adminNote: merchant.admin_note?.trim() ?? "",
    lastContactAt: merchant.last_contact_at
      ? formatDateTimeInput(merchant.last_contact_at.toDate())
      : "",
    lastContactChannel: merchant.last_contact_channel?.trim() ?? "",
  };
}

function getReadErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "permission-denied":
        return "Acces admin requis pour charger ce commercant.";
      case "unavailable":
        return "Firestore est temporairement indisponible. Reessaie dans un instant.";
      default:
        return "Impossible de charger le formulaire CRM du commercant.";
    }
  }

  return "Impossible de charger le formulaire CRM du commercant.";
}

function getSaveErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "permission-denied":
        return "Tu n as pas les droits necessaires pour enregistrer ce commercant.";
      case "unavailable":
        return "Firestore est temporairement indisponible. La sauvegarde n a pas abouti.";
      default:
        return "La sauvegarde CRM a echoue. Verifie les champs puis reessaie.";
    }
  }

  return "La sauvegarde CRM a echoue. Verifie les champs puis reessaie.";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidWebsite(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validateForm(form: MerchantFormState) {
  const errors: string[] = [];

  if (form.email.trim() && !isValidEmail(form.email.trim())) {
    errors.push("L email saisi n est pas valide.");
  }

  if (form.website.trim() && !isValidWebsite(form.website.trim())) {
    errors.push("Le site web doit commencer par http:// ou https://");
  }

  if (form.lastContactAt.trim() && Number.isNaN(new Date(form.lastContactAt).getTime())) {
    errors.push("La date du dernier contact est invalide.");
  }

  return errors;
}

export default function MerchantEditPage({ params }: MerchantEditPageProps) {
  const router = useRouter();
  const [merchant, setMerchant] = useState<MerchantEditSnapshot | null>(null);
  const [form, setForm] = useState<MerchantFormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  useEffect(() => {
    let isCancelled = false;

    const loadMerchant = async () => {
      setLoading(true);
      setError(null);

      try {
        const resolvedParams = await params;
        const merchantRef = doc(db, "enseignes", resolvedParams.merchantId);
        const merchantSnapshot = await getDoc(merchantRef);

        if (isCancelled) {
          return;
        }

        if (!merchantSnapshot.exists()) {
          setMerchant(null);
          setForm(null);
          setError("Commercant introuvable.");
          return;
        }

        const nextForm = buildInitialForm(merchantSnapshot.data() as FirestoreMerchantEditDocument);
        setMerchant({
          id: resolvedParams.merchantId,
          form: nextForm,
        });
        setForm(nextForm);
      } catch (loadError) {
        console.error(loadError);
        if (!isCancelled) {
          setMerchant(null);
          setForm(null);
          setError(getReadErrorMessage(loadError));
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    void loadMerchant();

    return () => {
      isCancelled = true;
    };
  }, [params]);

  const persistedFields = useMemo(
    () => [
      "name",
      "owner",
      "owner_id",
      "email",
      "phone",
      "phone_number",
      "city",
      "address",
      "site_web_url",
      "commercial_status",
      "admin_note",
      "last_contact_at",
      "last_contact_channel",
    ],
    [],
  );

  if (loading) {
    return (
      <section className="content-grid">
        <div className="panel panel-wide">
          <div className="game-details-skeleton">
            <span className="skeleton-line skeleton-label" />
            <strong className="skeleton-line skeleton-value" />
            <div className="dashboard-placeholder-grid">
              {Array.from({ length: 4 }).map((_, index) => (
                <article key={index} className="dashboard-placeholder-card skeleton-card">
                  <span className="skeleton-line skeleton-label" />
                  <strong className="skeleton-line skeleton-value" />
                  <small className="skeleton-line skeleton-helper" />
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (!merchant || !form) {
    return (
      <section className="content-grid">
        <div className="panel panel-wide">
          <div className="empty-state">
            <strong>{error ?? "Commercant introuvable"}</strong>
            <p>Retourne a la fiche CRM pour selectionner un commercant valide.</p>
          </div>
        </div>
      </section>
    );
  }

  const handleChange = (field: keyof MerchantFormState, value: string) => {
    setForm((current) => (current ? { ...current, [field]: value } : current));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const nextValidationErrors = validateForm(form);
    setValidationErrors(nextValidationErrors);
    setError(null);
    setSuccess(null);

    if (nextValidationErrors.length > 0) {
      return;
    }

    setIsSubmitting(true);

    try {
      const merchantRef = doc(db, "enseignes", merchant.id);
      const website = form.website.trim();
      const phone = form.phone.trim();
      const contactName = form.contactName.trim();
      const lastContactAt = form.lastContactAt.trim();
      const ownerUserId = form.ownerUserId.trim();

      await updateDoc(merchantRef, {
        name: form.name.trim() || deleteField(),
        owner: ownerUserId ? `/users/${ownerUserId}` : deleteField(),
        contact_name: contactName || deleteField(),
        owner_id: ownerUserId ? doc(db, "users", ownerUserId) : deleteField(),
        email: form.email.trim() || deleteField(),
        phone: phone || deleteField(),
        phone_number: phone || deleteField(),
        city: form.city.trim() || deleteField(),
        address: form.address.trim() || deleteField(),
        site_web_url: website || deleteField(),
        commercial_status: form.commercialStatus || deleteField(),
        admin_note: form.adminNote.trim() || deleteField(),
        last_contact_at: lastContactAt
          ? Timestamp.fromDate(new Date(lastContactAt))
          : deleteField(),
        last_contact_channel: form.lastContactChannel.trim() || deleteField(),
      });

      setMerchant((current) =>
        current
          ? {
              ...current,
              form: { ...form },
            }
          : current,
      );
      setSuccess("Fiche commercant enregistree avec succes dans Firestore.");
    } catch (saveError) {
      console.error(saveError);
      setError(getSaveErrorMessage(saveError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="content-grid">
      <div className="panel panel-wide">
        <div className="panel-heading game-details-header">
          <div>
            <h2>Modifier le commercant</h2>
            <p>Edition CRM persistée de l enseigne `{form.name || merchant.id}` sans changer les requetes existantes.</p>
          </div>
          <div className="game-details-header-actions">
            <Link className="row-link-button secondary" href={`/admin/commercants/${merchant.id}`}>
              Annuler
            </Link>
            <Link className="row-link-button" href={`/admin/commercants/${merchant.id}`}>
              Retour fiche CRM
            </Link>
          </div>
        </div>
      </div>

      <div className="panel panel-wide">
        <form className="game-edit-form" onSubmit={handleSubmit}>
          <div className="panel-heading">
            <h2>Informations CRM</h2>
            <p>Edition des informations de base du commercant, avec persistance directe dans `enseignes/{merchant.id}`.</p>
          </div>

          <div className="game-edit-grid">
            <label className="game-edit-field">
              <span className="search-label">Nom enseigne</span>
              <input
                className="search-input"
                type="text"
                value={form.name}
                onChange={(event) => handleChange("name", event.target.value)}
                disabled={isSubmitting}
              />
            </label>

            <label className="game-edit-field">
              <span className="search-label">Contact principal</span>
              <input
                className="search-input"
                type="text"
                value={form.contactName}
                onChange={(event) => handleChange("contactName", event.target.value)}
                disabled={isSubmitting}
              />
            </label>

            <label className="game-edit-field">
              <span className="search-label">User rattache</span>
              <input
                className="search-input"
                type="text"
                placeholder="ID du document user"
                value={form.ownerUserId}
                onChange={(event) => handleChange("ownerUserId", event.target.value)}
                disabled={isSubmitting}
              />
              <small className="helper-text">
                Ce champ persiste `owner_id` comme reference vers `users/{'{userId}'}`.
              </small>
            </label>

            <label className="game-edit-field">
              <span className="search-label">Email</span>
              <input
                className="search-input"
                type="email"
                value={form.email}
                onChange={(event) => handleChange("email", event.target.value)}
                disabled={isSubmitting}
              />
            </label>

            <label className="game-edit-field">
              <span className="search-label">Telephone</span>
              <input
                className="search-input"
                type="tel"
                value={form.phone}
                onChange={(event) => handleChange("phone", event.target.value)}
                disabled={isSubmitting}
              />
              <small className="helper-text">Le telephone reste souple et non bloquant, mais sera nettoye avant sauvegarde.</small>
            </label>

            <label className="game-edit-field">
              <span className="search-label">Ville</span>
              <input
                className="search-input"
                type="text"
                value={form.city}
                onChange={(event) => handleChange("city", event.target.value)}
                disabled={isSubmitting}
              />
            </label>

            <label className="game-edit-field">
              <span className="search-label">Adresse</span>
              <input
                className="search-input"
                type="text"
                value={form.address}
                onChange={(event) => handleChange("address", event.target.value)}
                disabled={isSubmitting}
              />
            </label>

            <label className="game-edit-field game-edit-field-wide">
              <span className="search-label">Site web</span>
              <input
                className="search-input"
                type="url"
                placeholder="https://..."
                value={form.website}
                onChange={(event) => handleChange("website", event.target.value)}
                disabled={isSubmitting}
              />
            </label>

            <label className="game-edit-field">
              <span className="search-label">Statut commercial</span>
              <select
                className="games-filter-select"
                value={form.commercialStatus}
                onChange={(event) => handleChange("commercialStatus", event.target.value)}
                disabled={isSubmitting}
              >
                <option value="">Non renseigne</option>
                <option value="actif">Actif</option>
                <option value="a_relancer">A relancer</option>
                <option value="inactif">Inactif</option>
              </select>
            </label>

            <label className="game-edit-field">
              <span className="search-label">Dernier contact</span>
              <input
                className="search-input"
                type="datetime-local"
                value={form.lastContactAt}
                onChange={(event) => handleChange("lastContactAt", event.target.value)}
                disabled={isSubmitting}
              />
            </label>

            <label className="game-edit-field">
              <span className="search-label">Dernier canal utilise</span>
              <select
                className="games-filter-select"
                value={form.lastContactChannel}
                onChange={(event) => handleChange("lastContactChannel", event.target.value)}
                disabled={isSubmitting}
              >
                <option value="">Non renseigne</option>
                <option value="email">Email</option>
                <option value="phone">Telephone</option>
                <option value="sms">SMS</option>
                <option value="notification">Notification</option>
                <option value="meeting">Rendez-vous</option>
              </select>
            </label>

            <label className="game-edit-field game-edit-field-wide">
              <span className="search-label">Note admin</span>
              <textarea
                className="game-edit-textarea"
                rows={6}
                value={form.adminNote}
                onChange={(event) => handleChange("adminNote", event.target.value)}
                disabled={isSubmitting}
              />
            </label>
          </div>

          <div className="panel-heading game-edit-subheading">
            <h2>Validation</h2>
            <p>Validation simple et non intrusive: email, URL et date de contact si elles sont renseignees.</p>
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
              <strong>Sauvegarde impossible</strong>
              <p>{error}</p>
            </div>
          ) : null}

          {success ? (
            <div className="dashboard-banner success">
              <strong>Fiche CRM enregistree</strong>
              <p>{success}</p>
            </div>
          ) : null}

          <div className="dashboard-actions game-edit-actions">
            <button className="primary-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Enregistrement..." : "Enregistrer"}
            </button>
            <button
              className="secondary-button inline-secondary-button"
              type="button"
              disabled={isSubmitting}
              onClick={() => router.push(`/admin/commercants/${merchant.id}`)}
            >
              Annuler
            </button>
          </div>
        </form>
      </div>

      <div className="panel panel-wide">
        <div className="panel-heading">
          <h2>Resume des champs persistés</h2>
          <p>Les champs CRM sont ecrits proprement dans le document commercant sans changer la structure globale.</p>
        </div>
        <div className="action-list">
          {persistedFields.map((item) => (
            <article key={item} className="action-item">
              <span>{item}</span>
            </article>
          ))}
          <article className="action-item">
            <span>Fallback de compatibilite: le telephone est ecrit dans `phone` et `phone_number`.</span>
          </article>
        </div>
      </div>
    </section>
  );
}
