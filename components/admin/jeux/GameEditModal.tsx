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

const inputClassName =
  "w-full rounded-[8px] border border-[color:var(--color-border-tertiary,rgba(0,0,0,0.08))] bg-white px-3 py-[10px] text-[13px] text-[var(--color-text-primary,#171717)] outline-none placeholder:text-[var(--color-text-tertiary,#9a9a9a)]";

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
    <div className="fixed inset-0 z-50 bg-[rgba(15,23,42,0.48)] p-4" role="presentation" onClick={onClose}>
      <div
        className="mx-auto mt-[8vh] w-full max-w-[580px] rounded-[12px] bg-white shadow-[0_20px_60px_rgba(15,23,42,0.16)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-edit-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[color:var(--color-border-tertiary,rgba(0,0,0,0.08))] px-5 py-4">
          <h2 id="game-edit-modal-title" className="text-[18px] font-medium text-[var(--color-text-primary,#171717)]">
            Modifier le jeu
          </h2>
          <button
            type="button"
            className="text-[22px] leading-none text-[var(--color-text-tertiary,#9a9a9a)]"
            onClick={onClose}
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        <form className="flex flex-col gap-4 px-5 py-4" onSubmit={handleSubmit}>
          {hasMissingImage ? (
            <div className="rounded-[8px] border border-[#F09595] bg-[#FCEBEB] px-3 py-3 text-[12px] text-[#A32D2D]">
              <strong>⚠ Image manquante</strong>
              <p className="mt-1">Ce jeu ne s&apos;affiche pas correctement.</p>
            </div>
          ) : null}

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-[var(--color-text-secondary,#7b7b7b)]">Titre</span>
            <input
              className={inputClassName}
              type="text"
              value={form.title}
              onChange={(event) => updateForm("title", event.target.value)}
              required
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-[var(--color-text-secondary,#7b7b7b)]">Description</span>
            <textarea
              className={`${inputClassName} min-h-16 resize-none`}
              value={form.description}
              onChange={(event) => updateForm("description", event.target.value)}
            />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-[var(--color-text-secondary,#7b7b7b)]">Marchand</span>
              <select
                className={inputClassName}
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

            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-[var(--color-text-secondary,#7b7b7b)]">Statut</span>
              <select
                className={inputClassName}
                value={form.status}
                onChange={(event) => updateForm("status", event.target.value as GameStatus)}
              >
                <option value="actif">Actif</option>
                <option value="brouillon">Brouillon</option>
                <option value="prive">Prive</option>
                <option value="expire">Expire</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-[var(--color-text-secondary,#7b7b7b)]">Date début</span>
              <input
                className={inputClassName}
                type="date"
                value={form.startDate}
                onChange={(event) => updateForm("startDate", event.target.value)}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-[var(--color-text-secondary,#7b7b7b)]">Date fin</span>
              <input
                className={inputClassName}
                type="date"
                value={form.endDate}
                onChange={(event) => updateForm("endDate", event.target.value)}
              />
            </label>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-[var(--color-text-secondary,#7b7b7b)]">Image</span>
              {previewUrl ? (
                <button
                  type="button"
                  className="rounded-[8px] border border-[color:var(--color-border-tertiary,rgba(0,0,0,0.08))] bg-white px-3 py-2 text-[11px] font-medium text-[var(--color-text-primary,#171717)]"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Changer l&apos;image
                </button>
              ) : null}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              style={{ display: "none" }}
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              onChange={(event) => applyFile(event.target.files?.[0] ?? null)}
            />

            {previewUrl ? (
              <div className="flex items-center gap-3 rounded-[8px] border border-[color:var(--color-border-tertiary,rgba(0,0,0,0.08))] bg-[var(--color-background-primary,#fff)] px-3 py-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="h-[52px] w-[52px] rounded-[8px] object-cover" src={previewUrl} alt={form.title || "Apercu du jeu"} />
                <div className="text-[11px] text-[var(--color-text-secondary,#7b7b7b)]">
                  Image prête. Tu peux la remplacer avant d&apos;enregistrer.
                </div>
              </div>
            ) : (
              <div
                className={`cursor-pointer rounded-[8px] border border-dashed px-4 py-5 text-center ${
                  dragActive ? "border-[#E24B4A] bg-[#FFF4F4]" : "border-[#F09595] bg-[#FCEBEB]"
                }`}
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
                <strong className="block text-[12px] font-medium text-[#A32D2D]">
                  Glisser une image ou cliquer
                </strong>
                <span className="mt-1 block text-[11px] text-[#A32D2D]">JPG/PNG/WEBP, max 2Mo</span>
              </div>
            )}
          </div>

          {validationError ? (
            <div className="rounded-[8px] border border-[#F09595] bg-[#FCEBEB] px-3 py-3 text-[12px] text-[#A32D2D]">
              {validationError}
            </div>
          ) : null}

          {feedback && feedbackTone ? (
            <div
              className={`rounded-[8px] px-3 py-3 text-[12px] ${
                feedbackTone === "success"
                  ? "border border-[#B9D98E] bg-[#F2F8E8] text-[#3B6D11]"
                  : "border border-[#F09595] bg-[#FCEBEB] text-[#A32D2D]"
              }`}
            >
              {feedback}
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2 border-t border-[color:var(--color-border-tertiary,rgba(0,0,0,0.08))] pt-4">
            <button
              type="button"
              className="rounded-[8px] border border-[color:var(--color-border-tertiary,rgba(0,0,0,0.08))] bg-white px-4 py-[10px] text-[12px] font-medium text-[var(--color-text-primary,#171717)]"
              onClick={onClose}
              disabled={saving}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="rounded-[8px] border border-[#639922] bg-[#639922] px-4 py-[10px] text-[12px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-70"
              disabled={saving}
            >
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
