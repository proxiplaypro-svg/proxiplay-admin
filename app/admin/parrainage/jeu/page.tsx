"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { DocumentReference, Timestamp } from "firebase/firestore";
import { collection, documentId, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, firebaseApp, storage } from "@/lib/firebase/client-app";
import { auth } from "@/lib/firebase/auth";

type ReferralGameStatus = "draft" | "active" | "ended";
const referralFunctions = getFunctions(firebaseApp, "us-central1");
const drawReferralGame = httpsCallable<{ gameId: string }, { status: string }>(referralFunctions, "adminDrawReferralGameWinner");
const repairReferralGameDraw = httpsCallable<{ gameId: string }, { status: string }>(referralFunctions, "adminRepairReferralGameDraw");
const reconcileReferralGameTickets = httpsCallable<{ gameId: string }, { created: number; already_exists: number; ineligible: number }>(referralFunctions, "adminReconcileReferralGameTickets");

type ReferralGame = {
  id: string;
  title: string;
  description: string;
  prizeDescription: string;
  prizeValue: number;
  imageUrl: string;
  status: ReferralGameStatus;
  startDate: string | null;
  endDate: string | null;
  ticketCount: number;
  winnerTicketCount: number | null;
  totalTicketCount: number | null;
  winnerUid: string | null;
  enseigneId: string | null;
};

type Merchant = { id: string; name: string };

type ReferralParticipant = {
  userId: string;
  label: string;
  email: string;
  tickets: number;
  referrals: number;
  eligibility: string;
  winner: boolean;
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
    prizeValue: readNumber(data.prize_value),
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
    enseigneId: data.enseigne_id instanceof DocumentReference ? data.enseigne_id.id : null,
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
  prizeValue: "",
  startDate: "",
  endDate: "",
  enseigneId: "",
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
  const [editingGame, setEditingGame] = useState<ReferralGame | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [uploadingGameId, setUploadingGameId] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [createImageFile, setCreateImageFile] = useState<File | null>(null);
  const createImageInputRef = useRef<HTMLInputElement | null>(null);
  const [createImagePreviewUrl, setCreateImagePreviewUrl] = useState<string | null>(null);
  const [selectedGame, setSelectedGame] = useState<ReferralGame | null>(null);
  const [participants, setParticipants] = useState<ReferralParticipant[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [merchants, setMerchants] = useState<Merchant[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const snapshot = await getDocs(collection(db, "enseignes"));
        setMerchants(
          snapshot.docs
            .map((document) => ({
              id: document.id,
              name: readText(document.data().name) || document.id,
            }))
            .sort((left, right) => left.name.localeCompare(right.name, "fr")),
        );
      } catch (loadError) {
        console.error("[REFERRAL_GAME_MERCHANTS_LOAD]", loadError);
      }
    })();
  }, []);

  useEffect(() => {
    if (!createImageFile) {
      setCreateImagePreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(createImageFile);
    setCreateImagePreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [createImageFile]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedGame) {
      setParticipants([]);
      return;
    }
    void (async () => {
      setParticipantsLoading(true);
      try {
        const entries = await getDocs(collection(db, "referral_games", selectedGame.id, "entries"));
        const grouped = new Map<string, { tickets: number; referrals: number; eligibility: string }>();
        entries.docs.forEach((entry) => {
          const data = entry.data();
          const uid = readText(data.inviter_uid);
          if (!uid) return;
          const current = grouped.get(uid) ?? { tickets: 0, referrals: 0, eligibility: "eligible" };
          current.tickets += 1;
          current.referrals += readText(data.referral_id) ? 1 : 0;
          if (readText(data.eligibility_status)) current.eligibility = readText(data.eligibility_status);
          grouped.set(uid, current);
        });
        const users = new Map<string, Record<string, unknown>>();
        const ids = [...grouped.keys()];
        for (let index = 0; index < ids.length; index += 30) {
          const userSnap = await getDocs(query(collection(db, "users"), where(documentId(), "in", ids.slice(index, index + 30))));
          userSnap.docs.forEach((user) => users.set(user.id, user.data()));
        }
        if (!cancelled) {
          setParticipants(ids.map((userId) => {
            const user = users.get(userId) ?? {};
            const name = [readText(user.first_name), readText(user.last_name)].filter(Boolean).join(" ");
            const stats = grouped.get(userId)!;
            return { userId, label: name || readText(user.pseudo) || userId, email: readText(user.email), ...stats, winner: selectedGame.winnerUid === userId };
          }).sort((left, right) => right.tickets - left.tickets || left.label.localeCompare(right.label, "fr")));
        }
      } finally {
        if (!cancelled) setParticipantsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedGame]);

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

      let prizeValue = 0;
      if (formState.prizeValue.trim()) {
        prizeValue = Number(formState.prizeValue.trim().replace(",", "."));
        if (!Number.isFinite(prizeValue) || prizeValue < 0) {
          throw new Error("La valeur du lot doit être un nombre positif.");
        }
      }

      const response = await adminFetch("/api/admin/referral-games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formState.title.trim(),
          description: formState.description.trim(),
          prize_description: formState.prizeDescription.trim(),
          prize_value: prizeValue,
          start_date: startPayload,
          end_date: endPayload,
          enseigne_id: formState.enseigneId,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error?.trim() || "Impossible de créer le jeu de parrainage.");
      }

      const { id: newGameId } = (await response.json()) as { id: string };

      let imageWarning = "";
      if (createImageFile) {
        try {
          const downloadUrl = await uploadReferralGameImage(newGameId, createImageFile);
          await adminFetch(`/api/admin/referral-games/${newGameId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image_url: downloadUrl }),
          });
        } catch (imageUploadError) {
          console.error("[REFERRAL_GAME_IMAGE_UPLOAD]", imageUploadError);
          const reason =
            imageUploadError instanceof Error ? imageUploadError.message : String(imageUploadError);
          imageWarning = ` (l'image n'a pas pu être envoyée : ${reason} — tu peux réessayer depuis la liste ci-dessous)`;
        }
      }

      setFormState(emptyForm);
      setCreateImageFile(null);
      if (createImageInputRef.current) createImageInputRef.current.value = "";
      setFeedback(`Jeu de parrainage créé en brouillon.${imageWarning}`);
    } catch (createError) {
      setActionError(
        createError instanceof Error ? createError.message : "Impossible de créer le jeu de parrainage.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingGame) return;

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
        throw new Error("Les dates de debut et de fin sont obligatoires.");
      }
      if (startPayload.seconds >= endPayload.seconds) {
        throw new Error("La date de debut doit etre avant la date de fin.");
      }

      const prizeValue = formState.prizeValue.trim();
      if (prizeValue && (!Number.isFinite(Number(prizeValue)) || Number(prizeValue) < 0)) {
        throw new Error("La valeur du lot doit etre un nombre positif.");
      }

      const response = await adminFetch(`/api/admin/referral-games/${editingGame.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formState.title.trim(),
          description: formState.description.trim(),
          prize_description: formState.prizeDescription.trim(),
          prize_value: prizeValue ? Number(prizeValue) : null,
          start_date: startPayload,
          end_date: endPayload,
          enseigne_id: formState.enseigneId,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error?.trim() || "Impossible d'enregistrer le jeu de parrainage.");
      }

      let imageWarning = "";
      if (createImageFile) {
        try {
          const downloadUrl = await uploadReferralGameImage(editingGame.id, createImageFile);
          const imageResponse = await adminFetch(`/api/admin/referral-games/${editingGame.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image_url: downloadUrl }),
          });
          if (!imageResponse.ok) throw new Error("enregistrement de l'image impossible");
        } catch (imageUploadError) {
          console.error("[REFERRAL_GAME_IMAGE_UPDATE]", imageUploadError);
          imageWarning = " L'image n'a pas pu etre mise a jour.";
        }
      }

      setFormState(emptyForm);
      setEditingGame(null);
      setCreateImageFile(null);
      if (createImageInputRef.current) createImageInputRef.current.value = "";
      setFeedback(`Jeu de parrainage mis a jour.${imageWarning}`);
    } catch (updateError) {
      setActionError(
        updateError instanceof Error ? updateError.message : "Impossible d'enregistrer le jeu de parrainage.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (game: ReferralGame) => {
    setEditingGame(game);
    setFormState({
      title: game.title,
      description: game.description,
      prizeDescription: game.prizeDescription,
      prizeValue: game.prizeValue?.toString() ?? "",
      startDate: game.startDate?.slice(0, 10) ?? "",
      endDate: game.endDate?.slice(0, 10) ?? "",
      enseigneId: game.enseigneId ?? "",
    });
    setCreateImageFile(null);
    if (createImageInputRef.current) createImageInputRef.current.value = "";
    setFeedback(null);
    setActionError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCancelEdit = () => {
    setEditingGame(null);
    setFormState(emptyForm);
    setCreateImageFile(null);
    if (createImageInputRef.current) createImageInputRef.current.value = "";
    setActionError(null);
  };

  const handleActivate = async (game: ReferralGame) => {
    if (!window.confirm(`Activer maintenant le jeu de parrainage "${game.title}" (sans attendre sa date de début) ?`)) return;
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
    if (!window.confirm(`Tirer le gagnant du jeu de parrainage "${game.title}" ?`)) return;
    setActionError(null);
    try {
      const result = await drawReferralGame({ gameId: game.id });
      setFeedback(result.data.status === "no_eligible_entries" ? "Aucun participant eligible." : "Tirage termine.");
    } catch (endError) {
      setActionError(endError instanceof Error ? endError.message : "Impossible de tirer le gagnant.");
    }
  };

  const handleRepair = async (game: ReferralGame) => {
    setActionError(null);
    try {
      const [tickets, gain] = await Promise.all([
        reconcileReferralGameTickets({ gameId: game.id }),
        repairReferralGameDraw({ gameId: game.id }),
      ]);
      setFeedback(`Reparation terminee : ${tickets.data.created} ticket(s) cree(s), gain ${gain.data.status}.`);
    } catch (repairError) {
      setActionError(repairError instanceof Error ? repairError.message : "Reparation impossible.");
    }
  };

  function validateImageFile(file: File): string | null {
    if (!file.type.startsWith("image/")) {
      return "Le fichier sélectionné doit être une image valide.";
    }
    if (file.size > 5 * 1024 * 1024) {
      return "L'image dépasse 5 Mo. Choisis un fichier plus léger.";
    }
    return null;
  }

  async function uploadReferralGameImage(gameId: string, file: File): Promise<string> {
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storageRef = ref(storage, `referral_games/${gameId}/${Date.now()}-${sanitizedFileName}`);
    await uploadBytes(storageRef, file, { contentType: file.type });
    return getDownloadURL(storageRef);
  }

  const handleImageSelected = async (game: ReferralGame, file: File | undefined) => {
    if (!file) return;
    const inputEl = fileInputRefs.current[game.id];

    const validationError = validateImageFile(file);
    if (validationError) {
      setActionError(validationError);
      if (inputEl) inputEl.value = "";
      return;
    }

    setActionError(null);
    setUploadingGameId(game.id);
    try {
      const downloadUrl = await uploadReferralGameImage(game.id, file);

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
      console.error("[REFERRAL_GAME_IMAGE_UPLOAD]", uploadError);
      setActionError(uploadError instanceof Error ? uploadError.message : "Impossible d'envoyer l'image.");
    } finally {
      setUploadingGameId(null);
      if (inputEl) inputEl.value = "";
    }
  };

  const handleDelete = async (game: ReferralGame) => {
    const warning =
      game.status === "active"
        ? ` Ce jeu est actuellement actif — le supprimer y met fin immédiatement.`
        : "";
    if (!window.confirm(`Supprimer le jeu de parrainage "${game.title}" ?${warning}`)) return;
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
              Un brouillon démarre automatiquement à sa date de début tant qu&apos;aucun autre jeu
              n&apos;est déjà actif — ou activez-le manuellement avant cette date avec le bouton
              &laquo;&nbsp;Activer maintenant&nbsp;&raquo;. Un ticket est créé
              automatiquement pour chaque parrainage validé (le filleul crée son compte) tant qu&apos;un
              jeu est actif — sans plafond. Le tirage au sort se fait automatiquement à la date de fin.
              Un seul jeu actif à la fois.
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
            void (editingGame ? handleUpdate() : handleCreate());
          }}
        >
          <div className="mb-4">
            <h2 className="text-[16px] font-medium text-[#1a1a1a]">
              {editingGame ? "Voir / modifier le jeu" : "Nouveau jeu (brouillon)"}
            </h2>
            {hasActiveGame ? (
              <p className="mt-1 text-[13px] text-[#EF9F27]">
                Un jeu est déjà actif — le nouveau jeu restera en brouillon et démarrera
                automatiquement une fois le jeu actif terminé (à sa date de fin).
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

            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-[#666]">Commerçant partenaire (facultatif)</span>
              <select
                className="rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[14px] text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#639922]"
                value={formState.enseigneId}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, enseigneId: event.target.value }))
                }
              >
                <option value="">Aucun (organisé par Proxiplay)</option>
                {merchants.map((merchant) => (
                  <option key={merchant.id} value={merchant.id}>
                    {merchant.name}
                  </option>
                ))}
              </select>
            </label>

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
              <span className="text-[12px] font-medium text-[#666]">Image (affichée au joueur)</span>
              <div className="flex items-center gap-3">
                {createImagePreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={createImagePreviewUrl}
                    alt=""
                    className="h-12 w-12 flex-none rounded-[8px] object-cover"
                  />
                ) : null}
                <input
                  ref={createImageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) {
                      setCreateImageFile(null);
                      return;
                    }
                    const validationError = validateImageFile(file);
                    if (validationError) {
                      setActionError(validationError);
                      event.target.value = "";
                      setCreateImageFile(null);
                      return;
                    }
                    setActionError(null);
                    setCreateImageFile(file);
                  }}
                  className="text-[13px] text-[#666] file:mr-3 file:rounded-[8px] file:border file:border-[#E0E0DA] file:bg-white file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-[#666] hover:file:bg-[#F7F7F5]"
                />
              </div>
            </label>

            <label className="flex flex-col gap-1.5">
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
              <span className="text-[12px] font-medium text-[#666]">Valeur du lot (€)</span>
              <input
                className="rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[14px] text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#639922]"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={formState.prizeValue}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, prizeValue: event.target.value }))
                }
                placeholder="50"
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
              {submitting
                ? "Enregistrement…"
                : editingGame
                  ? "Enregistrer les modifications"
                  : "Créer en brouillon"}
            </button>
            {editingGame ? (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="ml-3 inline-flex items-center justify-center rounded-[10px] border border-[#E0E0DA] bg-white px-5 py-3 text-[14px] font-medium text-[#666] hover:bg-[#F7F7F5]"
              >
                Annuler
              </button>
            ) : null}
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
                            {game.prizeValue > 0 ? ` — ${game.prizeValue} €` : ""}
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
                          onClick={() => handleEdit(game)}
                          className="inline-flex items-center rounded-[7px] border border-[#639922] bg-white px-3 py-1.5 text-[12px] font-medium text-[#3B6D11] transition hover:bg-[#EAF3DE]"
                        >
                          Voir / modifier
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedGame(game)}
                          className="inline-flex items-center rounded-[7px] border border-[#E0E0DA] bg-white px-3 py-1.5 text-[12px] font-medium text-[#666] transition hover:bg-[#F7F7F5]"
                        >
                          Participants
                        </button>
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
                            Activer maintenant
                          </button>
                        ) : null}
                        {game.status === "active" ? (
                          <button
                            type="button"
                            onClick={() => void handleEnd(game)}
                            className="inline-flex items-center rounded-[7px] border border-[#E0C87A] bg-[#FBF3DD] px-3 py-1.5 text-[12px] font-medium text-[#8A6A10] transition hover:bg-[#F5E8C4]"
                          >
                            Tirer le gagnant
                          </button>
                        ) : null}
                        {game.status === "ended" ? (
                          <button
                            type="button"
                            onClick={() => void handleRepair(game)}
                            className="inline-flex items-center rounded-[7px] border border-[#E0C87A] bg-[#FBF3DD] px-3 py-1.5 text-[12px] font-medium text-[#8A6A10] transition hover:bg-[#F5E8C4]"
                          >
                            Reparer le jeu
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void handleDelete(game)}
                          className="inline-flex items-center rounded-[7px] border border-[#E0E0DA] bg-white px-3 py-1.5 text-[12px] font-medium text-[#666] transition hover:bg-[#F7F7F5]"
                        >
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {selectedGame ? (
          <section className="overflow-hidden rounded-[12px] border border-[#E8E8E4] bg-white">
            <div className="flex items-start justify-between border-b border-[#F0F0EC] px-5 py-4">
              <div>
                <h2 className="text-[16px] font-medium text-[#1a1a1a]">Participants : {selectedGame.title}</h2>
                <p className="mt-1 text-[12px] text-[#666]">
                  {selectedGame.winnerUid ? `Gagnant : ${participants.find((participant) => participant.winner)?.label ?? selectedGame.winnerUid} (${selectedGame.winnerTicketCount ?? 0} tickets).` : "Aucun gagnant tire."}
                  {selectedGame.status === "ended" ? ` Tirage : ${formatDisplayDate(selectedGame.endDate)}.` : ""}
                </p>
              </div>
              <button type="button" onClick={() => setSelectedGame(null)} className="text-[12px] font-medium text-[#666]">Fermer</button>
            </div>
            {participantsLoading ? <p className="px-5 py-6 text-[13px] text-[#666]">Chargement des participants…</p> : null}
            {!participantsLoading && participants.length === 0 ? <p className="px-5 py-6 text-[13px] text-[#666]">Aucun participant eligible.</p> : null}
            {!participantsLoading && participants.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead><tr className="border-b border-[#F0F0EC] text-left text-[11px] uppercase tracking-[0.06em] text-[#999]"><th className="px-4 py-3">Parrain</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Tickets</th><th className="px-4 py-3">Filleuls</th><th className="px-4 py-3">Eligibilite</th><th className="px-4 py-3">Resultat</th></tr></thead>
                  <tbody>{participants.map((participant) => <tr key={participant.userId} className="border-b border-[#F0F0EC] last:border-0"><td className="px-4 py-3 font-medium">{participant.label}</td><td className="px-4 py-3 text-[#666]">{participant.email || "—"}</td><td className="px-4 py-3">{participant.tickets}</td><td className="px-4 py-3">{participant.referrals}</td><td className="px-4 py-3">{participant.eligibility}</td><td className="px-4 py-3">{participant.winner ? "Gagnant" : "—"}</td></tr>)}</tbody>
                </table>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </section>
  );
}
