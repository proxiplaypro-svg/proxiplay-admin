"use client";

import { useEffect, useMemo, useState } from "react";
import { FirebaseError } from "firebase/app";
import {
  addDoc,
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentReference,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "@/lib/firebase/client-app";

type CampaignStatus = "draft" | "active" | "ended";

type CampaignListItem = {
  id: string;
  name: string;
  description: string;
  coverImage: string | null;
  startDate: string | null;
  endDate: string | null;
  startDateValue: number | null;
  endDateValue: number | null;
  status: CampaignStatus;
  prizeDescription: string;
  prizeImage: string | null;
  merchantIds: string[];
  threshold: number;
};

type CampaignGameOption = {
  id: string;
  title: string;
  merchantId: string | null;
  merchantName: string;
  startDate: string | null;
  endDate: string | null;
  photo: string | null;
  campaignId: string | null;
};

type QualifiedPlayer = {
  uid: string;
  label: string;
  email: string;
  visitedMerchantsCount: number;
  lastUpdatedLabel: string;
};

type CampaignWinner = {
  uid: string;
  label: string;
  email: string;
  selectedAtLabel: string;
};

type CampaignFormState = {
  id: string | null;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  prizeDescription: string;
  threshold: string;
  coverImageUrl: string;
  coverImageFile: File | null;
  prizeImageUrl: string;
  prizeImageFile: File | null;
  status: CampaignStatus;
};

type FirestoreCampaignDocument = {
  name?: string;
  description?: string;
  cover_image?: string;
  start_date?: Timestamp;
  end_date?: Timestamp;
  status?: string;
  prize_description?: string;
  prize_image?: string;
  merchant_ids?: string[];
  threshold?: number | string;
};

type FirestoreGameDocument = {
  name?: string;
  title?: string;
  enseigne_name?: string;
  merchantName?: string;
  enseigne_id?: DocumentReference | string | null;
  merchant_id?: string;
  photo?: string;
  coverUrl?: string;
  start_date?: Timestamp;
  end_date?: Timestamp;
  type?: string;
  campaign_id?: string | null;
};

type FirestoreUserDocument = {
  email?: string;
  display_name?: string;
  displayName?: string;
  first_name?: string;
  last_name?: string;
  firstName?: string;
  lastName?: string;
};

type FirestoreProgressDocument = {
  visited_merchants?: string[];
  qualified?: boolean;
  last_updated?: Timestamp;
};

type DetailState = {
  loading: boolean;
  error: string | null;
  qualifiedPlayers: QualifiedPlayer[];
  participantsCount: number;
  linkedGameIds: string[];
  winner: CampaignWinner | null;
};

const cardClassName = "rounded-[12px] border border-[#E8E8E4] bg-white p-5";
const inputClassName =
  "w-full rounded-[10px] border border-[#E8E8E4] bg-[#F7F7F5] px-3 py-[10px] text-[13px] text-[#1A1A1A] outline-none placeholder:text-[#999999] disabled:cursor-not-allowed disabled:opacity-60";
const textareaClassName = `${inputClassName} min-h-[110px] resize-y`;
const buttonPrimaryClassName =
  "rounded-[10px] border border-[#639922] bg-[#639922] px-4 py-[10px] text-[12px] font-medium text-white transition hover:bg-[#57881D] disabled:cursor-not-allowed disabled:opacity-50";
const buttonSecondaryClassName =
  "rounded-[10px] border border-[#E8E8E4] bg-white px-4 py-[10px] text-[12px] font-medium text-[#1A1A1A] transition hover:bg-[#F7F7F5] disabled:cursor-not-allowed disabled:opacity-50";
const tableHeadClassName =
  "px-[14px] py-[10px] text-left text-[11px] font-medium uppercase tracking-[0.08em] text-[#7B7B7B]";
const tableCellClassName = "px-[14px] py-[12px] text-[12.5px] text-[#1A1A1A]";

function formatDateValue(value: number | null, options?: Intl.DateTimeFormatOptions) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("fr-FR", options ?? {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateRange(start: number | null, end: number | null) {
  return `${formatDateValue(start)} - ${formatDateValue(end)}`;
}

function formatInputDate(value: string | null) {
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

function parseDateInput(value: string) {
  return value ? Timestamp.fromDate(new Date(`${value}T00:00:00`)) : null;
}

function readText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function readNumber(...values: Array<number | string | null | undefined>) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.trunc(value);
    }

    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }

  return 0;
}

function readTimestamp(value?: Timestamp | null) {
  return value instanceof Timestamp ? value : null;
}

function normalizeCampaignStatus(value: string | null | undefined): CampaignStatus {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "active") return "active";
  if (normalized === "ended") return "ended";
  return "draft";
}

function readMerchantId(
  enseigneId?: DocumentReference | string | null,
  fallback?: string | null,
) {
  if (typeof fallback === "string" && fallback.trim().length > 0) {
    return fallback.trim();
  }

  if (!enseigneId) {
    return null;
  }

  if (typeof enseigneId === "string") {
    return enseigneId.trim() || null;
  }

  return enseigneId.id ?? null;
}

function mapCampaign(snapshot: QueryDocumentSnapshot) {
  const data = snapshot.data() as FirestoreCampaignDocument;
  const startDate = readTimestamp(data.start_date);
  const endDate = readTimestamp(data.end_date);

  return {
    id: snapshot.id,
    name: readText(data.name, "Campagne sans nom"),
    description: readText(data.description),
    coverImage: readText(data.cover_image) || null,
    startDate: startDate?.toDate().toISOString() ?? null,
    endDate: endDate?.toDate().toISOString() ?? null,
    startDateValue: startDate?.toMillis() ?? null,
    endDateValue: endDate?.toMillis() ?? null,
    status: normalizeCampaignStatus(data.status),
    prizeDescription: readText(data.prize_description),
    prizeImage: readText(data.prize_image) || null,
    merchantIds: Array.isArray(data.merchant_ids)
      ? data.merchant_ids.map((value) => String(value)).filter(Boolean)
      : [],
    threshold: Math.max(1, readNumber(data.threshold, 3)),
  } satisfies CampaignListItem;
}

function mapCampaignGame(snapshot: QueryDocumentSnapshot) {
  const data = snapshot.data() as FirestoreGameDocument;
  const startDate = readTimestamp(data.start_date);
  const endDate = readTimestamp(data.end_date);

  return {
    id: snapshot.id,
    title: readText(data.name, data.title, "Jeu sans nom"),
    merchantId: readMerchantId(data.enseigne_id, data.merchant_id),
    merchantName: readText(data.enseigne_name, data.merchantName, "Commerce inconnu"),
    startDate: startDate?.toDate().toISOString() ?? null,
    endDate: endDate?.toDate().toISOString() ?? null,
    photo: readText(data.photo, data.coverUrl) || null,
    campaignId: readText(data.campaign_id ?? undefined) || null,
  } satisfies CampaignGameOption;
}

function buildInitialFormState(): CampaignFormState {
  return {
    id: null,
    name: "",
    description: "",
    startDate: "",
    endDate: "",
    prizeDescription: "",
    threshold: "3",
    coverImageUrl: "",
    coverImageFile: null,
    prizeImageUrl: "",
    prizeImageFile: null,
    status: "draft",
  };
}

function buildFormState(campaign: CampaignListItem | null): CampaignFormState {
  if (!campaign) {
    return buildInitialFormState();
  }

  return {
    id: campaign.id,
    name: campaign.name,
    description: campaign.description,
    startDate: formatInputDate(campaign.startDate),
    endDate: formatInputDate(campaign.endDate),
    prizeDescription: campaign.prizeDescription,
    threshold: String(campaign.threshold),
    coverImageUrl: campaign.coverImage ?? "",
    coverImageFile: null,
    prizeImageUrl: campaign.prizeImage ?? "",
    prizeImageFile: null,
    status: campaign.status,
  };
}

function createPreviewUrl(file: File | null, fallback: string) {
  return file ? URL.createObjectURL(file) : fallback;
}

function getStatusBadge(status: CampaignStatus) {
  switch (status) {
    case "active":
      return "bg-[#EAF3DE] text-[#3B6D11]";
    case "ended":
      return "bg-[#F1EFE8] text-[#5F5E5A]";
    default:
      return "bg-[#FCEBEB] text-[#A32D2D]";
  }
}

function getStatusLabel(status: CampaignStatus) {
  switch (status) {
    case "active":
      return "Active";
    case "ended":
      return "Terminee";
    default:
      return "Brouillon";
  }
}

function buildPlayerLabel(data: FirestoreUserDocument, fallbackEmail: string) {
  const display = readText(data.display_name, data.displayName);
  if (display) {
    return display;
  }

  const fullName = readText(
    [data.first_name, data.last_name].filter(Boolean).join(" "),
    [data.firstName, data.lastName].filter(Boolean).join(" "),
  );
  if (fullName) {
    return fullName;
  }

  return fallbackEmail || "Joueur inconnu";
}

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof FirebaseError) {
    return `${fallback} (${error.code})`;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

async function uploadCampaignImage(
  campaignId: string,
  file: File,
  kind: "cover" | "prize",
) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const storageRef = ref(storage, `campaigns/${campaignId}/${kind}.${extension}`);
  await uploadBytes(storageRef, file, { contentType: file.type });
  return getDownloadURL(storageRef);
}

export default function AdminCampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignListItem[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [campaignsError, setCampaignsError] = useState<string | null>(null);

  const [games, setGames] = useState<CampaignGameOption[]>([]);
  const [gamesLoading, setGamesLoading] = useState(true);
  const [gamesError, setGamesError] = useState<string | null>(null);

  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [formState, setFormState] = useState<CampaignFormState>(() => buildInitialFormState());
  const [selectedGameIds, setSelectedGameIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [formFeedback, setFormFeedback] = useState<string | null>(null);
  const [formFeedbackTone, setFormFeedbackTone] = useState<"success" | "error" | null>(null);
  const [statusActionLoadingId, setStatusActionLoadingId] = useState<string | null>(null);

  const [detailState, setDetailState] = useState<DetailState>({
    loading: false,
    error: null,
    qualifiedPlayers: [],
    participantsCount: 0,
    linkedGameIds: [],
    winner: null,
  });
  const [drawLoading, setDrawLoading] = useState(false);
  const [drawFeedback, setDrawFeedback] = useState<string | null>(null);

  useEffect(() => {
    const campaignsQuery = query(collection(db, "campaigns"), orderBy("start_date", "desc"));
    const unsubscribe = onSnapshot(
      campaignsQuery,
      (snapshot) => {
        setCampaigns(snapshot.docs.map((docSnapshot) => mapCampaign(docSnapshot)));
        setCampaignsLoading(false);
        setCampaignsError(null);
      },
      (error) => {
        console.error(error);
        setCampaignsError("Impossible de charger les campagnes Firestore.");
        setCampaignsLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchGames = async () => {
      setGamesLoading(true);
      setGamesError(null);

      try {
        const snapshot = await getDocs(query(collection(db, "games"), where("type", "==", "campaign")));
        if (cancelled) {
          return;
        }

        setGames(
          snapshot.docs
            .map((docSnapshot) => mapCampaignGame(docSnapshot))
            .sort((left, right) => left.title.localeCompare(right.title, "fr")),
        );
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setGamesError("Impossible de charger les jeux de campagne.");
        }
      } finally {
        if (!cancelled) {
          setGamesLoading(false);
        }
      }
    };

    void fetchGames();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null,
    [campaigns, selectedCampaignId],
  );

  useEffect(() => {
    if (!selectedCampaignId) {
      setDetailState({
        loading: false,
        error: null,
        qualifiedPlayers: [],
        participantsCount: 0,
        linkedGameIds: [],
        winner: null,
      });
      return;
    }

    let cancelled = false;

    const loadDetail = async () => {
      setDetailState((current) => ({
        ...current,
        loading: true,
        error: null,
      }));

      try {
        const progressSnapshots = await getDocs(collectionGroup(db, "campaigns"));
        const matchingProgress = progressSnapshots.docs.filter((snapshot) => {
          const parentUserId = snapshot.ref.parent.parent?.id;
          return snapshot.id === selectedCampaignId && typeof parentUserId === "string";
        });

        const qualifiedEntries = await Promise.all(
          matchingProgress
            .filter((snapshot) => (snapshot.data() as FirestoreProgressDocument).qualified === true)
            .map(async (snapshot) => {
              const progressData = snapshot.data() as FirestoreProgressDocument;
              const uid = snapshot.ref.parent.parent?.id ?? "";
              const userSnapshot = uid ? await getDoc(doc(db, "users", uid)) : null;
              const userData = (userSnapshot?.data() as FirestoreUserDocument | undefined) ?? {};
              const email = readText(userData.email);
              return {
                uid,
                label: buildPlayerLabel(userData, email),
                email: email || "-",
                visitedMerchantsCount: Array.isArray(progressData.visited_merchants)
                  ? progressData.visited_merchants.length
                  : 0,
                lastUpdatedLabel: formatDateValue(
                  progressData.last_updated?.toMillis() ?? null,
                  {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  },
                ),
              } satisfies QualifiedPlayer;
            }),
        );

        const winnerSnapshot = await getDoc(doc(db, "campaigns", selectedCampaignId, "winner", "current"));
        const winnerData = winnerSnapshot.data() as
          | {
              uid?: string;
              label?: string;
              email?: string;
              selected_at?: Timestamp;
            }
          | undefined;

        const linkedGameIds = games
          .filter((game) => game.campaignId === selectedCampaignId)
          .map((game) => game.id);

        if (!cancelled) {
          setDetailState({
            loading: false,
            error: null,
            qualifiedPlayers: qualifiedEntries.sort((left, right) =>
              left.label.localeCompare(right.label, "fr"),
            ),
            participantsCount: matchingProgress.length,
            linkedGameIds,
            winner: winnerData?.uid
              ? {
                  uid: winnerData.uid,
                  label: readText(winnerData.label, "Gagnant inconnu"),
                  email: readText(winnerData.email, "-"),
                  selectedAtLabel: formatDateValue(winnerData.selected_at?.toMillis() ?? null, {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                }
              : null,
          });
          setSelectedGameIds(linkedGameIds);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setDetailState((current) => ({
            ...current,
            loading: false,
            error: "Impossible de charger le detail de la campagne.",
          }));
        }
      }
    };

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [games, selectedCampaignId]);

  useEffect(() => {
    if (selectedCampaign) {
      setFormState(buildFormState(selectedCampaign));
      setFormFeedback(null);
      setFormFeedbackTone(null);
      setDrawFeedback(null);
      return;
    }

    if (!selectedCampaignId) {
      setFormState(buildInitialFormState());
      setSelectedGameIds([]);
    }
  }, [selectedCampaign, selectedCampaignId]);

  const coverPreviewUrl = useMemo(
    () => createPreviewUrl(formState.coverImageFile, formState.coverImageUrl),
    [formState.coverImageFile, formState.coverImageUrl],
  );
  const prizePreviewUrl = useMemo(
    () => createPreviewUrl(formState.prizeImageFile, formState.prizeImageUrl),
    [formState.prizeImageFile, formState.prizeImageUrl],
  );

  useEffect(() => {
    return () => {
      if (formState.coverImageFile && coverPreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(coverPreviewUrl);
      }
      if (formState.prizeImageFile && prizePreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(prizePreviewUrl);
      }
    };
  }, [coverPreviewUrl, formState.coverImageFile, formState.prizeImageFile, prizePreviewUrl]);

  const merchantCount = useMemo(() => {
    const uniqueMerchants = new Set(
      selectedGameIds
        .map((gameId) => games.find((entry) => entry.id === gameId)?.merchantId)
        .filter(Boolean),
    );
    return uniqueMerchants.size;
  }, [games, selectedGameIds]);

  const assignableGames = useMemo(
    () =>
      games.map((game) => ({
        ...game,
        disabled:
          !!game.campaignId &&
          game.campaignId !== selectedCampaignId,
      })),
    [games, selectedCampaignId],
  );

  const handleNewCampaign = () => {
    setSelectedCampaignId(null);
    setSelectedGameIds([]);
    setFormState(buildInitialFormState());
    setFormFeedback(null);
    setFormFeedbackTone(null);
    setDrawFeedback(null);
  };

  const handleFileChange = (
    field: "coverImageFile" | "prizeImageFile",
    file: File | null,
  ) => {
    setFormState((current) => ({
      ...current,
      [field]: file,
    }));
  };

  const toggleGameSelection = (gameId: string) => {
    setSelectedGameIds((current) =>
      current.includes(gameId)
        ? current.filter((entry) => entry !== gameId)
        : [...current, gameId],
    );
  };

  const handleSaveCampaign = async () => {
    setSaving(true);
    setFormFeedback(null);
    setFormFeedbackTone(null);

    try {
      const trimmedName = formState.name.trim();
      if (!trimmedName) {
        throw new Error("Le nom de campagne est obligatoire.");
      }

      const threshold = Math.max(1, Number.parseInt(formState.threshold || "3", 10) || 3);
      const startDate = parseDateInput(formState.startDate);
      const endDate = parseDateInput(formState.endDate);

      if (!startDate || !endDate) {
        throw new Error("Les dates de debut et de fin sont obligatoires.");
      }

      if (endDate.toMillis() < startDate.toMillis()) {
        throw new Error("La date de fin doit etre posterieure a la date de debut.");
      }

      const selectedGames = games.filter((game) => selectedGameIds.includes(game.id));
      const merchantIds = [...new Set(selectedGames.map((game) => game.merchantId).filter(Boolean))] as string[];

      const basePayload = {
        name: trimmedName,
        description: formState.description.trim(),
        start_date: startDate,
        end_date: endDate,
        status: formState.status,
        prize_description: formState.prizeDescription.trim(),
        merchant_ids: merchantIds,
        threshold,
      };

      let campaignRef: DocumentReference;
      if (formState.id) {
        campaignRef = doc(db, "campaigns", formState.id);
        await updateDoc(campaignRef, basePayload);
      } else {
        campaignRef = await addDoc(collection(db, "campaigns"), {
          ...basePayload,
          cover_image: "",
          prize_image: "",
          created_at: serverTimestamp(),
        });
      }

      const campaignId = campaignRef.id;

      const coverImageUrl = formState.coverImageFile
        ? await uploadCampaignImage(campaignId, formState.coverImageFile, "cover")
        : formState.coverImageUrl.trim() || "";
      const prizeImageUrl = formState.prizeImageFile
        ? await uploadCampaignImage(campaignId, formState.prizeImageFile, "prize")
        : formState.prizeImageUrl.trim() || "";

      await updateDoc(campaignRef, {
        cover_image: coverImageUrl,
        prize_image: prizeImageUrl,
        merchant_ids: merchantIds,
        threshold,
        updated_at: serverTimestamp(),
      });

      const previouslyLinkedGames = games.filter((game) => game.campaignId === campaignId).map((game) => game.id);
      const nextSelectedSet = new Set(selectedGameIds);
      const previousSelectedSet = new Set(previouslyLinkedGames);
      const batch = writeBatch(db);

      for (const game of games) {
        if (!previousSelectedSet.has(game.id) && !nextSelectedSet.has(game.id)) {
          continue;
        }

        const gameRef = doc(db, "games", game.id);
        if (nextSelectedSet.has(game.id)) {
          batch.update(gameRef, { campaign_id: campaignId });
        } else if (previousSelectedSet.has(game.id)) {
          batch.update(gameRef, { campaign_id: null });
        }
      }

      await batch.commit();

      setGames((current) =>
        current.map((game) => {
          if (nextSelectedSet.has(game.id)) {
            return { ...game, campaignId };
          }
          if (previousSelectedSet.has(game.id)) {
            return { ...game, campaignId: null };
          }
          return game;
        }),
      );

      setSelectedCampaignId(campaignId);
      setFormFeedback("Campagne enregistree avec succes.");
      setFormFeedbackTone("success");
    } catch (error) {
      console.error(error);
      setFormFeedback(toErrorMessage(error, "Impossible d enregistrer la campagne."));
      setFormFeedbackTone("error");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusAction = async (campaign: CampaignListItem) => {
    const nextStatus: CampaignStatus = campaign.status === "active" ? "ended" : "active";
    setStatusActionLoadingId(campaign.id);

    try {
      await updateDoc(doc(db, "campaigns", campaign.id), {
        status: nextStatus,
        updated_at: serverTimestamp(),
      });
    } catch (error) {
      console.error(error);
      window.alert(toErrorMessage(error, "Impossible de mettre a jour le statut."));
    } finally {
      setStatusActionLoadingId(null);
    }
  };

  const handleDraw = async () => {
    if (!selectedCampaignId) {
      return;
    }

    setDrawLoading(true);
    setDrawFeedback(null);

    try {
      if (detailState.qualifiedPlayers.length === 0) {
        throw new Error("Aucun joueur qualifie pour cette campagne.");
      }

      const winner =
        detailState.qualifiedPlayers[
          Math.floor(Math.random() * detailState.qualifiedPlayers.length)
        ];

      await setDoc(doc(db, "campaigns", selectedCampaignId, "winner", "current"), {
        uid: winner.uid,
        label: winner.label,
        email: winner.email,
        selected_at: serverTimestamp(),
      });

      setDetailState((current) => ({
        ...current,
        winner: {
          uid: winner.uid,
          label: winner.label,
          email: winner.email,
          selectedAtLabel: "A l instant",
        },
      }));
      setDrawFeedback(`Gagnant selectionne : ${winner.label}`);
    } catch (error) {
      console.error(error);
      setDrawFeedback(toErrorMessage(error, "Impossible de lancer le tirage."));
    } finally {
      setDrawLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <span className="text-[11px] uppercase tracking-[0.14em] text-[#7B7B7B]">
            Campagnes
          </span>
          <h1 className="mt-1 text-[28px] font-medium text-[#1A1A1A]">
            Gestion des campagnes
          </h1>
          <p className="mt-2 max-w-[780px] text-[13px] text-[#666666]">
            Cree, active et pilote les campagnes collectives, les jeux associes
            et le tirage final des joueurs qualifies.
          </p>
        </div>
        <button type="button" className={buttonPrimaryClassName} onClick={handleNewCampaign}>
          Nouvelle campagne
        </button>
      </header>

      <section className={cardClassName}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-[16px] font-medium text-[#1A1A1A]">
              Liste des campagnes
            </h2>
            <p className="mt-1 text-[12px] text-[#7B7B7B]">
              Vue d ensemble des campagnes et actions rapides.
            </p>
          </div>
        </div>

        {campaignsLoading ? (
          <div className="py-10 text-[12.5px] text-[#999999]">
            Chargement des campagnes...
          </div>
        ) : campaignsError ? (
          <div className="rounded-[10px] border border-[#F5C9C9] bg-[#FFF5F5] px-4 py-3 text-[12px] text-[#A32D2D]">
            {campaignsError}
          </div>
        ) : campaigns.length === 0 ? (
          <div className="py-10 text-[12.5px] text-[#999999]">
            Aucune campagne pour le moment.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-[#F0F0EC]">
                  <th className={tableHeadClassName}>Nom</th>
                  <th className={tableHeadClassName}>Statut</th>
                  <th className={tableHeadClassName}>Dates</th>
                  <th className={tableHeadClassName}>Commercants</th>
                  <th className={`${tableHeadClassName} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => (
                  <tr
                    key={campaign.id}
                    className={`border-b border-[#F0F0EC] last:border-b-0 ${
                      selectedCampaignId === campaign.id ? "bg-[#FAFAF8]" : ""
                    }`}
                  >
                    <td className={tableCellClassName}>
                      <div>
                        <p className="font-medium">{campaign.name}</p>
                        <p className="mt-1 text-[11px] text-[#7B7B7B]">
                          {campaign.description || "Sans description"}
                        </p>
                      </div>
                    </td>
                    <td className={tableCellClassName}>
                      <span
                        className={`inline-flex rounded-full px-3 py-[4px] text-[11px] font-medium ${getStatusBadge(
                          campaign.status,
                        )}`}
                      >
                        {getStatusLabel(campaign.status)}
                      </span>
                    </td>
                    <td className={tableCellClassName}>
                      {formatDateRange(campaign.startDateValue, campaign.endDateValue)}
                    </td>
                    <td className={tableCellClassName}>
                      {campaign.merchantIds.length}
                    </td>
                    <td className={`${tableCellClassName} text-right`}>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className={buttonSecondaryClassName}
                          onClick={() => setSelectedCampaignId(campaign.id)}
                        >
                          Voir
                        </button>
                        <button
                          type="button"
                          className={buttonPrimaryClassName}
                          disabled={statusActionLoadingId === campaign.id}
                          onClick={() => void handleStatusAction(campaign)}
                        >
                          {statusActionLoadingId === campaign.id
                            ? "Mise a jour..."
                            : campaign.status === "active"
                              ? "Terminer"
                              : "Activer"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
        <div className={cardClassName}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-medium text-[#1A1A1A]">
                {formState.id ? "Edition campagne" : "Creation campagne"}
              </h2>
              <p className="mt-1 text-[12px] text-[#7B7B7B]">
                Configure la campagne, ses visuels et les jeux participants.
              </p>
            </div>
            {formState.id ? (
              <button type="button" className={buttonSecondaryClassName} onClick={handleNewCampaign}>
                Nouvelle campagne
              </button>
            ) : null}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 md:col-span-2">
              <span className="text-[12px] font-medium text-[#666666]">Nom</span>
              <input
                className={inputClassName}
                value={formState.name}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Campagne printemps"
              />
            </label>

            <label className="grid gap-2 md:col-span-2">
              <span className="text-[12px] font-medium text-[#666666]">Description</span>
              <textarea
                className={textareaClassName}
                value={formState.description}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="Description de la campagne"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-[12px] font-medium text-[#666666]">Date de debut</span>
              <input
                type="date"
                className={inputClassName}
                value={formState.startDate}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    startDate: event.target.value,
                  }))
                }
              />
            </label>

            <label className="grid gap-2">
              <span className="text-[12px] font-medium text-[#666666]">Date de fin</span>
              <input
                type="date"
                className={inputClassName}
                value={formState.endDate}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    endDate: event.target.value,
                  }))
                }
              />
            </label>

            <label className="grid gap-2">
              <span className="text-[12px] font-medium text-[#666666]">Seuil de qualification</span>
              <input
                type="number"
                min={1}
                className={inputClassName}
                value={formState.threshold}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    threshold: event.target.value,
                  }))
                }
              />
            </label>

            <label className="grid gap-2">
              <span className="text-[12px] font-medium text-[#666666]">Statut</span>
              <select
                className={inputClassName}
                value={formState.status}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    status: event.target.value as CampaignStatus,
                  }))
                }
              >
                <option value="draft">Brouillon</option>
                <option value="active">Active</option>
                <option value="ended">Terminee</option>
              </select>
            </label>

            <label className="grid gap-2 md:col-span-2">
              <span className="text-[12px] font-medium text-[#666666]">Description du gros lot</span>
              <textarea
                className={textareaClassName}
                value={formState.prizeDescription}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    prizeDescription: event.target.value,
                  }))
                }
                placeholder="Voyage, bon d achat, experience..."
              />
            </label>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-[10px] border border-[#E8E8E4] bg-[#FAFAF8] p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12px] font-medium text-[#666666]">Banniere</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => handleFileChange("coverImageFile", event.target.files?.[0] ?? null)}
                  className="block max-w-[180px] text-[11px] text-[#666666]"
                />
              </div>
              <div className="mt-3 overflow-hidden rounded-[10px] border border-[#E8E8E4] bg-white">
                {coverPreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverPreviewUrl} alt="Banniere campagne" className="h-[150px] w-full object-cover" />
                ) : (
                  <div className="flex h-[150px] items-center justify-center text-[12px] text-[#999999]">
                    Aucune image selectionnee
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[10px] border border-[#E8E8E4] bg-[#FAFAF8] p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12px] font-medium text-[#666666]">Image du lot</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => handleFileChange("prizeImageFile", event.target.files?.[0] ?? null)}
                  className="block max-w-[180px] text-[11px] text-[#666666]"
                />
              </div>
              <div className="mt-3 overflow-hidden rounded-[10px] border border-[#E8E8E4] bg-white">
                {prizePreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={prizePreviewUrl} alt="Lot campagne" className="h-[150px] w-full object-cover" />
                ) : (
                  <div className="flex h-[150px] items-center justify-center text-[12px] text-[#999999]">
                    Aucune image selectionnee
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-[14px] font-medium text-[#1A1A1A]">
                  Jeux participants
                </h3>
                <p className="mt-1 text-[12px] text-[#7B7B7B]">
                  Selectionne les jeux de type campagne a rattacher.
                </p>
              </div>
              <span className="rounded-full bg-[#F7F7F5] px-3 py-[6px] text-[11px] text-[#666666]">
                {selectedGameIds.length} jeu(x) • {merchantCount} commerce(s)
              </span>
            </div>

            {gamesLoading ? (
              <div className="mt-4 text-[12.5px] text-[#999999]">
                Chargement des jeux...
              </div>
            ) : gamesError ? (
              <div className="mt-4 rounded-[10px] border border-[#F5C9C9] bg-[#FFF5F5] px-4 py-3 text-[12px] text-[#A32D2D]">
                {gamesError}
              </div>
            ) : assignableGames.length === 0 ? (
              <div className="mt-4 text-[12.5px] text-[#999999]">
                Aucun jeu de type campagne disponible.
              </div>
            ) : (
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {assignableGames.map((game) => {
                  const selected = selectedGameIds.includes(game.id);
                  return (
                    <label
                      key={game.id}
                      className={`flex cursor-pointer gap-3 rounded-[12px] border p-3 transition ${
                        game.disabled
                          ? "border-[#E8E8E4] bg-[#F7F7F5] opacity-60"
                          : selected
                            ? "border-[#C0DD97] bg-[#F4F9EC]"
                            : "border-[#E8E8E4] bg-white hover:bg-[#FAFAF8]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded-[4px] border border-[#D3D1C7]"
                        checked={selected}
                        disabled={game.disabled}
                        onChange={() => toggleGameSelection(game.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[12.5px] font-medium text-[#1A1A1A]">
                              {game.title}
                            </p>
                            <p className="mt-1 text-[11px] text-[#7B7B7B]">
                              {game.merchantName}
                            </p>
                          </div>
                          {game.campaignId && game.campaignId !== selectedCampaignId ? (
                            <span className="rounded-full bg-[#FCEBEB] px-2 py-[4px] text-[10px] text-[#A32D2D]">
                              Deja lie
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-[11px] text-[#999999]">
                          {formatDateRange(
                            game.startDate ? new Date(game.startDate).getTime() : null,
                            game.endDate ? new Date(game.endDate).getTime() : null,
                          )}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {formFeedback ? (
            <div
              className={`mt-5 rounded-[10px] px-4 py-3 text-[12px] ${
                formFeedbackTone === "success"
                  ? "border border-[#C0DD97] bg-[#EAF3DE] text-[#3B6D11]"
                  : "border border-[#F5C9C9] bg-[#FFF5F5] text-[#A32D2D]"
              }`}
            >
              {formFeedback}
            </div>
          ) : null}

          <div className="mt-5 flex justify-end gap-3">
            <button type="button" className={buttonSecondaryClassName} onClick={handleNewCampaign}>
              Reinitialiser
            </button>
            <button
              type="button"
              className={buttonPrimaryClassName}
              disabled={saving}
              onClick={() => void handleSaveCampaign()}
            >
              {saving ? "Enregistrement..." : formState.id ? "Mettre a jour" : "Creer la campagne"}
            </button>
          </div>
        </div>

        <div className={`${cardClassName} h-fit`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-medium text-[#1A1A1A]">
                Detail campagne
              </h2>
              <p className="mt-1 text-[12px] text-[#7B7B7B]">
                Suivi des qualifies, participants et tirage final.
              </p>
            </div>
          </div>

          {!selectedCampaignId || !selectedCampaign ? (
            <div className="mt-6 rounded-[10px] border border-dashed border-[#D9D8D3] bg-[#FAFAF8] px-4 py-10 text-center text-[12.5px] text-[#999999]">
              Selectionne une campagne depuis la liste pour voir son detail.
            </div>
          ) : detailState.loading ? (
            <div className="mt-6 text-[12.5px] text-[#999999]">
              Chargement du detail...
            </div>
          ) : detailState.error ? (
            <div className="mt-6 rounded-[10px] border border-[#F5C9C9] bg-[#FFF5F5] px-4 py-3 text-[12px] text-[#A32D2D]">
              {detailState.error}
            </div>
          ) : (
            <div className="mt-5 space-y-5">
              <div className="rounded-[12px] border border-[#E8E8E4] bg-[#FAFAF8] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-[15px] font-medium text-[#1A1A1A]">
                      {selectedCampaign.name}
                    </h3>
                    <p className="mt-1 text-[12px] text-[#666666]">
                      {selectedCampaign.description || "Sans description"}
                    </p>
                  </div>
                  <span
                    className={`inline-flex rounded-full px-3 py-[4px] text-[11px] font-medium ${getStatusBadge(
                      selectedCampaign.status,
                    )}`}
                  >
                    {getStatusLabel(selectedCampaign.status)}
                  </span>
                </div>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-[11px] uppercase tracking-[0.08em] text-[#7B7B7B]">
                      Periode
                    </dt>
                    <dd className="mt-1 text-[12.5px] text-[#1A1A1A]">
                      {formatDateRange(
                        selectedCampaign.startDateValue,
                        selectedCampaign.endDateValue,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-[0.08em] text-[#7B7B7B]">
                      Jeux lies
                    </dt>
                    <dd className="mt-1 text-[12.5px] text-[#1A1A1A]">
                      {detailState.linkedGameIds.length}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-[0.08em] text-[#7B7B7B]">
                      Commercants
                    </dt>
                    <dd className="mt-1 text-[12.5px] text-[#1A1A1A]">
                      {selectedCampaign.merchantIds.length}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-[0.08em] text-[#7B7B7B]">
                      Participants
                    </dt>
                    <dd className="mt-1 text-[12.5px] text-[#1A1A1A]">
                      {detailState.participantsCount}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-[12px] border border-[#E8E8E4] bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-[14px] font-medium text-[#1A1A1A]">
                      Joueurs qualifies
                    </h3>
                    <p className="mt-1 text-[12px] text-[#7B7B7B]">
                      {detailState.qualifiedPlayers.length} joueur(s) qualifies pour le tirage.
                    </p>
                  </div>
                  <button
                    type="button"
                    className={buttonPrimaryClassName}
                    disabled={drawLoading || detailState.qualifiedPlayers.length === 0}
                    onClick={() => void handleDraw()}
                  >
                    {drawLoading ? "Tirage..." : "Lancer le tirage"}
                  </button>
                </div>

                {drawFeedback ? (
                  <div className="mt-4 rounded-[10px] border border-[#C0DD97] bg-[#EAF3DE] px-4 py-3 text-[12px] text-[#3B6D11]">
                    {drawFeedback}
                  </div>
                ) : null}

                {detailState.winner ? (
                  <div className="mt-4 rounded-[10px] border border-[#E8E8E4] bg-[#FAFAF8] px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-[#7B7B7B]">
                      Gagnant actuel
                    </p>
                    <p className="mt-2 text-[14px] font-medium text-[#1A1A1A]">
                      {detailState.winner.label}
                    </p>
                    <p className="mt-1 text-[12px] text-[#666666]">
                      {detailState.winner.email}
                    </p>
                    <p className="mt-1 text-[11px] text-[#999999]">
                      Tire le {detailState.winner.selectedAtLabel}
                    </p>
                  </div>
                ) : null}

                {detailState.qualifiedPlayers.length === 0 ? (
                  <div className="mt-4 text-[12.5px] text-[#999999]">
                    Aucun joueur qualifie pour le moment.
                  </div>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full">
                      <thead>
                        <tr className="border-b border-[#F0F0EC]">
                          <th className={tableHeadClassName}>Joueur</th>
                          <th className={tableHeadClassName}>Email</th>
                          <th className={tableHeadClassName}>Commercants visites</th>
                          <th className={tableHeadClassName}>Maj</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailState.qualifiedPlayers.map((player) => (
                          <tr key={player.uid} className="border-b border-[#F0F0EC] last:border-b-0">
                            <td className={tableCellClassName}>{player.label}</td>
                            <td className={tableCellClassName}>{player.email}</td>
                            <td className={tableCellClassName}>
                              {player.visitedMerchantsCount}
                            </td>
                            <td className={tableCellClassName}>
                              {player.lastUpdatedLabel}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
