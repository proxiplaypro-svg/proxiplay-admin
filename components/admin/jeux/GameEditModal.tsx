"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Game, GameMerchantOption, GameStatus } from "@/types/dashboard";

type GameEditModalProps = {
  game: Game | null;
  merchants: GameMerchantOption[];
  open: boolean;
  saving: boolean;
  feedback: string | null;
  feedbackTone: "success" | "error" | null;
  onClose: () => void;
  onSave: (payload: {
    title: string;
    description: string;
    merchantId: string | null;
    merchantName: string;
    startDate: string | null;
    endDate: string | null;
    status: GameStatus;
    imageUrl: string | null;
    imageFile: File | null;
  }) => Promise<void>;
};

type FormState = {
  title: string;
  description: string;
  merchantId: string;
  startDate: string;
  endDate: string;
  status: GameStatus;
  imageUrl: string;
  imageFile: File | null;
};

const VALID_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 2 * 1024 * 1024;

function toInputDate(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildInitialForm(game: Game | null): FormState {
  return {
    title: game?.title ?? "",
    description: game?.description ?? "",
    merchantId: game?.merchantId ?? "",
    startDate: toInputDate(game?.startDate ?? null),
    endDate: toInputDate(game?.endDate ?? null),
    status: game?.status ?? "brouillon",
    imageUrl: game?.imageUrl ?? "",
    imageFile: null,
  };
}

function normalizeDate(value: string) {
  return value ? new Date(`${value}T00:00:00`).toISOString() : null;
}

export function GameEditModal({
  game,
  merchants,
  open,
  saving,
  feedback,
  feedbackTone,
  onClose,
  onSave,
}: GameEditModalProps) {
  const [form, setForm] = useState<FormState>(() => buildInitialForm(game));
  const [validationError, setValidationError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setForm(buildInitialForm(game));
      setValidationError(null);
      setDragActive(false);
    }
  }, [game, open]);

  const previewUrl = useMemo(() => {
    if (!form.imageFile) {
      return form.imageUrl || "";
    }

    return URL.createObjectURL(form.imageFile);
  }, [form.imageFile, form.imageUrl]);

  useEffect(() => {
    return () => {
      if (form.imageFile && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [form.imageFile, previewUrl]);

  if (!open || !game) {
    return null;
  }

  const merchantName =
    merchants.find((merchant) => merchant.id === form.merchantId)?.name ?? "Marchand inconnu";
  const hasMissingImage = !form.imageUrl && !form.imageFile;

  const updateForm = <T extends keyof FormState>(key: T, value: FormState[T]) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const validateFile = (file: File) => {
    if (!VALID_TYPES.includes(file.type)) {
      return "Formats acceptes: JPG, PNG ou WEBP uniquement.";
    }

    if (file.size > MAX_SIZE) {
      return "Image trop lourde: 2 Mo maximum.";
    }

    return null;
  };

  const applyFile = (file: File | null) => {
    if (!file) {
      return;
    }

    const error = validateFile(file);

    if (error) {
      setValidationError(error);
      return;
    }

    setValidationError(null);
    updateForm("imageFile", file);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      setValidationError("La date de fin doit etre posterieure a la date de debut.");
      return;
    }

    setValidationError(null);

    await onSave({
      title: form.title.trim(),
      description: form.description.trim(),
      merchantId: form.merchantId || null,
      merchantName,
      startDate: normalizeDate(form.startDate),
      endDate: normalizeDate(form.endDate),
      status: form.status,
      imageUrl: form.imageUrl.trim() || null,
      imageFile: form.imageFile,
    });
  };

  return (
    <div className="game-edit-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="game-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-edit-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="game-edit-modal-header">
          <h2 id="game-edit-modal-title">Modifier le jeu</h2>
          <button type="button" className="game-edit-modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <form className="game-edit-modal-body" onSubmit={handleSubmit}>
          {hasMissingImage ? (
            <div className="game-edit-warning">
              <strong>Image manquante</strong>
              <p>Ce jeu n&apos;a pas d&apos;image — il ne s&apos;affiche pas correctement pour les joueurs.</p>
            </div>
          ) : null}

          <label className="game-edit-field">
            <span className="search-label">Titre du jeu</span>
            <input
              className="search-input"
              type="text"
              value={form.title}
              onChange={(event) => updateForm("title", event.target.value)}
              required
            />
          </label>

          <label className="game-edit-field">
            <span className="search-label">Description / conditions</span>
            <textarea
              className="game-edit-textarea"
              rows={5}
              value={form.description}
              onChange={(event) => updateForm("description", event.target.value)}
            />
          </label>

          <div className="game-edit-modal-grid">
            <label className="game-edit-field">
              <span className="search-label">Marchand</span>
              <select
                className="games-filter-select"
                value={form.merchantId}
                onChange={(event) => updateForm("merchantId", event.target.value)}
              >
                <option value="">Aucun marchand</option>
                {merchants.map((merchant) => (
                  <option key={merchant.id} value={merchant.id}>
                    {merchant.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="game-edit-field">
              <span className="search-label">Statut</span>
              <select
                className="games-filter-select"
                value={form.status}
                onChange={(event) => updateForm("status", event.target.value as GameStatus)}
              >
                <option value="actif">Actif</option>
                <option value="brouillon">Brouillon</option>
                <option value="prive">Prive</option>
                <option value="expire">Expire</option>
              </select>
            </label>

            <label className="game-edit-field">
              <span className="search-label">Date de debut</span>
              <input
                className="search-input"
                type="date"
                value={form.startDate}
                onChange={(event) => updateForm("startDate", event.target.value)}
              />
            </label>

            <label className="game-edit-field">
              <span className="search-label">Date de fin</span>
              <input
                className="search-input"
                type="date"
                value={form.endDate}
                onChange={(event) => updateForm("endDate", event.target.value)}
              />
            </label>
          </div>

          <div className="game-edit-field">
            <div className="game-edit-image-head">
              <span className="search-label">Image du jeu</span>
              <button
                type="button"
                className="row-link-button secondary"
                onClick={() => fileInputRef.current?.click()}
              >
                Changer l&apos;image
              </button>
            </div>

            {previewUrl ? (
              <div className="game-edit-preview-shell">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="game-edit-preview" src={previewUrl} alt={form.title || "Apercu du jeu"} />
              </div>
            ) : (
              <div className="game-edit-empty-image">
                <strong>Image manquante</strong>
                <p>Ajoute une image pour corriger l&apos;affichage joueur.</p>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              style={{ display: "none" }}
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              onChange={(event) => applyFile(event.target.files?.[0] ?? null)}
            />

            <div
              className={`game-edit-dropzone ${dragActive ? "drag-active" : ""} ${hasMissingImage ? "missing" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragActive(false);
                applyFile(event.dataTransfer.files?.[0] ?? null);
              }}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
            >
              <strong>Glisser une image ici ou cliquer pour parcourir</strong>
              <span>JPG, PNG ou WEBP · max 2 Mo</span>
            </div>
          </div>

          {validationError ? (
            <div className="dashboard-banner error">
              <strong>Validation</strong>
              <p>{validationError}</p>
            </div>
          ) : null}

          {feedback && feedbackTone ? (
            <div className={`dashboard-banner ${feedbackTone}`}>
              <strong>{feedbackTone === "success" ? "Enregistre" : "Erreur"}</strong>
              <p>{feedback}</p>
            </div>
          ) : null}

          <div className="game-edit-modal-footer">
            <button type="button" className="row-link-button secondary" onClick={onClose} disabled={saving}>
              Annuler
            </button>
            <button type="submit" className="row-link-button" disabled={saving}>
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
