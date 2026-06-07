"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FirebaseError } from "firebase/app";
import {
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
import { jsPDF } from "jspdf";
import { db } from "@/lib/firebase/client-app";

const QRCode = require("qrcode") as {
  toDataURL: (
    text: string,
    options?: {
      width?: number;
      margin?: number;
    },
  ) => Promise<string>;
};

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
  merchantCity: string;
  startDate: string | null;
  endDate: string | null;
  photo: string | null;
  campaignId: string | null;
  secondaryPrize: string;
  prizeCount: number;
};

type MerchantOption = {
  id: string;
  name: string;
  city: string;
};

type CampaignMerchantRow = {
  merchantId: string;
  merchantName: string;
  merchantCity: string;
  secondaryPrize: string;
  secondaryPrizeDescription: string;
  prizeCount: string;
  gameEndDate: string;
  gameImageUrl: string;
  gameImageFile: File | null;
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
  enseigne_ref?: DocumentReference | string | null;
  enseigne_id?: DocumentReference | string | null;
  merchant_id?: string;
  prize_description?: string;
  prize_count?: number | string | null;
  photo?: string;
  coverUrl?: string;
  start_date?: Timestamp;
  end_date?: Timestamp;
  type?: string;
  animation_id?: string | null;
  campaign_id?: string | null;
  prize_value?: number | string | null;
};

type FirestoreMerchantDocument = {
  name?: string;
  city?: string;
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

type FirestorePrizeDocument = {
  animation_id?: string | null;
  winner_id?: DocumentReference | null;
  game_id?: DocumentReference | null;
  merchantName?: string;
  merchant_name?: string;
  enseigne_name?: string;
  claimed?: boolean;
  claimed_at?: Timestamp;
  redeemed_at?: Timestamp;
  expiredAt?: Timestamp | null;
  expired_at?: Timestamp | null;
  win_date?: Timestamp;
  created_at?: Timestamp;
  created_time?: Timestamp;
  updated_at?: Timestamp;
  prize_label?: string;
  prize_name?: string;
  prize_title?: string;
  label?: string;
  name?: string;
  title?: string;
  status?: string;
};

type CampaignPrizeRow = {
  id: string;
  playerLabel: string;
  playerEmail: string;
  merchantName: string;
  prizeLabel: string;
  wonAtLabel: string;
  wonAtValue: number;
  status: "pending" | "claimed" | "expired";
};

type CampaignPrizeStatusFilter = "tous" | "pending" | "claimed" | "expired";

type DetailState = {
  loading: boolean;
  error: string | null;
  qualifiedPlayers: QualifiedPlayer[];
  participantsCount: number;
  linkedGameIds: string[];
  winner: CampaignWinner | null;
  prizes: CampaignPrizeRow[];
  prizesError: string | null;
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
    name: readText(data.name, "Animation sans nom"),
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
    merchantId: readMerchantId(data.enseigne_ref ?? data.enseigne_id, data.merchant_id),
    merchantName: readText(data.enseigne_name, data.merchantName, "Commerce inconnu"),
    merchantCity: "",
    startDate: startDate?.toDate().toISOString() ?? null,
    endDate: endDate?.toDate().toISOString() ?? null,
    photo: readText(data.photo, data.coverUrl) || null,
    campaignId: readText(data.animation_id ?? undefined, data.campaign_id ?? undefined) || null,
    secondaryPrize: readText(data.prize_description),
    prizeCount: Math.max(0, readNumber(data.prize_count)),
  } satisfies CampaignGameOption;
}

function mapMerchant(snapshot: QueryDocumentSnapshot) {
  const data = snapshot.data() as FirestoreMerchantDocument;

  return {
    id: snapshot.id,
    name: readText(data.name, "Commerce sans nom"),
    city: readText(data.city),
  } satisfies MerchantOption;
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

function getPlayerFirstName(label: string, email: string) {
  const normalizedLabel = label.trim();
  if (normalizedLabel) {
    const [firstName] = normalizedLabel.split(/\s+/);
    if (firstName) {
      return firstName;
    }
  }

  const fallbackEmail = email.trim();
  if (fallbackEmail) {
    return fallbackEmail.split("@")[0] || fallbackEmail;
  }

  return "Joueur";
}

function normalizeStatusValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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

function buildGameDeepLinkUrl(game: {
  id: string;
  campaignId: string | null;
  merchantId: string | null;
}) {
  const params = new URLSearchParams();

  if (game.campaignId) {
    params.set("animationId", game.campaignId);
    params.set("animation_id", game.campaignId);
  }

  if (game.merchantId) {
    params.set("merchantId", game.merchantId);
    params.set("merchant_id", game.merchantId);
  }

  const queryString = params.toString();
  return `https://proxiplay.fr/j/${game.id}${queryString ? `?${queryString}` : ""}`;
}

async function uploadCampaignImage(
  campaignId: string,
  file: File,
  kind: "cover" | "prize",
) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const formData = new FormData();
  formData.append("file", file);
  formData.append("path", `animations/${campaignId}/${kind}.${extension}`);

  const response = await fetch("/api/admin/upload", {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json().catch(() => null)) as
    | { url?: string; error?: string }
    | null;

  if (!response.ok || !payload?.url) {
    throw new Error(payload?.error?.trim() || "Impossible d uploader l image.");
  }

  return payload.url;
}

async function uploadGameImage(merchantId: string, file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const formData = new FormData();
  formData.append("file", file);
  formData.append("path", `games/${merchantId}/cover.${extension}`);

  const response = await fetch("/api/admin/upload", {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json().catch(() => null)) as
    | { url?: string; error?: string }
    | null;

  if (!response.ok || !payload?.url) {
    throw new Error(payload?.error?.trim() || "Impossible d uploader l image du jeu.");
  }

  return payload.url;
}

export default function AdminCampaignsPage() {
  const formSectionRef = useRef<HTMLDivElement | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignListItem[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [campaignsError, setCampaignsError] = useState<string | null>(null);

  const [games, setGames] = useState<CampaignGameOption[]>([]);
  const [gamesLoading, setGamesLoading] = useState(true);
  const [gamesError, setGamesError] = useState<string | null>(null);
  const [merchants, setMerchants] = useState<MerchantOption[]>([]);
  const [merchantsLoading, setMerchantsLoading] = useState(true);
  const [merchantsError, setMerchantsError] = useState<string | null>(null);

  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [formState, setFormState] = useState<CampaignFormState>(() => buildInitialFormState());
  const [merchantSearch, setMerchantSearch] = useState("");
  const [participantMerchants, setParticipantMerchants] = useState<CampaignMerchantRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [formFeedback, setFormFeedback] = useState<string | null>(null);
  const [formFeedbackTone, setFormFeedbackTone] = useState<"success" | "error" | null>(null);
  const [statusActionLoadingId, setStatusActionLoadingId] = useState<string | null>(null);
  const [deleteActionLoadingId, setDeleteActionLoadingId] = useState<string | null>(null);

  const [detailState, setDetailState] = useState<DetailState>({
    loading: false,
    error: null,
    qualifiedPlayers: [],
    participantsCount: 0,
    linkedGameIds: [],
    winner: null,
    prizes: [],
    prizesError: null,
  });
  const [prizeStatusFilter, setPrizeStatusFilter] =
    useState<CampaignPrizeStatusFilter>("tous");
  const [prizeActionLoadingIds, setPrizeActionLoadingIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [prizeActionFeedback, setPrizeActionFeedback] = useState<string | null>(null);
  const [qrCodeUrls, setQrCodeUrls] = useState<Record<string, string>>({});
  const [qrCodesLoading, setQrCodesLoading] = useState(false);
  const [qrCodesError, setQrCodesError] = useState<string | null>(null);
  const [merchantImagePreviewUrls, setMerchantImagePreviewUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const campaignsQuery = query(collection(db, "animations"), orderBy("start_date", "desc"));
    const unsubscribe = onSnapshot(
      campaignsQuery,
      (snapshot) => {
        setCampaigns(snapshot.docs.map((docSnapshot) => mapCampaign(docSnapshot)));
        setCampaignsLoading(false);
        setCampaignsError(null);
      },
      (error) => {
        console.error(error);
        setCampaignsError("Impossible de charger les animations Firestore.");
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
        const snapshot = await getDocs(query(collection(db, "games"), where("type", "==", "animation")));
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
          setGamesError("Impossible de charger les jeux d animation.");
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

  useEffect(() => {
    const merchantsQuery = query(collection(db, "enseignes"));
    const unsubscribe = onSnapshot(
      merchantsQuery,
      (snapshot) => {
        setMerchants(
          snapshot.docs
            .map((docSnapshot) => mapMerchant(docSnapshot))
            .sort((left, right) => left.name.localeCompare(right.name, "fr")),
        );
        setMerchantsLoading(false);
        setMerchantsError(null);
      },
      (error) => {
        console.error(error);
        setMerchantsError("Impossible de charger les commercants.");
        setMerchantsLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null,
    [campaigns, selectedCampaignId],
  );
  const linkedCampaignGames = useMemo(
    () =>
      games
        .filter((game) => detailState.linkedGameIds.includes(game.id))
        .sort((left, right) => left.merchantName.localeCompare(right.merchantName, "fr")),
    [detailState.linkedGameIds, games],
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
        prizes: [],
        prizesError: null,
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
        console.log("[campaign detail] animationId", selectedCampaignId);
        const response = await fetch(`/api/admin/animations/${selectedCampaignId}/detail`, {
          method: "GET",
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as
          | {
              error?: string;
              games?: Array<{ id: string }>;
              prizes?: CampaignPrizeRow[];
              qualifiedUsers?: QualifiedPlayer[];
              winner?: CampaignWinner | null;
              participantsCount?: number;
            }
          | null;

        if (!response.ok) {
          throw new Error(payload?.error?.trim() || "Impossible de charger le detail de l animation.");
        }

        const linkedGameIds = Array.isArray(payload?.games)
          ? payload.games.map((game) => game.id)
          : [];
        const qualifiedPlayers = Array.isArray(payload?.qualifiedUsers)
          ? payload.qualifiedUsers
          : [];
        const prizes = Array.isArray(payload?.prizes) ? payload.prizes : [];
        const winner = payload?.winner ?? null;
        const participantsCount =
          typeof payload?.participantsCount === "number"
            ? payload.participantsCount
            : qualifiedPlayers.length;

        if (!cancelled) {
          setDetailState({
            loading: false,
            error: null,
            qualifiedPlayers,
            participantsCount,
            linkedGameIds,
            winner,
            prizes,
            prizesError: null,
          });
        }
      } catch (error) {
        console.error("[campaign detail] failed to load detail", {
          animationId: selectedCampaignId,
          error,
        });
        if (!cancelled) {
          const detailErrorMessage = toErrorMessage(
            error,
            "Impossible de charger le detail de l animation.",
          );
          setDetailState((current) => ({
            ...current,
            loading: false,
            error: `Impossible de charger le detail de l animation : ${detailErrorMessage}`,
            prizes: [],
            prizesError: `Impossible de charger les lots gagnes : ${detailErrorMessage}`,
          }));
        }
      }
    };

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [selectedCampaignId]);

  useEffect(() => {
    if (selectedCampaign) {
      setFormState(buildFormState(selectedCampaign));
      setFormFeedback(null);
      setFormFeedbackTone(null);
      return;
    }

    if (!selectedCampaignId) {
      setFormState(buildInitialFormState());
      setParticipantMerchants([]);
      setMerchantSearch("");
      setMerchantImagePreviewUrls({});
    }
  }, [selectedCampaign, selectedCampaignId]);

  useEffect(() => {
    if (!selectedCampaignId) {
      return;
    }

    const merchantCityById = new Map(merchants.map((merchant) => [merchant.id, merchant.city]));
    const linkedGames = games.filter((game) => game.campaignId === selectedCampaignId);

    setParticipantMerchants(
      linkedGames.map((game) => ({
        merchantId: game.merchantId ?? game.id,
        merchantName: game.merchantName,
        merchantCity: merchantCityById.get(game.merchantId ?? "") ?? "",
        secondaryPrize: game.secondaryPrize,
        prizeCount: String(game.prizeCount > 0 ? game.prizeCount : 1),
        gameEndDate: formatInputDate(game.endDate) || formState.endDate,
        gameImageUrl: game.photo ?? "",
        gameImageFile: null,
      })),
    );
    setMerchantSearch("");
  }, [formState.endDate, games, merchants, selectedCampaignId]);

  useEffect(() => {
    return () => {
      Object.values(merchantImagePreviewUrls).forEach((previewUrl) => {
        if (previewUrl.startsWith("blob:")) {
          URL.revokeObjectURL(previewUrl);
        }
      });
    };
  }, [merchantImagePreviewUrls]);

  useEffect(() => {
    if (!selectedCampaignId || linkedCampaignGames.length === 0) {
      setQrCodeUrls({});
      setQrCodesLoading(false);
      setQrCodesError(null);
      return;
    }

    let cancelled = false;

    const generateQrCodes = async () => {
      setQrCodesLoading(true);
      setQrCodesError(null);

      try {
        const entries = await Promise.all(
          linkedCampaignGames.map(async (game) => [
            game.id,
            await QRCode.toDataURL(buildGameDeepLinkUrl(game), {
              width: 200,
              margin: 1,
            }),
          ] as const),
        );

        if (cancelled) {
          return;
        }

        setQrCodeUrls(Object.fromEntries(entries));
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setQrCodesError("Impossible de generer les QR codes.");
          setQrCodeUrls({});
        }
      } finally {
        if (!cancelled) {
          setQrCodesLoading(false);
        }
      }
    };

    void generateQrCodes();

    return () => {
      cancelled = true;
    };
  }, [linkedCampaignGames, selectedCampaignId]);

  const filteredPrizes = useMemo(
    () =>
      detailState.prizes.filter(
        (prize) => prizeStatusFilter === "tous" || prize.status === prizeStatusFilter,
      ),
    [detailState.prizes, prizeStatusFilter],
  );

  const exportPrizesCsv = () => {
    const csv = [
      ["Joueur", "Email", "Commerce", "Lot gagne", "Date du gain", "Statut"],
      ...filteredPrizes.map((prize) => [
        prize.playerLabel,
        prize.playerEmail,
        prize.merchantName,
        prize.prizeLabel,
        prize.wonAtLabel,
        prize.status === "claimed"
          ? "Reclame"
          : prize.status === "expired"
            ? "Expire"
            : "En attente",
      ]),
    ]
      .map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `campagne-${selectedCampaignId ?? "animation"}-lots-gagnes.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const sanitizeFileName = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9-_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();

  const downloadQrCode = (game: CampaignGameOption) => {
    const dataUrl = qrCodeUrls[game.id];
    if (!dataUrl) {
      return;
    }

    const anchor = document.createElement("a");
    anchor.href = dataUrl;
    anchor.download = `proxiplay-qr-${sanitizeFileName(game.merchantName || game.title || game.id)}.png`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  };

  const downloadAllQrCodesPdf = () => {
    if (!selectedCampaign || linkedCampaignGames.length === 0) {
      return;
    }

    const readyGames = linkedCampaignGames.filter((game) => Boolean(qrCodeUrls[game.id]));
    if (readyGames.length === 0) {
      return;
    }

    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const qrSize = 200;
    const qrX = (pageWidth - qrSize) / 2;

    readyGames.forEach((game, index) => {
      if (index > 0) {
        pdf.addPage();
      }

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(18);
      pdf.text(selectedCampaign.name, pageWidth / 2, 72, { align: "center" });

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(14);
      pdf.text(game.merchantName, pageWidth / 2, 108, { align: "center" });

      pdf.addImage(qrCodeUrls[game.id], "PNG", qrX, 150, qrSize, qrSize);

      pdf.setFontSize(11);
      pdf.text(buildGameDeepLinkUrl(game), pageWidth / 2, 382, { align: "center" });
    });

    pdf.save(`proxiplay-${sanitizeFileName(selectedCampaign.name)}-qr-codes.pdf`);
  };

  const updatePrizeStatus = async (
    prize: CampaignPrizeRow,
    nextStatus: "claimed" | "expired",
  ) => {
    const confirmationMessage =
      nextStatus === "claimed"
        ? `Confirmer la remise du lot a ${prize.playerLabel} ?`
        : `Confirmer le passage du lot de ${prize.playerLabel} en expire ?`;

    if (!window.confirm(confirmationMessage)) {
      return;
    }

    setPrizeActionFeedback(null);
    setPrizeActionLoadingIds((current) => new Set(current).add(prize.id));

    const previousPrizes = detailState.prizes;

    setDetailState((current) => ({
      ...current,
      prizes: current.prizes.map((entry) =>
        entry.id === prize.id ? { ...entry, status: nextStatus } : entry,
      ),
    }));

    try {
      await updateDoc(doc(db, "prizes", prize.id), {
        status: nextStatus === "claimed" ? "reclame" : "expire",
        ...(nextStatus === "claimed" ? { claimed_at: serverTimestamp() } : {}),
      });

      setPrizeActionFeedback(
        nextStatus === "claimed"
          ? `Lot marque comme reclame pour ${prize.playerLabel}.`
          : `Lot marque comme expire pour ${prize.playerLabel}.`,
      );
    } catch (error) {
      console.error(error);
      setDetailState((current) => ({
        ...current,
        prizes: previousPrizes,
      }));
      setPrizeActionFeedback(
        toErrorMessage(error, "Impossible de mettre a jour le statut du lot."),
      );
    } finally {
      setPrizeActionLoadingIds((current) => {
        const next = new Set(current);
        next.delete(prize.id);
        return next;
      });
    }
  };

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

  const filteredMerchantOptions = useMemo(() => {
    const normalizedSearch = merchantSearch
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    const selectedMerchantIds = new Set(participantMerchants.map((merchant) => merchant.merchantId));
    const availableMerchants = merchants.filter((merchant) => !selectedMerchantIds.has(merchant.id));

    if (!normalizedSearch) {
      return availableMerchants.slice(0, 8);
    }

    return availableMerchants
      .filter((merchant) => {
        const haystack = `${merchant.name} ${merchant.city}`
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        return haystack.includes(normalizedSearch);
      })
      .slice(0, 8);
  }, [merchantSearch, merchants, participantMerchants]);

  const merchantCount = useMemo(() => participantMerchants.length, [participantMerchants]);

  const handleNewCampaign = () => {
    setSelectedCampaignId(null);
    setParticipantMerchants([]);
    setMerchantSearch("");
    Object.values(merchantImagePreviewUrls).forEach((previewUrl) => {
      if (previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    });
    setMerchantImagePreviewUrls({});
    setFormState(buildInitialFormState());
    setFormFeedback(null);
    setFormFeedbackTone(null);
  };

  const handleEditCampaign = (campaignId: string) => {
    setSelectedCampaignId(campaignId);
    window.requestAnimationFrame(() => {
      formSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
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

  const handleAddMerchant = (merchant: MerchantOption) => {
    setParticipantMerchants((current) => [
      ...current,
      {
        merchantId: merchant.id,
        merchantName: merchant.name,
        merchantCity: merchant.city,
        secondaryPrize: "",
        secondaryPrizeDescription: "",
        prizeCount: "1",
        gameEndDate: formState.endDate,
        gameImageUrl: "",
        gameImageFile: null,
      },
    ]);
    setMerchantSearch("");
  };

  const updateParticipantMerchant = (
    merchantId: string,
    field: "secondaryPrize" | "secondaryPrizeDescription" | "prizeCount" | "gameEndDate",
    value: string,
  ) => {
    setParticipantMerchants((current) =>
      current.map((merchant) =>
        merchant.merchantId === merchantId ? { ...merchant, [field]: value } : merchant,
      ),
    );
  };

  const handleParticipantMerchantImageChange = (
    merchantId: string,
    file: File | null,
  ) => {
    setParticipantMerchants((current) =>
      current.map((merchant) => {
        if (merchant.merchantId !== merchantId) {
          return merchant;
        }

        setMerchantImagePreviewUrls((currentPreviews) => {
          const previousPreviewUrl = currentPreviews[merchantId];
          if (previousPreviewUrl?.startsWith("blob:")) {
            URL.revokeObjectURL(previousPreviewUrl);
          }

          if (!file) {
            const { [merchantId]: _removed, ...rest } = currentPreviews;
            return rest;
          }

          return {
            ...currentPreviews,
            [merchantId]: URL.createObjectURL(file),
          };
        });

        return {
          ...merchant,
          gameImageFile: file,
        };
      }),
    );
  };

  const removeParticipantMerchant = (merchantId: string) => {
    setMerchantImagePreviewUrls((current) => {
      const previewUrl = current[merchantId];
      if (previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }

      const { [merchantId]: _removed, ...rest } = current;
      return rest;
    });

    setParticipantMerchants((current) => {
      return current.filter((merchant) => merchant.merchantId !== merchantId);
    });
  };

  const handleSaveCampaign = async () => {
    setSaving(true);
    setFormFeedback(null);
    setFormFeedbackTone(null);

    try {
      const trimmedName = formState.name.trim();
      if (!trimmedName) {
        throw new Error("Le nom de l animation est obligatoire.");
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

      const merchantIds = [...new Set(participantMerchants.map((merchant) => merchant.merchantId))];

      if (merchantIds.length === 0) {
        throw new Error("Ajoute au moins un commerce participant avant de creer l animation.");
      }

      const merchantWithoutImage = participantMerchants.find(
        (merchant) => !merchant.gameImageFile && !merchant.gameImageUrl.trim(),
      );

      if (merchantWithoutImage) {
        throw new Error("L image du jeu est obligatoire pour chaque commerce participant.");
      }

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

      const campaignRef = formState.id
        ? doc(db, "animations", formState.id)
        : doc(collection(db, "animations"));
      const campaignId = campaignRef.id;

      const coverImageUrl = formState.coverImageFile
        ? await uploadCampaignImage(campaignId, formState.coverImageFile, "cover")
        : formState.coverImageUrl.trim() || "";
      const prizeImageUrl = formState.prizeImageFile
        ? await uploadCampaignImage(campaignId, formState.prizeImageFile, "prize")
        : formState.prizeImageUrl.trim() || "";

      if (formState.id) {
        await updateDoc(campaignRef, {
          ...basePayload,
          cover_image: coverImageUrl,
          prize_image: prizeImageUrl,
          updated_at: serverTimestamp(),
        });
      } else {
        await setDoc(campaignRef, {
          ...basePayload,
          cover_image: coverImageUrl,
          prize_image: prizeImageUrl,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        });
      }

      const existingGamesByMerchantId = new Map(
        games
          .filter((game) => game.campaignId === campaignId && game.merchantId)
          .map((game) => [game.merchantId as string, game]),
      );

      const syncedGames = await Promise.all(
        participantMerchants.map(async (merchant) => {
          const prizeCount = Math.max(1, Number.parseInt(merchant.prizeCount || "1", 10) || 1);
          const gameEndDate = parseDateInput(merchant.gameEndDate) ?? endDate;
          const existingGame = existingGamesByMerchantId.get(merchant.merchantId);
          const gameRef = existingGame
            ? doc(db, "games", existingGame.id)
            : doc(collection(db, "games"));
          const photoUrl = merchant.gameImageFile
            ? await uploadGameImage(merchant.merchantId, merchant.gameImageFile)
            : merchant.gameImageUrl.trim();
          const gamePayload = {
            name: `${merchant.merchantName} — ${trimmedName}`,
            type: "animation",
            access_mode: "qr_only",
            animation_id: campaignId,
            enseigne_ref: doc(db, "enseignes", merchant.merchantId),
            enseigne_name: merchant.merchantName,
            merchant_id: merchant.merchantId,
            prize_description: merchant.secondaryPrize.trim(),
            prize_presentation: merchant.secondaryPrizeDescription.trim(),
            prize_count: prizeCount,
            ...(photoUrl ? { photo: photoUrl } : {}),
            end_date: gameEndDate,
            status: "active",
            updated_at: serverTimestamp(),
          };

          if (existingGame) {
            await updateDoc(gameRef, gamePayload);

            try {
              const instantWinnersRef = collection(gameRef, "instant_winners");
              const existingInstantWinnersSnapshot = await getDocs(
                query(instantWinnersRef, where("hasWinner", "==", false)),
              );
              const existingCount = existingInstantWinnersSnapshot.size;

              if (existingCount < prizeCount) {
                const missingCount = prizeCount - existingCount;
                const nowMs = Date.now();
                const endMs = gameEndDate.toMillis();
                const safeEndMs = Math.max(nowMs, endMs);
                const intervalMs =
                  prizeCount > 0 ? (safeEndMs - nowMs) / prizeCount : 0;
                const batch = writeBatch(db);

                for (let index = 0; index < missingCount; index += 1) {
                  const position = existingCount + index;
                  const winnerDateMs = Math.min(
                    safeEndMs,
                    Math.round(nowMs + position * intervalMs),
                  );
                  const instantWinnerRef = doc(instantWinnersRef);

                  batch.set(instantWinnerRef, {
                    hasWinner: false,
                    date: Timestamp.fromMillis(winnerDateMs),
                    secondary_prize_name: merchant.secondaryPrize.trim(),
                    secondary_prize_presentation:
                      merchant.secondaryPrizeDescription.trim(),
                  });
                }

                await batch.commit();
              }
            } catch (error) {
              console.error("Impossible de generer les instant_winners du jeu.", {
                gameId: gameRef.id,
                merchantId: merchant.merchantId,
                error,
              });
            }

            return {
              ...existingGame,
              title: gamePayload.name,
              merchantId: merchant.merchantId,
              merchantName: merchant.merchantName,
              merchantCity: merchant.merchantCity,
              campaignId,
              endDate: gameEndDate.toDate().toISOString(),
              photo: photoUrl || null,
              secondaryPrize: merchant.secondaryPrize.trim(),
              prizeCount,
            } satisfies CampaignGameOption;
          }

          await setDoc(gameRef, {
            ...gamePayload,
            created_at: serverTimestamp(),
          });

          try {
            const instantWinnersRef = collection(gameRef, "instant_winners");
            const existingInstantWinnersSnapshot = await getDocs(
              query(instantWinnersRef, where("hasWinner", "==", false)),
            );
            const existingCount = existingInstantWinnersSnapshot.size;

            if (existingCount < prizeCount) {
              const missingCount = prizeCount - existingCount;
              const nowMs = Date.now();
              const endMs = gameEndDate.toMillis();
              const safeEndMs = Math.max(nowMs, endMs);
              const intervalMs =
                prizeCount > 0 ? (safeEndMs - nowMs) / prizeCount : 0;
              const batch = writeBatch(db);

              for (let index = 0; index < missingCount; index += 1) {
                const position = existingCount + index;
                const winnerDateMs = Math.min(
                  safeEndMs,
                  Math.round(nowMs + position * intervalMs),
                );
                const instantWinnerRef = doc(instantWinnersRef);

                batch.set(instantWinnerRef, {
                  hasWinner: false,
                  date: Timestamp.fromMillis(winnerDateMs),
                  secondary_prize_name: merchant.secondaryPrize.trim(),
                  secondary_prize_presentation:
                    merchant.secondaryPrizeDescription.trim(),
                });
              }

              await batch.commit();
            }
          } catch (error) {
            console.error("Impossible de generer les instant_winners du jeu.", {
              gameId: gameRef.id,
              merchantId: merchant.merchantId,
              error,
            });
          }

          return {
            id: gameRef.id,
            title: gamePayload.name,
            merchantId: merchant.merchantId,
            merchantName: merchant.merchantName,
            merchantCity: merchant.merchantCity,
            startDate: null,
            endDate: gameEndDate.toDate().toISOString(),
            photo: photoUrl || null,
            campaignId,
            secondaryPrize: merchant.secondaryPrize.trim(),
            prizeCount,
          } satisfies CampaignGameOption;
        }),
      );

      setGames((current) => {
        const nextGames = current.filter(
          (game) =>
            game.campaignId !== campaignId ||
            !participantMerchants.some((merchant) => merchant.merchantId === game.merchantId),
        );
        return [...nextGames, ...syncedGames].sort((left, right) =>
          left.title.localeCompare(right.title, "fr"),
        );
      });

      setSelectedCampaignId(campaignId);
      setFormFeedback("Animation enregistree avec succes.");
      setFormFeedbackTone("success");
    } catch (error) {
      console.error(error);
      setFormFeedback(toErrorMessage(error, "Impossible d enregistrer l animation."));
      setFormFeedbackTone("error");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusAction = async (campaign: CampaignListItem) => {
    const nextStatus: CampaignStatus = campaign.status === "active" ? "ended" : "active";
    setStatusActionLoadingId(campaign.id);

    try {
      await updateDoc(doc(db, "animations", campaign.id), {
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

  const handleDeleteCampaign = async (campaign: CampaignListItem) => {
    if (campaign.status !== "draft" && campaign.status !== "ended") {
      return;
    }

    const confirmed = window.confirm("Supprimer cette animation ?");
    if (!confirmed) {
      return;
    }

    setDeleteActionLoadingId(campaign.id);

    try {
      const linkedGamesSnapshot = await getDocs(
        query(collection(db, "games"), where("animation_id", "==", campaign.id)),
      );
      const batch = writeBatch(db);

      batch.delete(doc(db, "animations", campaign.id));
      linkedGamesSnapshot.docs.forEach((gameSnapshot) => {
        batch.delete(gameSnapshot.ref);
      });

      await batch.commit();

      if (selectedCampaignId === campaign.id) {
        setSelectedCampaignId(null);
      }
    } catch (error) {
      console.error(error);
      window.alert(toErrorMessage(error, "Impossible de supprimer cette animation."));
    } finally {
      setDeleteActionLoadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3">
        <div>
          <span className="text-[11px] uppercase tracking-[0.14em] text-[#7B7B7B]">
            Animations
          </span>
          <h1 className="mt-1 text-[28px] font-medium text-[#1A1A1A]">
            Gestion des animations
          </h1>
          <p className="mt-2 max-w-[780px] text-[13px] text-[#666666]">
            Cree, active et pilote les animations collectives, les jeux associes
            et le tirage final des joueurs qualifies.
          </p>
        </div>
      </header>

      <section className={cardClassName}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-[16px] font-medium text-[#1A1A1A]">
              Liste des animations
            </h2>
            <p className="mt-1 text-[12px] text-[#7B7B7B]">
              Vue d ensemble des animations et actions rapides.
            </p>
          </div>
        </div>

        {campaignsLoading ? (
          <div className="py-10 text-[12.5px] text-[#999999]">
            Chargement des animations...
          </div>
        ) : campaignsError ? (
          <div className="rounded-[10px] border border-[#F5C9C9] bg-[#FFF5F5] px-4 py-3 text-[12px] text-[#A32D2D]">
            {campaignsError}
          </div>
        ) : campaigns.length === 0 ? (
          <div className="py-10 text-[12.5px] text-[#999999]">
            Aucune animation pour le moment.
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
                          className={buttonSecondaryClassName}
                          onClick={() => handleEditCampaign(campaign.id)}
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          className={buttonPrimaryClassName}
                          disabled={
                            statusActionLoadingId === campaign.id ||
                            deleteActionLoadingId === campaign.id
                          }
                          onClick={() => void handleStatusAction(campaign)}
                        >
                          {statusActionLoadingId === campaign.id
                            ? "Mise a jour..."
                            : campaign.status === "active"
                              ? "Terminer"
                              : "Activer"}
                        </button>
                        {campaign.status === "draft" || campaign.status === "ended" ? (
                          <button
                            type="button"
                            className="rounded-[10px] border border-[#F5C9C9] bg-white px-4 py-[10px] text-[12px] font-medium text-[#A32D2D] transition hover:bg-[#FFF5F5] disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={deleteActionLoadingId === campaign.id}
                            onClick={() => void handleDeleteCampaign(campaign)}
                          >
                            {deleteActionLoadingId === campaign.id
                              ? "Suppression..."
                              : "Supprimer"}
                          </button>
                        ) : null}
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
        <div ref={formSectionRef} className={cardClassName}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-medium text-[#1A1A1A]">
                {formState.id ? "Edition animation" : "Nouvelle animation"}
              </h2>
              <p className="mt-1 text-[12px] text-[#7B7B7B]">
                Configure l animation, ses visuels et les jeux participants.
              </p>
            </div>
            {formState.id ? (
              <button type="button" className={buttonSecondaryClassName} onClick={handleNewCampaign}>
                Nouvelle animation
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
                placeholder="Animation printemps"
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
                placeholder="Description de l animation"
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
                  <img src={coverPreviewUrl} alt="Banniere animation" className="h-[150px] w-full object-cover" />
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
                  <img src={prizePreviewUrl} alt="Lot animation" className="h-[150px] w-full object-cover" />
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
                  Commerces participants
                </h3>
                <p className="mt-1 text-[12px] text-[#7B7B7B]">
                  Recherche et configure les commerces qui recevront un jeu animation.
                </p>
              </div>
              <span className="rounded-full bg-[#F7F7F5] px-3 py-[6px] text-[11px] text-[#666666]">
                {merchantCount} commerce(s)
              </span>
            </div>

            <div className="mt-4">
              <label className="grid gap-2">
                <span className="text-[12px] font-medium text-[#666666]">
                  Recherche commerçant
                </span>
                <input
                  className={inputClassName}
                  value={merchantSearch}
                  onChange={(event) => setMerchantSearch(event.target.value)}
                  placeholder="Rechercher par nom ou ville"
                />
              </label>

              {merchantsLoading ? (
                <div className="mt-4 text-[12.5px] text-[#999999]">
                  Chargement des commercants...
                </div>
              ) : merchantsError ? (
                <div className="mt-4 rounded-[10px] border border-[#F5C9C9] bg-[#FFF5F5] px-4 py-3 text-[12px] text-[#A32D2D]">
                  {merchantsError}
                </div>
              ) : filteredMerchantOptions.length > 0 ? (
                <div className="mt-3 rounded-[12px] border border-[#E8E8E4] bg-white">
                  {filteredMerchantOptions.map((merchant, index) => (
                    <button
                      key={merchant.id}
                      type="button"
                      onClick={() => handleAddMerchant(merchant)}
                      className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-[#FAFAF8] ${
                        index < filteredMerchantOptions.length - 1
                          ? "border-b border-[#F0F0EC]"
                          : ""
                      }`}
                    >
                      <div>
                        <p className="text-[12.5px] font-medium text-[#1A1A1A]">
                          {merchant.name}
                        </p>
                        <p className="mt-1 text-[11px] text-[#7B7B7B]">
                          {merchant.city || "Ville non renseignee"}
                        </p>
                      </div>
                      <span className="text-[11px] font-medium text-[#639922]">
                        Ajouter
                      </span>
                    </button>
                  ))}
                </div>
              ) : merchantSearch.trim().length > 0 ? (
                <div className="mt-4 text-[12.5px] text-[#999999]">
                  Aucun commerce ne correspond a la recherche.
                </div>
              ) : null}
            </div>

            {participantMerchants.length === 0 ? (
              <div className="mt-4 text-[12.5px] text-[#999999]">
                Aucun commerce ajoute pour le moment.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {participantMerchants.map((merchant) => (
                  <div
                    key={merchant.merchantId}
                    className="rounded-[12px] border border-[#E8E8E4] bg-[#FAFAF8] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[13px] font-medium text-[#1A1A1A]">
                          {merchant.merchantName}
                        </p>
                        <p className="mt-1 text-[11px] text-[#7B7B7B]">
                          {merchant.merchantCity || "Ville non renseignee"}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="rounded-[8px] border border-[#E8E8E4] bg-white px-3 py-[8px] text-[11px] font-medium text-[#666666] transition hover:bg-[#F7F7F5]"
                        onClick={() => removeParticipantMerchant(merchant.merchantId)}
                      >
                        Supprimer
                      </button>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <label className="grid gap-2">
                        <span className="text-[12px] font-medium text-[#666666]">
                          Lot secondaire
                        </span>
                        <input
                          className={inputClassName}
                          value={merchant.secondaryPrize}
                          onChange={(event) =>
                            updateParticipantMerchant(
                              merchant.merchantId,
                              "secondaryPrize",
                              event.target.value,
                            )
                          }
                          placeholder="Description du lot"
                        />
                      </label>

                      <label className="grid gap-2">
                        <span className="text-[12px] font-medium text-[#666666]">
                          Description du lot (facultatif)
                        </span>
                        <textarea
                          className={`${inputClassName} min-h-[96px] resize-y`}
                          value={merchant.secondaryPrizeDescription}
                          onChange={(event) =>
                            updateParticipantMerchant(
                              merchant.merchantId,
                              "secondaryPrizeDescription",
                              event.target.value,
                            )
                          }
                          placeholder="Precisions a afficher pour presenter le lot"
                        />
                      </label>

                      <label className="grid gap-2">
                        <span className="text-[12px] font-medium text-[#666666]">
                          Nombre de lots disponibles
                        </span>
                        <input
                          type="number"
                          min={1}
                          className={inputClassName}
                          value={merchant.prizeCount}
                          onChange={(event) =>
                            updateParticipantMerchant(
                              merchant.merchantId,
                              "prizeCount",
                              event.target.value,
                            )
                          }
                        />
                      </label>

                      <label className="grid gap-2">
                        <span className="text-[12px] font-medium text-[#666666]">
                          Date de fin du jeu
                        </span>
                        <input
                          type="date"
                          className={inputClassName}
                          value={merchant.gameEndDate}
                          onChange={(event) =>
                            updateParticipantMerchant(
                              merchant.merchantId,
                              "gameEndDate",
                              event.target.value,
                            )
                          }
                        />
                      </label>
                    </div>

                    <div className="mt-4 rounded-[10px] border border-[#E8E8E4] bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[12px] font-medium text-[#666666]">
                          Image du jeu
                        </span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(event) =>
                            handleParticipantMerchantImageChange(
                              merchant.merchantId,
                              event.target.files?.[0] ?? null,
                            )
                          }
                          className="block max-w-[180px] text-[11px] text-[#666666]"
                        />
                      </div>
                      <div className="mt-3 overflow-hidden rounded-[10px] border border-[#E8E8E4] bg-[#FAFAF8]">
                        {merchantImagePreviewUrls[merchant.merchantId] || merchant.gameImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={merchantImagePreviewUrls[merchant.merchantId] || merchant.gameImageUrl}
                            alt={`Jeu ${merchant.merchantName}`}
                            className="h-[150px] w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-[150px] items-center justify-center text-[12px] text-[#A32D2D]">
                            Image obligatoire pour ce jeu d animation
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
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
              {saving ? "Enregistrement..." : formState.id ? "Mettre a jour" : "Creer l animation"}
            </button>
          </div>
        </div>

        <div className={`${cardClassName} h-fit`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-medium text-[#1A1A1A]">
                Détail animation
              </h2>
              <p className="mt-1 text-[12px] text-[#7B7B7B]">
                Suivi des qualifies, participants et tirage final.
              </p>
            </div>
          </div>

          {!selectedCampaignId || !selectedCampaign ? (
            <div className="mt-6 rounded-[10px] border border-dashed border-[#D9D8D3] bg-[#FAFAF8] px-4 py-10 text-center text-[12.5px] text-[#999999]">
              Selectionne une animation depuis la liste pour voir son detail.
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
                </div>

                {detailState.winner ? (
                  <div className="mt-4 rounded-[10px] border border-[#E8E8E4] bg-[#FAFAF8] px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-[#7B7B7B]">
                      Gagnant actuel
                    </p>
                    <p className="mt-2 text-[14px] font-medium text-[#1A1A1A]">
                      {getPlayerFirstName(detailState.winner.label, detailState.winner.email)}
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

              <div className="rounded-[12px] border border-[#E8E8E4] bg-white p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h3 className="text-[14px] font-medium text-[#1A1A1A]">
                      Lots gagnes
                    </h3>
                    <p className="mt-1 text-[12px] text-[#7B7B7B]">
                      Gains instantanes associes a cette animation.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: "tous", label: "Tous" },
                      { id: "pending", label: "En attente" },
                      { id: "claimed", label: "Reclames" },
                      { id: "expired", label: "Expires" },
                    ].map((filter) => (
                      <button
                        key={filter.id}
                        type="button"
                        onClick={() =>
                          setPrizeStatusFilter(filter.id as CampaignPrizeStatusFilter)
                        }
                        className={`rounded-full px-3 py-[7px] text-[11px] font-medium transition ${
                          prizeStatusFilter === filter.id
                            ? "border border-[#639922] bg-[#EAF3DE] text-[#3B6D11]"
                            : "border border-[#E8E8E4] bg-white text-[#666666] hover:bg-[#F7F7F5]"
                        }`}
                      >
                        {filter.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      className={buttonSecondaryClassName}
                      onClick={exportPrizesCsv}
                      disabled={filteredPrizes.length === 0}
                    >
                      Exporter CSV
                    </button>
                  </div>
                </div>

                {prizeActionFeedback ? (
                  <div className="mt-4 rounded-[10px] border border-[#E8E8E4] bg-[#FAFAF8] px-4 py-3 text-[12px] text-[#666666]">
                    {prizeActionFeedback}
                  </div>
                ) : null}

                {detailState.prizesError ? (
                  <div className="mt-4 rounded-[10px] border border-[#F5C9C9] bg-[#FFF5F5] px-4 py-3 text-[12px] text-[#A32D2D]">
                    {detailState.prizesError}
                  </div>
                ) : detailState.prizes.length === 0 ? (
                  <div className="mt-4 text-[12.5px] text-[#999999]">
                    Aucun lot gagne pour cette animation.
                  </div>
                ) : filteredPrizes.length === 0 ? (
                  <div className="mt-4 text-[12.5px] text-[#999999]">
                    Aucun lot ne correspond au filtre selectionne.
                  </div>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full">
                      <thead>
                        <tr className="border-b border-[#F0F0EC]">
                          <th className={tableHeadClassName}>Joueur</th>
                          <th className={tableHeadClassName}>Commerce</th>
                          <th className={tableHeadClassName}>Lot gagne</th>
                          <th className={tableHeadClassName}>Date du gain</th>
                          <th className={tableHeadClassName}>Statut</th>
                          <th className={`${tableHeadClassName} text-right`}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPrizes.map((prize) => (
                          <tr key={prize.id} className="border-b border-[#F0F0EC] last:border-b-0">
                            <td className={tableCellClassName}>
                              <div>
                                <p className="font-medium">{prize.playerLabel}</p>
                                <p className="mt-1 text-[11px] text-[#7B7B7B]">{prize.playerEmail}</p>
                              </div>
                            </td>
                            <td className={tableCellClassName}>{prize.merchantName}</td>
                            <td className={tableCellClassName}>{prize.prizeLabel}</td>
                            <td className={tableCellClassName}>{prize.wonAtLabel}</td>
                            <td className={tableCellClassName}>
                              <span
                                className={`inline-flex rounded-full px-3 py-[4px] text-[11px] font-medium ${
                                  prize.status === "claimed"
                                    ? "bg-[#EAF3DE] text-[#3B6D11]"
                                  : prize.status === "expired"
                                      ? "bg-[#F1EFE8] text-[#5F5E5A]"
                                      : "bg-[#FAEEDA] text-[#633806]"
                                }`}
                              >
                                {prize.status === "claimed"
                                  ? "Reclame"
                                  : prize.status === "expired"
                                    ? "Expire"
                                    : "En attente"}
                              </span>
                            </td>
                            <td className={`${tableCellClassName} text-right`}>
                              {prize.status === "pending" ? (
                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    className="rounded-[8px] border border-[#639922] bg-[#639922] px-3 py-[8px] text-[11px] font-medium text-white transition hover:bg-[#57881D] disabled:cursor-not-allowed disabled:opacity-50"
                                    disabled={prizeActionLoadingIds.has(prize.id)}
                                    onClick={() => void updatePrizeStatus(prize, "claimed")}
                                  >
                                    {prizeActionLoadingIds.has(prize.id)
                                      ? "Mise a jour..."
                                      : "Valider reclamation"}
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded-[8px] border border-[#D8D7D1] bg-white px-3 py-[8px] text-[11px] font-medium text-[#666666] transition hover:bg-[#F7F7F5] disabled:cursor-not-allowed disabled:opacity-50"
                                    disabled={prizeActionLoadingIds.has(prize.id)}
                                    onClick={() => void updatePrizeStatus(prize, "expired")}
                                  >
                                    Marquer expire
                                  </button>
                                </div>
                              ) : (
                                <span className="text-[11px] text-[#999999]">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="rounded-[12px] border border-[#E8E8E4] bg-white p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h3 className="text-[14px] font-medium text-[#1A1A1A]">
                      QR Codes
                    </h3>
                    <p className="mt-1 text-[12px] text-[#7B7B7B]">
                      Deep links des jeux associes a cette animation.
                    </p>
                  </div>
                  <button
                    type="button"
                    className={buttonSecondaryClassName}
                    onClick={downloadAllQrCodesPdf}
                    disabled={qrCodesLoading || linkedCampaignGames.length === 0}
                  >
                    Tout telecharger
                  </button>
                </div>

                {qrCodesError ? (
                  <div className="mt-4 rounded-[10px] border border-[#F5C9C9] bg-[#FFF5F5] px-4 py-3 text-[12px] text-[#A32D2D]">
                    {qrCodesError}
                  </div>
                ) : qrCodesLoading ? (
                  <div className="mt-4 text-[12.5px] text-[#999999]">
                    Generation des QR codes...
                  </div>
                ) : linkedCampaignGames.length === 0 ? (
                  <div className="mt-4 text-[12.5px] text-[#999999]">
                    Aucun jeu n est rattache a cette animation.
                  </div>
                ) : (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {linkedCampaignGames.map((game) => (
                      <div
                        key={game.id}
                        className="rounded-[12px] border border-[#E8E8E4] bg-[#FAFAF8] p-4"
                      >
                        <div className="flex min-h-[28px] items-center justify-center text-center text-[12.5px] font-medium text-[#1A1A1A]">
                          {game.merchantName}
                        </div>
                        <div className="mt-3 flex justify-center">
                          <div className="flex h-[200px] w-[200px] items-center justify-center rounded-[10px] border border-[#E8E8E4] bg-white p-2">
                            {qrCodeUrls[game.id] ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={qrCodeUrls[game.id]}
                                alt={`QR code ${game.merchantName}`}
                                className="h-[200px] w-[200px]"
                              />
                            ) : (
                              <span className="text-[11px] text-[#999999]">
                                QR indisponible
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="mt-3 text-center text-[12px] text-[#666666]">
                          {game.merchantName}
                        </p>
                        <div className="mt-4 flex justify-center">
                          <button
                            type="button"
                            className={buttonSecondaryClassName}
                            onClick={() => downloadQrCode(game)}
                            disabled={!qrCodeUrls[game.id]}
                          >
                            Telecharger
                          </button>
                        </div>
                      </div>
                    ))}
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
