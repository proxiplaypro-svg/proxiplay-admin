"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  createGame,
  getGameMerchantOptions,
  getGamesQueryErrorMessage,
  updateGameStatus,
} from "@/lib/firebase/gamesQueries";
import type { GameMerchantOption } from "@/types/dashboard";

type GameCollectionName = "games" | "jeux";
type MerchantCollectionName = "enseignes" | "merchants";

type FormState = {
  merchantId: string;
  title: string;
  description: string;
  prizeValue: string;
  startDate: string;
  endDate: string;
  restrictedToAdults: boolean;
};

const emptyForm: FormState = {
  merchantId: "",
  title: "",
  description: "",
  prizeValue: "",
  startDate: "",
  endDate: "",
  restrictedToAdults: false,
};

type SecondaryPrizeFormItem = {
  id: string;
  name: string;
  description: string;
  count: string;
};

function createSecondaryPrizeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `secondary-prize-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createEmptySecondaryPrize(): SecondaryPrizeFormItem {
  return { id: createSecondaryPrizeId(), name: "", description: "", count: "" };
}

function isSecondaryPrizeEmpty(prize: SecondaryPrizeFormItem) {
  return !prize.name.trim() && !prize.description.trim() && !prize.count.trim();
}

function validateImageFile(file: File): string | null {
  if (!file.type.startsWith("image/")) {
    return "Le fichier selectionne doit etre une image valide.";
  }
  if (file.size > 2 * 1024 * 1024) {
    return "L'image depasse 2 Mo. Choisis un fichier plus leger.";
  }
  return null;
}

export default function NewGamePage() {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [merchants, setMerchants] = useState<GameMerchantOption[]>([]);
  const [gameCollection, setGameCollection] = useState<GameCollectionName>("games");
  const [merchantCollection, setMerchantCollection] = useState<MerchantCollectionName>("enseignes");
  const [loadingMerchants, setLoadingMerchants] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdGame, setCreatedGame] = useState<{ id: string; merchantId: string } | null>(null);
  const [activating, setActivating] = useState(false);
  const [activated, setActivated] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [secondaryPrizes, setSecondaryPrizes] = useState<SecondaryPrizeFormItem[]>([]);

  const updateSecondaryPrize = (
    prizeId: string,
    updater: (current: SecondaryPrizeFormItem) => SecondaryPrizeFormItem,
  ) => {
    setSecondaryPrizes((current) =>
      current.map((prize) => (prize.id === prizeId ? updater(prize) : prize)),
    );
  };

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const result = await getGameMerchantOptions();
        if (!active) return;
        setMerchants(result.merchants);
        setGameCollection(result.gameCollection);
        setMerchantCollection(result.merchantCollection);
      } catch (loadError) {
        if (active) setError(getGamesQueryErrorMessage(loadError));
      } finally {
        if (active) setLoadingMerchants(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(imageFile);
    setImagePreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [imageFile]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const merchant = merchants.find((item) => item.id === form.merchantId);
      if (!merchant) {
        throw new Error("Choisis un commerçant.");
      }

      for (const prize of secondaryPrizes) {
        if (isSecondaryPrizeEmpty(prize)) continue;
        if (!prize.name.trim()) {
          throw new Error("Chaque lot secondaire renseigné doit avoir un nom.");
        }
        const parsedCount = prize.count.trim() ? Number.parseInt(prize.count, 10) : 0;
        if (Number.isNaN(parsedCount) || parsedCount < 0) {
          throw new Error("Chaque lot secondaire doit avoir une quantité valide.");
        }
      }

      const result = await createGame({
        accessMode: "qr_only",
        collectionName: gameCollection,
        merchantCollectionName: merchantCollection,
        merchantId: merchant.id,
        merchantName: merchant.name,
        title: form.title,
        description: form.description,
        startDate: form.startDate,
        endDate: form.endDate,
        prizeValue: form.prizeValue,
        imageFile,
        restrictedToAdults: form.restrictedToAdults,
        secondaryPrizes: secondaryPrizes
          .filter((prize) => !isSecondaryPrizeEmpty(prize))
          .map((prize) => ({
            name: prize.name.trim(),
            description: prize.description.trim(),
            count: prize.count.trim(),
          })),
      });

      setCreatedGame({ id: result.game.id, merchantId: merchant.id });
      setActivated(false);
      setActivateError(null);
      setForm(emptyForm);
      setImageFile(null);
      setSecondaryPrizes([]);
      if (imageInputRef.current) imageInputRef.current.value = "";
    } catch (saveError) {
      setError(getGamesQueryErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async () => {
    if (!createdGame) return;
    setActivating(true);
    setActivateError(null);

    try {
      await updateGameStatus({
        gameId: createdGame.id,
        collectionName: gameCollection,
        status: "actif",
      });
      setActivated(true);
    } catch (activateGameError) {
      setActivateError(getGamesQueryErrorMessage(activateGameError));
    } finally {
      setActivating(false);
    }
  };

  return (
    <section className="min-h-full bg-[#F7F7F5]">
      <div className="mx-auto grid max-w-[900px] gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-[22px] font-medium tracking-[-0.02em] text-[#1a1a1a]">
              Nouveau jeu à scanner en boutique
            </h1>
            <p className="mt-1 text-[14px] text-[#666]">
              Le joueur doit scanner le QR code affiché en magasin pour participer — il ne peut pas
              lancer ce jeu librement depuis l&apos;app. Réservé à un seul commerçant. Le jeu est
              créé en brouillon : active-le ensuite depuis la liste des jeux.
            </p>
          </div>
          <Link
            href="/admin/games"
            className="inline-flex items-center justify-center rounded-[10px] border border-[#E8E8E4] bg-white px-5 py-3 text-[14px] font-medium text-[#666] hover:bg-[#F7F7F5]"
          >
            ← Retour aux jeux
          </Link>
        </div>

        {createdGame ? (
          <div className="rounded-[12px] border border-[#D8E8C4] bg-[#EAF3DE] p-5">
            <p className="text-[14px] font-medium text-[#3B6D11]">
              {activated ? "Jeu créé et activé." : "Jeu créé en brouillon."}
            </p>
            <p className="mt-1 text-[13px] text-[#3B6D11]">
              {activated
                ? "Il est maintenant visible dans l'app."
                : "Active-le pour le rendre visible dans l'app, ou fais-le depuis la liste des jeux."}
            </p>
            {activateError ? (
              <p className="mt-2 text-[13px] text-[#E24B4A]">{activateError}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-3">
              {activated ? null : (
                <button
                  type="button"
                  onClick={() => void handleActivate()}
                  disabled={activating}
                  className="inline-flex items-center justify-center rounded-[10px] bg-[#639922] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#5a8b1f] disabled:opacity-50"
                >
                  {activating ? "Activation…" : "Activer maintenant"}
                </button>
              )}
              <Link
                href={`/admin/games?merchantId=${createdGame.merchantId}`}
                className="inline-flex items-center justify-center rounded-[10px] border border-[#E0E0DA] bg-white px-4 py-2 text-[13px] font-medium text-[#1A1A1A] hover:bg-[#FAFAF8]"
              >
                Voir dans Jeux & campagnes
              </Link>
              <button
                type="button"
                onClick={() => setCreatedGame(null)}
                className="inline-flex items-center justify-center rounded-[10px] border border-[#E8E8E4] bg-white px-4 py-2 text-[13px] font-medium text-[#666] hover:bg-[#F7F7F5]"
              >
                Créer un autre jeu
              </button>
            </div>
          </div>
        ) : null}

        <form
          className="rounded-[12px] border border-[#E8E8E4] bg-white p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSave();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-[12px] font-medium text-[#666]">Commerçant</span>
              <select
                className="rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[14px] text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#639922]"
                value={form.merchantId}
                onChange={(event) => setForm((prev) => ({ ...prev, merchantId: event.target.value }))}
                disabled={loadingMerchants}
                required
              >
                <option value="">
                  {loadingMerchants ? "Chargement..." : "Choisir un commerçant"}
                </option>
                {merchants.map((merchant) => (
                  <option key={merchant.id} value={merchant.id}>
                    {merchant.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-[12px] font-medium text-[#666]">Titre du jeu</span>
              <input
                className="rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[14px] text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#639922]"
                type="text"
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Cadeau à scanner en boutique"
                required
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-[#666]">Date de début</span>
              <input
                className="rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[14px] text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#639922]"
                type="date"
                value={form.startDate}
                onChange={(event) => setForm((prev) => ({ ...prev, startDate: event.target.value }))}
                required
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-[#666]">Date de fin</span>
              <input
                className="rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[14px] text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#639922]"
                type="date"
                value={form.endDate}
                onChange={(event) => setForm((prev) => ({ ...prev, endDate: event.target.value }))}
                required
              />
            </label>

            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-[12px] font-medium text-[#666]">Lot à gagner</span>
              <textarea
                className="resize-y rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[14px] text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#639922]"
                value={form.description}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                rows={3}
                placeholder="Un café offert, une réduction de 10%..."
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-[#666]">Valeur du lot (€, facultatif)</span>
              <input
                className="rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[14px] text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#639922]"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.prizeValue}
                onChange={(event) => setForm((prev) => ({ ...prev, prizeValue: event.target.value }))}
                placeholder="5"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="mt-6 flex items-center gap-2 text-[13px] font-medium text-[#666]">
                <input
                  type="checkbox"
                  checked={form.restrictedToAdults}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, restrictedToAdults: event.target.checked }))
                  }
                  className="h-4 w-4 rounded border-[#E0E0DA]"
                />
                Interdit aux mineurs
              </span>
            </label>

            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-[12px] font-medium text-[#666]">Image (affichée au joueur)</span>
              <div className="flex items-center gap-3">
                {imagePreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imagePreviewUrl}
                    alt=""
                    className="h-12 w-12 flex-none rounded-[8px] object-cover"
                  />
                ) : null}
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) {
                      setImageFile(null);
                      return;
                    }
                    const validationError = validateImageFile(file);
                    if (validationError) {
                      setError(validationError);
                      event.target.value = "";
                      setImageFile(null);
                      return;
                    }
                    setError(null);
                    setImageFile(file);
                  }}
                  className="text-[13px] text-[#666] file:mr-3 file:rounded-[8px] file:border file:border-[#E0E0DA] file:bg-white file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-[#666] hover:file:bg-[#F7F7F5]"
                />
              </div>
            </label>
          </div>

          <div className="mt-5 rounded-[10px] border border-[#E8E8E4] bg-[#FAFAF8] p-4">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-[#666]">Lots secondaires (facultatif)</span>
              <button
                type="button"
                onClick={() => setSecondaryPrizes((current) => [...current, createEmptySecondaryPrize()])}
                className="rounded-[8px] border border-[#E0E0DA] bg-white px-3 py-1.5 text-[12px] font-medium text-[#1A1A1A] hover:bg-[#F7F7F5]"
              >
                + Ajouter un lot secondaire
              </button>
            </div>

            {secondaryPrizes.length > 0 ? (
              <div className="mt-3 flex flex-col gap-3">
                {secondaryPrizes.map((prize, index) => (
                  <div key={prize.id} className="rounded-[8px] border border-[#E8E8E4] bg-white p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-[#999]">Lot {index + 1}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setSecondaryPrizes((current) => current.filter((item) => item.id !== prize.id))
                        }
                        className="text-[11px] font-medium text-[#E24B4A] hover:underline"
                      >
                        Retirer
                      </button>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-[2fr_1fr]">
                      <input
                        className="rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[13px] text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#639922]"
                        type="text"
                        placeholder="Nom du lot"
                        value={prize.name}
                        onChange={(event) =>
                          updateSecondaryPrize(prize.id, (current) => ({ ...current, name: event.target.value }))
                        }
                      />
                      <input
                        className="rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[13px] text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#639922]"
                        type="number"
                        min="0"
                        step="1"
                        placeholder="Quantité"
                        value={prize.count}
                        onChange={(event) =>
                          updateSecondaryPrize(prize.id, (current) => ({ ...current, count: event.target.value }))
                        }
                      />
                    </div>
                    <textarea
                      className="mt-2 w-full resize-y rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[13px] text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#639922]"
                      rows={2}
                      placeholder="Description (facultatif)"
                      value={prize.description}
                      onChange={(event) =>
                        updateSecondaryPrize(prize.id, (current) => ({ ...current, description: event.target.value }))
                      }
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {error ? <p className="mt-4 text-[13px] text-[#E24B4A]">{error}</p> : null}

          <div className="mt-5 flex items-center gap-3">
            <button
              type="submit"
              disabled={saving || loadingMerchants}
              className="inline-flex items-center justify-center rounded-[10px] bg-[#639922] px-5 py-3 text-[14px] font-medium text-white hover:bg-[#5a8b1f] disabled:opacity-50"
            >
              {saving ? "Création…" : "Créer le jeu"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
