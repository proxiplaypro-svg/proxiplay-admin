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
    city: string;
    email: string;
    phone: string;
    commercialStatus: "" | "actif" | "a_relancer" | "inactif";
  }) => Promise<void>;
};

type FormState = {
  name: string;
  city: string;
  email: string;
  phone: string;
  commercialStatus: "" | "actif" | "a_relancer" | "inactif";
};

function buildInitialForm(merchant: MerchantPilotageItem | null): FormState {
  return {
    name: merchant?.name ?? "",
    city: merchant?.city ?? "",
    email: merchant?.email ?? "",
    phone: merchant?.phone ?? "",
    commercialStatus: merchant?.commercialStatus ?? "",
  };
}

const inputClassName =
  "w-full rounded-[14px] border border-[rgba(159,177,199,0.12)] bg-[rgba(255,255,255,0.04)] px-4 py-3 text-[0.96rem] text-[var(--foreground)] outline-none transition focus:border-[rgba(99,153,34,0.32)]";

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

  useEffect(() => {
    if (open) {
      setForm(buildInitialForm(merchant));
      setValidationError(null);
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
    await onSave(form);
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
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="game-edit-modal-body grid gap-5">
            <div className="grid gap-2">
              <label className="text-[0.9rem] font-medium text-[var(--muted)]" htmlFor="merchant-name">
                Nom
              </label>
              <input
                id="merchant-name"
                className={inputClassName}
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="grid gap-2">
                <label className="text-[0.9rem] font-medium text-[var(--muted)]" htmlFor="merchant-city">
                  Ville
                </label>
                <input
                  id="merchant-city"
                  className={inputClassName}
                  value={form.city}
                  onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
                />
              </div>

              <div className="grid gap-2">
                <label className="text-[0.9rem] font-medium text-[var(--muted)]" htmlFor="merchant-status">
                  Statut
                </label>
                <select
                  id="merchant-status"
                  className={inputClassName}
                  value={form.commercialStatus}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      commercialStatus: event.target.value as FormState["commercialStatus"],
                    }))
                  }
                >
                  <option value="">Non renseigne</option>
                  <option value="actif">Actif</option>
                  <option value="a_relancer">A relancer</option>
                  <option value="inactif">Inactif</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="grid gap-2">
                <label className="text-[0.9rem] font-medium text-[var(--muted)]" htmlFor="merchant-email">
                  Email
                </label>
                <input
                  id="merchant-email"
                  className={inputClassName}
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                />
              </div>

              <div className="grid gap-2">
                <label className="text-[0.9rem] font-medium text-[var(--muted)]" htmlFor="merchant-phone">
                  Telephone
                </label>
                <input
                  id="merchant-phone"
                  className={inputClassName}
                  value={form.phone}
                  onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                />
              </div>
            </div>

            {validationError ? <p className="feedback error m-0">{validationError}</p> : null}
            {feedback ? <p className="feedback m-0">{feedback}</p> : null}
          </div>

          <div className="game-edit-modal-footer border-t border-[rgba(159,177,199,0.1)]">
            <button
              type="button"
              className="secondary-button inline-secondary-button w-auto min-w-[140px]"
              onClick={onClose}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="primary-button min-w-[160px]"
              disabled={saving}
              style={{ background: "linear-gradient(135deg, #639922 0%, #7CB32B 100%)", boxShadow: "0 16px 32px rgba(99,153,34,0.28)" }}
            >
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
