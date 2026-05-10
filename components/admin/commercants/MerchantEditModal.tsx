"use client";

import { useEffect, useState } from "react";
import type { MerchantPilotageItem } from "@/types/dashboard";

type MerchantEditModalProps = {
  merchant: MerchantPilotageItem | null;
  open: boolean;
  saving: boolean;
  feedback: string | null;
  onClose: () => void;
  onSave: (payload: {
    name: string;
    description: string;
    address: string;
    areaCode: string;
    city: string;
    category: string[];
    facebookLink: string;
    instagramLink: string;
    twitterLink: string;
    siteWebUrl: string;
    imageFile: File | null;
    imageUrl: string;
    email: string;
    phone: string;
    commercialStatus: "" | "actif" | "a_relancer" | "inactif";
  }) => Promise<void>;
};

type FormState = {
  name: string;
  description: string;
  address: string;
  areaCode: string;
  city: string;
  category: string;
  facebookLink: string;
  instagramLink: string;
  twitterLink: string;
  siteWebUrl: string;
  imageFile: File | null;
  imageUrl: string;
  email: string;
  phone: string;
  commercialStatus: "" | "actif" | "a_relancer" | "inactif";
};

function buildInitialForm(merchant: MerchantPilotageItem | null): FormState {
  return {
    name: merchant?.name ?? "",
    description: merchant?.description ?? "",
    address: merchant?.address ?? "",
    areaCode: merchant?.areaCode ?? "",
    city: merchant?.city ?? "",
    category: merchant?.category?.join(", ") ?? "",
    facebookLink: merchant?.facebookLink ?? "",
    instagramLink: merchant?.instagramLink ?? "",
    twitterLink: merchant?.twitterLink ?? "",
    siteWebUrl: merchant?.siteWebUrl ?? "",
    imageFile: null,
    imageUrl: merchant?.imageUrl ?? "",
    email: merchant?.email ?? "",
    phone: merchant?.phone ?? "",
    commercialStatus: merchant?.commercialStatus ?? "",
  };
}

const inputClassName =
  "w-full rounded-[14px] border border-[rgba(159,177,199,0.12)] bg-[rgba(255,255,255,0.04)] px-4 py-3 text-[0.96rem] text-[var(--foreground)] outline-none transition focus:border-[rgba(99,153,34,0.32)]";

function normalizeSiteUrl(url: string) {
  const trimmed = url.trim();

  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

export function MerchantEditModal({
  merchant,
  open,
  saving,
  feedback,
  onClose,
  onSave,
}: MerchantEditModalProps) {
  const [form, setForm] = useState<FormState>(() => buildInitialForm(merchant));
  const [validationError, setValidationError] = useState<string | null>(null);
  const [localSaving, setLocalSaving] = useState(false);
  const [localFeedback, setLocalFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(buildInitialForm(merchant));
      setValidationError(null);
      setLocalSaving(false);
      setLocalFeedback(null);
    }
  }, [merchant, open]);

  if (!open || !merchant) {
    return null;
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.name.trim()) {
      setValidationError("Le nom du marchand est obligatoire.");
      return;
    }

    setValidationError(null);
    setLocalSaving(true);
    setLocalFeedback("Enregistrement en cours...");

    try {
      await onSave({
        name: form.name.trim(),
        description: form.description.trim(),
        address: form.address.trim(),
        areaCode: form.areaCode.trim(),
        city: form.city.trim(),
        category: form.category.split(",").map((category) => category.trim()).filter(Boolean),
        facebookLink: form.facebookLink.trim(),
        instagramLink: form.instagramLink.trim(),
        twitterLink: form.twitterLink.trim(),
        siteWebUrl: normalizeSiteUrl(form.siteWebUrl),
        imageFile: form.imageFile,
        imageUrl: form.imageUrl,
        email: form.email.trim(),
        phone: form.phone.trim(),
        commercialStatus: form.commercialStatus,
      });
      setLocalFeedback("Enregistré avec succès ✓");
    } catch {
      setLocalFeedback("Erreur lors de l'enregistrement.");
    } finally {
      setLocalSaving(false);
    }
  };

  return (
    <div className="game-edit-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="game-edit-modal max-w-[640px] bg-[linear-gradient(180deg,rgba(12,21,37,0.98),rgba(9,17,29,0.96))] text-[var(--foreground)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="merchant-edit-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="game-edit-modal-header border-b border-[rgba(159,177,199,0.1)]">
          <div>
            <h2 id="merchant-edit-title" className="text-[1.55rem] text-[var(--foreground)]">
              Modifier la fiche
            </h2>
            <p className="mt-2 text-[0.95rem] text-[var(--muted)]">
              Mets a jour les informations visibles pour {merchant.name}.
            </p>
          </div>
          <button
            type="button"
            className="game-edit-modal-close text-[var(--muted)] hover:text-[var(--foreground)]"
            onClick={onClose}
            aria-label="Fermer la modale"
          >
            x
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="game-edit-modal-body grid gap-6">
            <section className="rounded-[10px] border border-[rgba(159,177,199,0.12)] p-4">
              <h3 className="mb-4 text-[0.95rem] font-medium text-[var(--foreground)]">Informations de la boutique</h3>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <label className="text-[0.9rem] font-medium text-[var(--muted)]">Nom</label>
                  <input className={inputClassName} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
                </div>
                <div className="grid gap-2">
                  <label className="text-[0.9rem] font-medium text-[var(--muted)]">Description</label>
                  <textarea className={`${inputClassName} min-h-[80px] resize-none`} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <label className="text-[0.9rem] font-medium text-[var(--muted)]">Adresse</label>
                    <input className={inputClassName} value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-[0.9rem] font-medium text-[var(--muted)]">Code postal</label>
                    <input className={inputClassName} value={form.areaCode} onChange={(event) => setForm((current) => ({ ...current, areaCode: event.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <label className="text-[0.9rem] font-medium text-[var(--muted)]">Ville</label>
                    <input className={inputClassName} value={form.city} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-[0.9rem] font-medium text-[var(--muted)]">Categorie</label>
                    <input className={inputClassName} placeholder="ex: Alimentation, Restauration" value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <label className="text-[0.9rem] font-medium text-[var(--muted)]">Site web</label>
                    <input className={inputClassName} type="text" placeholder="https://..." value={form.siteWebUrl} onChange={(event) => setForm((current) => ({ ...current, siteWebUrl: event.target.value }))} />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-[0.9rem] font-medium text-[var(--muted)]">Facebook</label>
                    <input className={inputClassName} placeholder="nom-page" value={form.facebookLink} onChange={(event) => setForm((current) => ({ ...current, facebookLink: event.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <label className="text-[0.9rem] font-medium text-[var(--muted)]">Instagram</label>
                    <input className={inputClassName} placeholder="@handle" value={form.instagramLink} onChange={(event) => setForm((current) => ({ ...current, instagramLink: event.target.value }))} />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-[0.9rem] font-medium text-[var(--muted)]">Autre reseau social</label>
                    <input className={inputClassName} placeholder="url ou handle" value={form.twitterLink} onChange={(event) => setForm((current) => ({ ...current, twitterLink: event.target.value }))} />
                  </div>
                </div>
                <div className="grid gap-2">
                  <label className="text-[0.9rem] font-medium text-[var(--muted)]">Photo de la boutique</label>
                  {form.imageUrl || form.imageFile ? (
                    <div className="flex items-center gap-3 rounded-[14px] border border-[rgba(159,177,199,0.12)] bg-[rgba(255,255,255,0.04)] px-4 py-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={form.imageFile ? URL.createObjectURL(form.imageFile) : form.imageUrl} alt="Photo boutique" className="h-12 w-12 rounded-[8px] object-cover" />
                      <span className="flex-1 text-[0.9rem] text-[var(--muted)]">{form.imageFile ? form.imageFile.name : "Image actuelle"}</span>
                      <button type="button" className="text-[0.85rem] text-[#A32D2D]" onClick={() => setForm((current) => ({ ...current, imageFile: null, imageUrl: "" }))}>Supprimer</button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <label className="flex cursor-pointer items-center gap-3 rounded-[14px] border border-dashed border-[rgba(159,177,199,0.2)] bg-[rgba(255,255,255,0.02)] px-4 py-4 transition hover:border-[rgba(99,153,34,0.32)]">
                        <div className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-[rgba(99,153,34,0.1)] text-[18px]">📷</div>
                        <div>
                          <p className="text-[0.9rem] font-medium text-[var(--foreground)]">Choisir une photo</p>
                          <p className="text-[0.8rem] text-[var(--muted)] opacity-60">JPG, PNG ou WEBP · max 2 Mo</p>
                        </div>
                        <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => {
                          const file = event.target.files?.[0] ?? null;
                          if (!file) return;
                          if (file.size > 2 * 1024 * 1024) {
                            setValidationError("Image trop lourde : 2 Mo maximum.");
                            return;
                          }
                          setValidationError(null);
                          setForm((current) => ({ ...current, imageFile: file }));
                        }} />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-[10px] border border-[rgba(159,177,199,0.12)] p-4">
              <h3 className="mb-4 text-[0.95rem] font-medium text-[var(--foreground)]">Contact commercial</h3>
              <div className="grid gap-4">
                {(merchant.ownerFirstName || merchant.ownerLastName) && (
                  <div className="rounded-[10px] border border-[rgba(159,177,199,0.12)] bg-[rgba(255,255,255,0.02)] px-4 py-3">
                    <p className="text-[0.85rem] font-medium text-[var(--muted)]">Compte gerant (non modifiable ici)</p>
                    <p className="mt-1 text-[0.95rem] text-[var(--foreground)]">
                      {[merchant.ownerFirstName, merchant.ownerLastName].filter(Boolean).join(" ")}
                    </p>
                    <p className="mt-1 text-[0.85rem] text-[var(--muted)]">
                      {merchant.ownerEmail} · {merchant.ownerPhone}
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <label className="text-[0.9rem] font-medium text-[var(--muted)]">Email</label>
                    <input className={inputClassName} type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-[0.9rem] font-medium text-[var(--muted)]">Telephone</label>
                    <input className={inputClassName} value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
                  </div>
                </div>
                <div className="grid gap-2">
                  <label className="text-[0.9rem] font-medium text-[var(--muted)]">Statut commercial</label>
                  <div className="flex gap-2">
                    {([
                      { value: "", label: "Non renseigne" },
                      { value: "actif", label: "Actif" },
                      { value: "a_relancer", label: "A relancer" },
                      { value: "inactif", label: "Inactif" },
                    ] as const).map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setForm((current) => ({ ...current, commercialStatus: option.value }))}
                        className={`flex-1 rounded-[8px] border px-3 py-2 text-[0.85rem] font-medium transition ${
                          form.commercialStatus === option.value
                            ? "border-[#639922] bg-[#639922] text-white"
                            : "border-[rgba(159,177,199,0.2)] bg-[rgba(255,255,255,0.04)] text-[var(--muted)]"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {validationError ? <p className="feedback error m-0">{validationError}</p> : null}
            {feedback ? <p className="feedback m-0">{feedback}</p> : null}
          </div>

          <div className="game-edit-modal-footer border-t border-[rgba(159,177,199,0.1)]">
            {localFeedback ? (
              <div className={`rounded-[10px] px-4 py-3 text-[13px] font-medium ${
                localFeedback.includes("Erreur")
                  ? "border border-[#F09595] bg-[#FCEBEB] text-[#A32D2D]"
                  : localFeedback.includes("cours")
                    ? "border border-[#C0DD97] bg-[#EAF3DE] text-[#3B6D11]"
                    : "border border-[#C0DD97] bg-[#EAF3DE] text-[#3B6D11]"
              }`}>
                {localFeedback}
              </div>
            ) : null}
            <button type="button" className="secondary-button inline-secondary-button w-auto min-w-[140px]" onClick={onClose}>
              Annuler
            </button>
            <button
              type="submit"
              className="primary-button relative min-w-[160px]"
              disabled={saving || localSaving}
              style={{ background: "linear-gradient(135deg, #639922 0%, #7CB32B 100%)" }}
            >
              {localSaving ? (
                <span className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Enregistrement...
                </span>
              ) : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
