"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Timestamp } from "firebase/firestore";
import { collection, onSnapshot } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "@/lib/firebase/client-app";
import { auth } from "@/lib/firebase/auth";

type ReferralGameStatus = "draft" | "active" | "ended";

type ReferralGame = {
  id: string;
  title: string;
  description: string;
  prizeDescription: string;
  imageUrl: string;
  status: ReferralGameStatus;
  startDate: string | null;
  endDate: string | null;
  ticketCount: number;
  winnerTicketCount: number | null;
  totalTicketCount: number | null;
  winnerUid: string | null;
};

function readTimestamp(value: unknown): Timestamp | null {
  return value instanceof Timestamp ? value : null;
}

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapReferralGame(id: string, data: Record<string, unknown>): ReferralGame {
  return {
    id,
    title: readText(data.title) || "Sans titre",
    description: readText(data.description),
    prizeDescription: readText(data.prize_description),
    imageUrl: readText(data.image_url),
    status: (["draft", "active", "ended"] as const).includes(data.status as ReferralGameStatus)
      ? (data.status as ReferralGameStatus)
      : "draft",
    startDate: readTimestamp(data.start_date)?.toDate().toISOString() ?? null,
    endDate: readTimestamp(data.end_date)?.toDate().toISOString() ?? null,
    ticketCount: readNumber(data.ticket_count),
    winnerTicketCount: data.winner_ticket_count != null ? readNumber(data.winner_ticket_count) : null,
    totalTicketCount: data.total_ticket_count != null ? readNumber(data.total_ticket_count) : null,
    winnerUid: readText(data.winner_uid) || null,
  };
}

function formatDisplayDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("fr-FR");
}

function parseDateInputToTimestampPayload(value: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return { seconds: Math.floor(date.getTime() / 1000), nanoseconds: 0 };
}

async function getAuthToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("Connexion admin requise.");
  return user.getIdToken();
}

async function adminFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAuthToken();
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${token}`,
    },
  });
}

const statusLabels: Record<ReferralGameStatus, string> = {
  draft: "Brouillon",
  active: "Actif",
  ended: "Terminé",
};

const statusStyles: Record<ReferralGameStatus, string> = {
  draft: "bg-[#F0F0EC] text-[#999]",
  active: "bg-[#EAF3DE] text-[#3B6D11]",
  ended: "bg-[#EFE7FB] text-[#7C5CBF]",
};

const emptyForm = {
  title: "",
  description: "",
  prizeDescription: "",
  startDate: "",
  endDate: "",
};

function StatusBadge({ status }: { status: ReferralGameStatus }) {
  return (
    <span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-[11px] font-medium ${statusStyles[status]}`}>
      {statusLabels[status]}
    </span>
  );
}

export default function AdminReferralGamePage() {
  const [games, setGames] = useState<ReferralGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formState, setFormState] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [uploadingGameId, setUploadingGameId] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    // No orderBy here on purpose: Firestore silently drops any document
    // missing the sorted field from the query results, which can make a
    // game invisible (and thus undeletable from this screen) if its
    // start_date ever ends up null/malformed. Sorting client-side instead
    // guarantees every document in the collection is always shown.
    const referralGamesQuery = collection(db, "referral_games");
    const unsubscribe = onSnapshot(
      referralGamesQuery,
      (snapshot) => {
        const nextGames = snapshot.docs.map((doc) => mapReferralGame(doc.id, doc.data()));
        nextGames.sort((a, b) => {
          const aTime = a.startDate ? new Date(a.startDate).getTime() : 0;
          const bTime = b.startDate ? new Date(b.startDate).getTime() : 0;
          return bTime - aTime;
        });
        setGames(nextGames);
        setLoading(false);
        setError(null);
      },
      (snapshotError) => {
        console.error(snapshotError);
        setError("Impossible de charger les jeux de parrainage.");
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, []);

  const hasActiveGame = useMemo(() => games.some((game) => game.status === "active"), [games]);

  const handleCreate = async () => {
    setSubmitting(true);
    setFeedback(null);
    setActionError(null);

    try {
      if (!formState.title.trim()) {
        throw new Error("Le titre est obligatoire.");
      }
      const startPayload = parseDateInputToTimestampPayload(formState.startDate);
      const endPayload = parseDateInputToTimestampPayload(formState.endDate);
      if (!startPayload || !endPayload) {
        throw new Error("Les dates de début et de fin sont obligatoires.");
      }

      const response = await adminFetch("/api/admin/referral-games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formState.title.trim(),
          description: formState.description.trim(),
          prize_description: formState.prizeDescription.trim(),
          start_date: startPayload,
          end_date: endPayload,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error?.trim() || "Impossible de créer le jeu de parrainage.");
      }

      setFormState(emptyForm);
      setFeedback("Jeu de parrainage créé en brouillon.");
    } catch (createError) {
      setActionError(
        createError instanceof Error ? createError.message : "Impossible de créer le jeu de parrainage.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleActivate = async (game: ReferralGame) => {
    setActionError(null);
    try {
      const response = await adminFetch(`/api/admin/referral-games/${game.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error?.trim() || "Impossible d'activer ce jeu.");
      }
    } catch (activateError) {
      setActionError(
        activateError instanceof Error ? activateError.message : "Impossible d'activer ce jeu.",
      );
    }
  };

  const handleEnd = async (game: ReferralGame) => {
    if (!window.confirm(`Terminer le jeu de parrainage "${game.title}" ?`)) return;
    setActionError(null);
    try {
      const response = await adminFetch(`/api/admin/referral-games/${game.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ended" }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error?.trim() || "Impossible de terminer ce jeu.");
      }
    } catch (endError) {
      setActionError(endError instanceof Error ? endError.message : "Impossible de terminer ce jeu.");
    }
  };

  const handleImageSelected = async (game: ReferralGame, file: File | undefined) => {
    if (!file) return;
    const inputEl = fileInputRefs.current[game.id];

    if (!file.type.startsWith("image/")) {
      setActionError("Le fichier sélectionné doit être une image valide.");
      if (inputEl) inputEl.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setActionError("L'image dépasse 5 Mo. Choisis un fichier plus léger.");
      if (inputEl) inputEl.value = "";
      return;
    }

    setActionError(null);
    setUploadingGameId(game.id);
    try {
      const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storageRef = ref(storage, `referral_games/${game.id}/${Date.now()}-${sanitizedFileName}`);
      await uploadBytes(storageRef, file, { contentType: file.type });
      const downloadUrl = await getDownloadURL(storageRef);

      const response = await adminFetch(`/api/admin/referral-games/${game.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: downloadUrl }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error?.trim() || "Impossible d'enregistrer l'image.");
      }
    } catch (uploadError) {
      setActionError(uploadError instanceof Error ? uploadError.message : "Impossible d'envoyer l'image.");
    } finally {
      setUploadingGameId(null);
      if (inputEl) inputEl.value = "";
    }
  };

  const handleDelete = async (game: ReferralGame) => {
    if (!window.confirm(`Supprimer le jeu de parrainage "${game.title}" ?`)) return;
    setActionError(null);
    try {
      const response = await adminFetch(`/api/admin/referral-games/${game.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error?.trim() || "Impossible de supprimer ce jeu.");
      }
    } catch (deleteError) {
      setActionError(
        deleteError instanceof Error ? deleteError.message : "Impossible de supprimer ce jeu.",
      );
    }
  };

  return (
    <section className="min-h-full bg-[#F7F7F5]">
      <div className="mx-auto grid max-w-[1440px] gap-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-[22px] font-medium tracking-[-0.02em] text-[#1a1a1a]">Jeu de parrainage</h1>
            <p className="mt-1 text-[14px] text-[#666]">
              Un ticket est créé automatiquement pour chaque parrainage validé (le filleul crée son compte)
              tant qu&apos;un jeu est actif — sans plafond. Le tirage au sort se fait automatiquement à la
              date de fin. Un seul jeu actif à la fois.
            </p>
          </div>
          <Link
            href="/admin/parrainage"
            className="inline-flex items-center justify-center rounded-[10px] border border-[#E8E8E4] bg-white px-5 py-3 text-[14px] font-medium text-[#666] hover:bg-[#F7F7F5]"
          >
            ← Retour au suivi parrainage
          </Link>
        </div>

        {/* Create form */}
        <form
          className="rounded-[12px] border border-[#E8E8E4] bg-white p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void handleCreate();
          }}
        >
          <div className="mb-4">
            <h2 className="text-[16px] font-medium text-[#1a1a1a]">Nouveau jeu (brouillon)</h2>
            {hasActiveGame ? (
              <p className="mt-1 text-[13px] text-[#EF9F27]">
                Un jeu est déjà actif — le nouveau jeu restera en brouillon jusqu&apos;à ce que vous
                terminiez le jeu actif.
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-[#666]">Titre</span>
              <input
                className="rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[14px] text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#639922]"
                type="text"
                value={formState.title}
                onChange={(event) => setFormState((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Grand tirage parrainage été 2026"
              />
            </label>

            <div className="hidden sm:block" />

            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-[12px] font-medium text-[#666]">Description (affichée au joueur)</span>
              <textarea
                className="resize-y rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[14px] text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#639922]"
                value={formState.description}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, description: event.target.value }))
                }
                rows={3}
              />
            </label>

            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-[12px] font-medium text-[#666]">Lot à gagner</span>
              <input
                className="rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[14px] text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#639922]"
                type="text"
                value={formState.prizeDescription}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, prizeDescription: event.target.value }))
                }
                placeholder="Un week-end pour deux"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-[#666]">Début</span>
              <input
                className="rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[14px] text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#639922]"
                type="date"
                value={formState.startDate}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, startDate: event.target.value }))
                }
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-[#666]">Fin (tirage au sort à cette date)</span>
              <input
                className="rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[14px] text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#639922]"
                type="date"
                value={formState.endDate}
                onChange={(event) => setFormState((prev) => ({ ...prev, endDate: event.target.value }))}
              />
            </label>
          </div>

          {actionError ? <p className="mt-4 text-[13px] text-[#E24B4A]">{actionError}</p> : null}
          {feedback ? <p className="mt-4 text-[13px] text-[#3B6D11]">{feedback}</p> : null}

          <div className="mt-5">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center rounded-[10px] bg-[#639922] px-5 py-3 text-[14px] font-medium text-white hover:bg-[#5a8b1f] disabled:opacity-50"
            >
              {submitting ? "Création…" : "Créer en brouillon"}
            </button>
          </div>
        </form>

        {/* Games list */}
        {loading ? (
          <div className="rounded-[12px] border border-[#E8E8E4] bg-white px-5 py-8 text-center text-[#666]">
            <div className="loader" aria-hidden="true" />
            <p className="mt-3">Chargement des jeux de parrainage…</p>
          </div>
        ) : null}
        {error ? <p className="feedback error">{error}</p> : null}

        {!loading && !error ? (
          <div className="overflow-x-auto rounded-[12px] border border-[#E8E8E4] bg-white">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[#E8E8E4] text-left text-[11px] uppercase tracking-[0.06em] text-[#999]">
                  <th className="px-4 py-3 font-medium">Titre</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 font-medium">Période</th>
                  <th className="px-4 py-3 font-medium">Tickets</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {games.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-[#999]">
                      Aucun jeu de parrainage pour le moment.
                    </td>
                  </tr>
                ) : null}

                {games.map((game) => (
                  <tr key={game.id} className="border-b border-[#F0F0EC] last:border-b-0 hover:bg-[#FCFCFB]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {game.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={game.imageUrl}
                            alt=""
                            className="h-10 w-10 flex-none rounded-[8px] object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-[8px] border border-dashed border-[#E0E0DA] text-[10px] text-[#999]">
                            Pas d&apos;image
                          </div>
                        )}
                        <div>
                          <span className="block font-medium text-[#1a1a1a]">{game.title}</span>
                          <span className="block text-[11px] text-[#999]">
                            {game.prizeDescription || "Lot non renseigné"}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={game.status} />
                    </td>
                    <td className="px-4 py-3 text-[#666]">
                      {formatDisplayDate(game.startDate)} → {formatDisplayDate(game.endDate)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="block font-medium text-[#1a1a1a]">{game.ticketCount}</span>
                      {game.status === "ended" && game.winnerUid ? (
                        <span className="block text-[11px] text-[#999]">
                          Gagnant : {game.winnerTicketCount ?? "?"}/{game.totalTicketCount ?? "?"} tickets
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <input
                          ref={(el) => {
                            fileInputRefs.current[game.id] = el;
                          }}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(event) => void handleImageSelected(game, event.target.files?.[0])}
                        />
                        <button
                          type="button"
                          disabled={uploadingGameId === game.id}
                          onClick={() => fileInputRefs.current[game.id]?.click()}
                          className="inline-flex items-center rounded-[7px] border border-[#E0E0DA] bg-white px-3 py-1.5 text-[12px] font-medium text-[#666] transition hover:bg-[#F7F7F5] disabled:opacity-60"
                        >
                          {uploadingGameId === game.id ? "Envoi…" : game.imageUrl ? "Changer l'image" : "Ajouter une image"}
                        </button>
                        {game.status === "draft" ? (
                          <button
                            type="button"
                            onClick={() => void handleActivate(game)}
                            className="inline-flex items-center rounded-[7px] border border-[#639922] bg-[#EAF3DE] px-3 py-1.5 text-[12px] font-medium text-[#3B6D11] transition hover:bg-[#D6ECC0]"
                          >
                            Activer
                          </button>
                        ) : null}
                        {game.status === "active" ? (
                          <button
                            type="button"
                            onClick={() => void handleEnd(game)}
                            className="inline-flex items-center rounded-[7px] border border-[#E0C87A] bg-[#FBF3DD] px-3 py-1.5 text-[12px] font-medium text-[#8A6A10] transition hover:bg-[#F5E8C4]"
                          >
                            Terminer
                          </button>
                        ) : null}
                        {game.status !== "active" ? (
                          <button
                            type="button"
                            onClick={() => void handleDelete(game)}
                            className="inline-flex items-center rounded-[7px] border border-[#E0E0DA] bg-white px-3 py-1.5 text-[12px] font-medium text-[#666] transition hover:bg-[#F7F7F5]"
                          >
                            Supprimer
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}
