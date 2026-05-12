"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Game, GameMerchantOption, GameSecondaryPrize, GameStatus } from "@/types/dashboard";

type SavePayload = {
  title: string;
  description: string;
  merchantId: string | null;
  merchantName: string;
  startDate: string | null;
  endDate: string | null;
  status: GameStatus;
  imageUrl: string | null;
  imageFile: File | null;
  hasMainPrize: boolean;
  mainPrizeTitle: string;
  mainPrizeDescription: string;
  mainPrizeValue: string;
  mainPrizeImage: string | null;
  mainPrizeImageFile: File | null;
  secondaryPrizes: GameSecondaryPrize[];
  restrictedToAdults: boolean;
};

type GameEditModalProps = {
  game: Game | null;
  merchants: GameMerchantOption[];
  open: boolean;
  saving: boolean;
  feedback: string | null;
  feedbackTone: "success" | "error" | null;
  onClose: () => void;
  onSave: (payload: SavePayload) => Promise<void>;
  onDelete?: (game: Game) => Promise<void>;
};

type GeneralFormState = {
  title: string;
  description: string;
  merchantId: string;
  startDate: string;
  endDate: string;
  status: GameStatus;
  imageUrl: string;
  imageFile: File | null;
  restrictedToAdults: boolean;
};

type MainPrizeFormState = {
  hasMainPrize: boolean;
  title: string;
  description: string;
  value: string;
  imageUrl: string;
  imageFile: File | null;
};

type SecondaryPrizeFormItem = GameSecondaryPrize & {
  imageFile: File | null;
};

const VALID_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 2 * 1024 * 1024;
const inputClassName =
  "w-full rounded-[8px] border border-[#E8E8E4] bg-white px-3 py-[10px] text-[13px] text-[#1A1A1A] outline-none placeholder:text-[#999999] disabled:bg-[#F0F0EC] disabled:text-[#999999]";
const sectionClassName =
  "rounded-[10px] border border-[#E8E8E4] bg-white p-4";

function toInputDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeDate(value: string) {
  return value ? new Date(`${value}T00:00:00`).toISOString() : null;
}

function createSecondaryPrizeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `secondary-prize-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createEmptySecondaryPrize(): SecondaryPrizeFormItem {
  return { id: createSecondaryPrizeId(), name: "", description: "", count: "", image: null, imageFile: null };
}

function buildInitialGeneralForm(game: Game | null): GeneralFormState {
  return {
    title: game?.title ?? "",
    description: game?.description ?? "",
    merchantId: game?.merchantId ?? "",
    startDate: toInputDate(game?.startDate ?? null),
    endDate: toInputDate(game?.endDate ?? null),
    status: game?.status ?? "brouillon",
    imageUrl: game?.imageUrl ?? "",
    imageFile: null,
    restrictedToAdults: game?.restrictedToAdults ?? false,
  };
}

function buildInitialMainPrizeForm(game: Game | null): MainPrizeFormState {
  return {
    hasMainPrize: game?.hasMainPrize ?? false,
    title: game?.mainPrizeTitle ?? "",
    description: game?.mainPrizeDescription ?? "",
    value: game?.mainPrizeValue ?? "",
    imageUrl: game?.mainPrizeImage ?? "",
    imageFile: null,
  };
}

function buildInitialSecondaryPrizes(game: Game | null): SecondaryPrizeFormItem[] {
  return (game?.secondaryPrizes ?? []).map((prize) => ({ ...prize, imageFile: null }));
}

function buildPreviewUrl(file: File | null, fallbackUrl: string | null) {
  return file ? URL.createObjectURL(file) : fallbackUrl || "";
}

function getFileError(file: File) {
  if (!VALID_TYPES.includes(file.type)) return "Formats acceptes: JPG, PNG ou WEBP uniquement.";
  if (file.size > MAX_SIZE) return "Image trop lourde: 2 Mo maximum.";
  return null;
}

function parsePrizeCount(value: string) {
  if (!value.trim()) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function isSecondaryPrizeEmpty(prize: SecondaryPrizeFormItem) {
  return !prize.name.trim() && !prize.description.trim() && !prize.count.trim() && !prize.image && !prize.imageFile;
}

type ImageInputCardProps = {
  label: string;
  previewUrl: string;
  emptyLabel: string;
  emptyHint: string;
  onFileSelect: (file: File | null) => void;
  disabled?: boolean;
};

function ImageInputCard({ label, previewUrl, emptyLabel, emptyHint, onFileSelect, disabled = false }: ImageInputCardProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-[var(--color-text-secondary,#7b7b7b)]">{label}</span>
        <button
          type="button"
          className="rounded-[8px] border border-[#E8E8E4] bg-white px-3 py-2 text-[11px] font-medium text-[#1A1A1A] disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
        >
          {previewUrl ? "Remplacer l image" : "Ajouter une image"}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        style={{ display: "none" }}
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        onChange={(event) => onFileSelect(event.target.files?.[0] ?? null)}
      />
      {previewUrl ? (
        <div className="flex items-center gap-3 rounded-[8px] border border-[#E8E8E4] bg-white px-3 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="h-[52px] w-[52px] rounded-[8px] object-cover" src={previewUrl} alt={label} />
          <div className="text-[11px] text-[#666666]">Image prete. Tu peux la remplacer avant d enregistrer.</div>
        </div>
      ) : (
        <div
          className={`cursor-pointer rounded-[8px] border border-dashed px-4 py-5 text-center ${
            dragActive ? "border-[#E24B4A] bg-[#FFF4F4]" : "border-[#E8E8E4] bg-[#F7F7F5]"
          } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            if (!disabled) setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            if (!disabled) onFileSelect(event.dataTransfer.files?.[0] ?? null);
          }}
          onClick={() => {
            if (!disabled) inputRef.current?.click();
          }}
          role="button"
          tabIndex={disabled ? -1 : 0}
          onKeyDown={(event) => {
            if (!disabled && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
        >
          <strong className="block text-[12px] font-medium text-[#1A1A1A]">{emptyLabel}</strong>
          <span className="mt-1 block text-[11px] text-[#666666]">{emptyHint}</span>
        </div>
      )}
    </div>
  );
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
  onDelete,
}: GameEditModalProps) {
  const [generalForm, setGeneralForm] = useState<GeneralFormState>(() => buildInitialGeneralForm(game));
  const [mainPrizeForm, setMainPrizeForm] = useState<MainPrizeFormState>(() => buildInitialMainPrizeForm(game));
  const [secondaryPrizes, setSecondaryPrizes] = useState<SecondaryPrizeFormItem[]>(() => buildInitialSecondaryPrizes(game));
  const [validationError, setValidationError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => {
    if (open) {
      setGeneralForm(buildInitialGeneralForm(game));
      setMainPrizeForm(buildInitialMainPrizeForm(game));
      setSecondaryPrizes(buildInitialSecondaryPrizes(game));
      setValidationError(null);
      setDeleteConfirm(false);
    }
  }, [game, open]);

  const coverPreviewUrl = useMemo(() => buildPreviewUrl(generalForm.imageFile, generalForm.imageUrl), [generalForm.imageFile, generalForm.imageUrl]);
  const mainPrizePreviewUrl = useMemo(() => buildPreviewUrl(mainPrizeForm.imageFile, mainPrizeForm.imageUrl), [mainPrizeForm.imageFile, mainPrizeForm.imageUrl]);

  useEffect(() => {
    return () => {
      if (generalForm.imageFile && coverPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(coverPreviewUrl);
      if (mainPrizeForm.imageFile && mainPrizePreviewUrl.startsWith("blob:")) URL.revokeObjectURL(mainPrizePreviewUrl);
    };
  }, [coverPreviewUrl, generalForm.imageFile, mainPrizeForm.imageFile, mainPrizePreviewUrl]);

  if (!open || !game) return null;

  const merchantName = merchants.find((merchant) => merchant.id === generalForm.merchantId)?.name ?? "Marchand inconnu";
  const hasMissingImage = !generalForm.imageUrl && !generalForm.imageFile;

  const updateGeneralForm = <T extends keyof GeneralFormState>(key: T, value: GeneralFormState[T]) => {
    setGeneralForm((current) => ({ ...current, [key]: value }));
  };

  const updateMainPrizeForm = <T extends keyof MainPrizeFormState>(key: T, value: MainPrizeFormState[T]) => {
    setMainPrizeForm((current) => ({ ...current, [key]: value }));
  };

  const updateSecondaryPrize = (prizeId: string, updater: (current: SecondaryPrizeFormItem) => SecondaryPrizeFormItem) => {
    setSecondaryPrizes((current) => current.map((prize) => (prize.id === prizeId ? updater(prize) : prize)));
  };

  const applyFile = (file: File | null, onValidFile: (nextFile: File | null) => void) => {
    if (!file) {
      onValidFile(null);
      return;
    }

    const error = getFileError(file);
    if (error) {
      setValidationError(error);
      return;
    }

    setValidationError(null);
    onValidFile(file);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!generalForm.title.trim()) {
      setValidationError("Le titre du jeu est obligatoire.");
      return;
    }

    if (generalForm.startDate && generalForm.endDate && generalForm.endDate < generalForm.startDate) {
      setValidationError("La date de fin doit etre posterieure a la date de debut.");
      return;
    }

    if (mainPrizeForm.hasMainPrize) {
      if (mainPrizeForm.value.trim()) {
        const normalizedValue = Number.parseFloat(mainPrizeForm.value.replace(",", "."));
        if (!Number.isFinite(normalizedValue) || normalizedValue < 0) {
          setValidationError("La valeur du lot principal doit etre un nombre valide.");
          return;
        }
      }
    }

    for (const prize of secondaryPrizes) {
      if (isSecondaryPrizeEmpty(prize)) continue;
      const parsedCount = parsePrizeCount(prize.count);
      if (!prize.name.trim()) {
        setValidationError("Chaque lot secondaire renseigne doit avoir un nom.");
        return;
      }
      if (parsedCount === null || parsedCount < 0) {
        setValidationError("Chaque lot secondaire doit avoir une quantite valide.");
        return;
      }
    }

    setValidationError(null);

    const filteredSecondaryPrizes = secondaryPrizes.filter((prize) => !isSecondaryPrizeEmpty(prize));

    await onSave({
      title: generalForm.title.trim(),
      description: generalForm.description.trim(),
      merchantId: generalForm.merchantId || null,
      merchantName,
      startDate: normalizeDate(generalForm.startDate),
      endDate: normalizeDate(generalForm.endDate),
      status: generalForm.status,
      imageUrl: generalForm.imageUrl.trim() || null,
      imageFile: generalForm.imageFile,
      hasMainPrize: mainPrizeForm.hasMainPrize,
      mainPrizeTitle: mainPrizeForm.title.trim(),
      mainPrizeDescription: mainPrizeForm.description.trim(),
      mainPrizeValue: mainPrizeForm.value.trim(),
      mainPrizeImage: mainPrizeForm.imageUrl.trim() || null,
      mainPrizeImageFile: mainPrizeForm.imageFile,
      secondaryPrizes: filteredSecondaryPrizes.map((prize) => ({
        id: prize.id,
        name: prize.name.trim(),
        description: prize.description.trim(),
        count: prize.count.trim(),
        image: prize.image?.trim() || null,
      })),
      restrictedToAdults: generalForm.restrictedToAdults,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-[rgba(247,247,245,0.92)] p-4" role="presentation" onClick={onClose}>
      <div
        className="mx-auto flex w-full max-w-[860px] flex-col overflow-hidden rounded-[12px] border border-[#E8E8E4] bg-white shadow-[0_20px_60px_rgba(26,26,26,0.08)]"
        style={{ height: "90vh", marginTop: "4vh" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-edit-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#F0F0EC] px-5 py-4">
          <div>
            <h2 id="game-edit-modal-title" className="text-[18px] font-medium text-[#1A1A1A]">Modifier le jeu</h2>
            <p className="mt-1 text-[12px] text-[#666666]">Separe les informations du jeu, le lot principal et les lots secondaires.</p>
            {game && (
              <a
                href={`/admin/winners?gameId=${game.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-[#639922] hover:underline"
              >
                Voir les gagnants →
              </a>
            )}
          </div>
          <button type="button" className="text-[22px] leading-none text-[#999999]" onClick={onClose} aria-label="Fermer">x</button>
        </div>

        <form id="game-edit-form" className="flex-1 overflow-y-auto px-5 py-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4">
            {hasMissingImage ? (
              <div className="rounded-[8px] border border-[#F09595] bg-[#FCEBEB] px-3 py-3 text-[12px] text-[#A32D2D]">
                <strong>Image manquante</strong>
                <p className="mt-1">Ce jeu ne s affiche pas correctement sans image.</p>
              </div>
            ) : null}

            {/* ── Section : Informations du jeu ── */}
            <section className={sectionClassName}>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[15px] font-medium text-[#1A1A1A]">Informations du jeu</h3>
                  <p className="mt-1 text-[12px] text-[#666666]">Champs generaux du document, inchanges dans leur logique actuelle.</p>
                </div>
                <span className="rounded-full bg-[#F7F7F5] px-2 py-1 text-[10px] font-medium text-[#666666]">Bloc principal</span>
              </div>

              <div className="flex flex-col gap-4">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-[var(--color-text-secondary,#7b7b7b)]">Titre</span>
                  <input className={inputClassName} type="text" value={generalForm.title} onChange={(event) => updateGeneralForm("title", event.target.value)} required />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-[var(--color-text-secondary,#7b7b7b)]">Description generale</span>
                  <textarea className={`${inputClassName} min-h-20 resize-none`} value={generalForm.description} onChange={(event) => updateGeneralForm("description", event.target.value)} />
                </label>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-[var(--color-text-secondary,#7b7b7b)]">Marchand</span>
                    <select className={inputClassName} value={generalForm.merchantId} onChange={(event) => updateGeneralForm("merchantId", event.target.value)}>
                      <option value="">Aucun marchand</option>
                      {merchants.map((merchant) => (
                        <option key={merchant.id} value={merchant.id}>{merchant.name}</option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-[var(--color-text-secondary,#7b7b7b)]">Statut</span>
                    <select className={inputClassName} value={generalForm.status} onChange={(event) => updateGeneralForm("status", event.target.value as GameStatus)}>
                      <option value="actif">Actif</option>
                      <option value="brouillon">Brouillon</option>
                      <option value="prive">Prive</option>
                      <option value="expire">Expire</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-[var(--color-text-secondary,#7b7b7b)]">Date debut</span>
                    <input className={inputClassName} type="date" value={generalForm.startDate} onChange={(event) => updateGeneralForm("startDate", event.target.value)} />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-[var(--color-text-secondary,#7b7b7b)]">Date fin</span>
                    <input className={inputClassName} type="date" value={generalForm.endDate} onChange={(event) => updateGeneralForm("endDate", event.target.value)} />
                  </label>
                </div>

                <ImageInputCard
                  label="Image du jeu"
                  previewUrl={coverPreviewUrl}
                  emptyLabel="Glisser une image ou cliquer"
                  emptyHint="JPG/PNG/WEBP, max 2 Mo"
                  onFileSelect={(file) => applyFile(file, (nextFile) => updateGeneralForm("imageFile", nextFile))}
                  disabled={saving}
                />

                {/* Toggle : Interdire aux mineurs */}
                <label className="flex items-center justify-between gap-3 rounded-[8px] border border-[#E8E8E4] bg-[#F7F7F5] px-3 py-3">
                  <div>
                    <span className="text-[13px] font-medium text-[#1A1A1A]">Interdire aux mineurs</span>
                    <p className="mt-0.5 text-[11px] text-[#666666]">Le jeu sera reserve aux joueurs majeurs.</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={generalForm.restrictedToAdults}
                    className={`relative h-[24px] w-[42px] flex-shrink-0 rounded-full transition ${
                      generalForm.restrictedToAdults ? "bg-[#639922]" : "bg-[#D7D7D1]"
                    }`}
                    onClick={() => updateGeneralForm("restrictedToAdults", !generalForm.restrictedToAdults)}
                    disabled={saving}
                  >
                    <span
                      className={`absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all ${
                        generalForm.restrictedToAdults ? "left-[21px]" : "left-[3px]"
                      }`}
                    />
                  </button>
                </label>
              </div>
            </section>

            {/* ── Section : Lot principal ── */}
            <section className={sectionClassName}>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[15px] font-medium text-[#1A1A1A]">Lot principal</h3>
                  <p className="mt-1 text-[12px] text-[#666666]">Bloc dedie et compatible avec les jeux qui n ont pas encore ce contenu.</p>
                </div>
                <span className="rounded-full bg-[#EAF3DE] px-2 py-1 text-[10px] font-medium text-[#3B6D11]">Champs dedies</span>
              </div>

              <div className="flex flex-col gap-4">
                <label className="flex items-center gap-3 rounded-[8px] border border-[#E8E8E4] bg-[#F7F7F5] px-3 py-3">
                  <input type="checkbox" checked={mainPrizeForm.hasMainPrize} onChange={(event) => updateMainPrizeForm("hasMainPrize", event.target.checked)} />
                  <span className="text-[13px] font-medium text-[#1A1A1A]">Ce jeu comporte un lot principal</span>
                </label>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-[var(--color-text-secondary,#7b7b7b)]">Valeur du lot principal (€)</span>
                    <input className={inputClassName} type="number" min="0" step="0.01" value={mainPrizeForm.value} onChange={(event) => updateMainPrizeForm("value", event.target.value)} disabled={!mainPrizeForm.hasMainPrize} />
                  </label>
                </div>

              </div>
            </section>

            {/* ── Section : Lots secondaires ── */}
            <section className={sectionClassName}>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[15px] font-medium text-[#1A1A1A]">Lots secondaires</h3>
                  <p className="mt-1 text-[12px] text-[#666666]">Liste dynamique pour modifier, ajouter ou supprimer chaque lot individuellement.</p>
                </div>
                <button
                  type="button"
                  className="rounded-[8px] border border-[#639922] bg-[#639922] px-3 py-2 text-[11px] font-medium text-white"
                  onClick={() => setSecondaryPrizes((current) => [...current, createEmptySecondaryPrize()])}
                  disabled={saving}
                >
                  Ajouter un lot secondaire
                </button>
              </div>

              <div className="flex flex-col gap-3">
                {secondaryPrizes.length === 0 ? (
                  <div className="rounded-[8px] border border-dashed border-[#E8E8E4] bg-[#F7F7F5] px-4 py-5 text-[12px] text-[#666666]">
                    Aucun lot secondaire pour le moment. Utilise le bouton ci-dessus pour en ajouter.
                  </div>
                ) : null}

                {secondaryPrizes.map((prize, index) => (
                  <article key={prize.id} className="rounded-[10px] border border-[#E8E8E4] bg-[#F7F7F5] p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <h4 className="text-[13px] font-medium text-[#1A1A1A]">Lot secondaire {index + 1}</h4>
                        <p className="mt-1 text-[11px] text-[#666666]">Titre, description et quantite.</p>
                      </div>
                      <button
                        type="button"
                        className="rounded-[8px] border border-[#F09595] bg-white px-3 py-2 text-[11px] font-medium text-[#A32D2D]"
                        onClick={() => setSecondaryPrizes((current) => current.filter((item) => item.id !== prize.id))}
                        disabled={saving}
                      >
                        Supprimer
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-[11px] font-medium text-[var(--color-text-secondary,#7b7b7b)]">Titre du lot</span>
                        <input className={inputClassName} type="text" value={prize.name} onChange={(event) => updateSecondaryPrize(prize.id, (current) => ({ ...current, name: event.target.value }))} />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[11px] font-medium text-[var(--color-text-secondary,#7b7b7b)]">Nombre de lots</span>
                        <input className={inputClassName} type="number" min="0" step="1" value={prize.count} onChange={(event) => updateSecondaryPrize(prize.id, (current) => ({ ...current, count: event.target.value }))} />
                      </label>
                      <label className="flex flex-col gap-1 sm:col-span-2">
                        <span className="text-[11px] font-medium text-[var(--color-text-secondary,#7b7b7b)]">Description (facultatif)</span>
                        <textarea className={`${inputClassName} min-h-20 resize-none`} value={prize.description} onChange={(event) => updateSecondaryPrize(prize.id, (current) => ({ ...current, description: event.target.value }))} />
                      </label>
                    </div>
                    {/* Pas d'image pour les lots secondaires — cohérence avec l'app Flutter */}
                  </article>
                ))}
              </div>
            </section>

            {validationError ? (
              <div className="rounded-[8px] border border-[#F09595] bg-[#FCEBEB] px-3 py-3 text-[12px] text-[#A32D2D]">{validationError}</div>
            ) : null}

            {feedback && feedbackTone ? (
              <div className={`rounded-[8px] px-3 py-3 text-[12px] ${feedbackTone === "success" ? "border border-[#B9D98E] bg-[#F2F8E8] text-[#3B6D11]" : "border border-[#F09595] bg-[#FCEBEB] text-[#A32D2D]"}`}>
                {feedback}
              </div>
            ) : null}
          </div>
        </form>

        <div className="shrink-0 border-t border-[#F0F0EC] bg-white px-5 py-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              {onDelete && !deleteConfirm && (
                <button
                  type="button"
                  className="rounded-[8px] border border-[#F09595] bg-white px-4 py-[10px] text-[12px] font-medium text-[#A32D2D] transition hover:bg-[#FCEBEB]"
                  onClick={() => setDeleteConfirm(true)}
                  disabled={saving}
                >
                  Supprimer
                </button>
              )}
              {onDelete && deleteConfirm && (
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-[#A32D2D]">Confirmer la suppression ?</span>
                  <button
                    type="button"
                    className="rounded-[8px] border border-[#E24B4A] bg-[#E24B4A] px-3 py-[8px] text-[12px] font-medium text-white"
                    onClick={() => {
                      void onDelete(game);
                      setDeleteConfirm(false);
                    }}
                    disabled={saving}
                  >
                    Oui, supprimer
                  </button>
                  <button
                    type="button"
                    className="rounded-[8px] border border-[#E8E8E4] bg-white px-3 py-[8px] text-[12px] text-[#666666]"
                    onClick={() => setDeleteConfirm(false)}
                  >
                    Annuler
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="rounded-[8px] border border-[#E8E8E4] bg-white px-4 py-[10px] text-[12px] font-medium text-[#1A1A1A]" onClick={onClose} disabled={saving}>
                Annuler
              </button>
              <button type="submit" form="game-edit-form" className="rounded-[8px] border border-[#639922] bg-[#639922] px-4 py-[10px] text-[12px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-70" disabled={saving}>
                {saving ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
