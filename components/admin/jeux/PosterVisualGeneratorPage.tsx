"use client";

import QRCode from "qrcode";
import Link from "next/link";
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { PosterOverlayEditor } from "@/components/admin/jeux/PosterOverlayEditor";
import { PosterPreview } from "@/components/admin/jeux/PosterPreview";
import { buildGamePosterDeepLink } from "@/lib/admin/gamePoster";
import {
  composePosterWithOverlay,
  buildPosterFallbackBackground,
  buildPosterPreviewDataUrl,
  createDefaultOverlayState,
  exportPosterPdf,
  exportPosterPng,
  generatePosterBackgroundWithAI,
  type PosterOverlayState,
  type PosterVisualFormat,
  type PosterVisualGameData,
} from "@/lib/admin/posterVisualGenerator";
import { db } from "@/lib/firebase/client-app";

type PosterVisualGeneratorPageProps = {
  gameId: string;
};

type FirestoreGameDocument = {
  name?: string;
  title?: string;
  description?: string;
  conditions?: string;
  merchantName?: string;
  enseigne_name?: string;
  merchantId?: string;
  imageUrl?: string;
  photo?: string;
  coverUrl?: string;
  main_prize_title?: string;
  main_prize_description?: string;
  prize_value?: number;
  secondary_prizes?: Array<{
    name?: string;
    presentation?: string;
    description?: string;
  }> | null;
  animation_id?: string | null;
  campaign_id?: string | null;
  end_date?: { toDate?: () => Date } | null;
  prohibited_for_minors?: boolean;
  restrictedToAdults?: boolean;
  ageRestriction?: string | number | boolean | null;
  commerce_type?: string;
  merchantCategory?: string;
};

function readText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = value?.trim();

    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function sanitizeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function normalizePrizeLabel(value: string) {
  const normalized = readText(value);

  if (!normalized) {
    return "";
  }

  if (normalized.toLowerCase() === "lot principal configure") {
    return "";
  }

  return normalized;
}

function formatDate(date: Date | null) {
  if (!date) {
    return "Date a definir";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
  }).format(date);
}

async function toDataUrlIfPossible(imageUrl: string | null) {
  if (!imageUrl) {
    return null;
  }

  try {
    const response = await fetch(imageUrl);

    if (!response.ok) {
      return imageUrl;
    }

    const blob = await response.blob();

    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : imageUrl);
      reader.onerror = () => reject(new Error("Impossible de convertir l image du lot."));
      reader.readAsDataURL(blob);
    });
  } catch {
    return imageUrl;
  }
}

function mapGameData(
  gameId: string,
  data: FirestoreGameDocument,
  qrCodeDataUrl: string,
  imageUrl: string | null,
) {
  const endDate = data.end_date?.toDate?.() ?? null;
  const mainPrizeTitle = readText(data.main_prize_title);
  const mainPrizeDescription = readText(data.main_prize_description);
  const secondaryPrize = Array.isArray(data.secondary_prizes)
    ? data.secondary_prizes.find((item) => readText(item?.presentation, item?.description, item?.name))
    : null;
  const prizeLabel =
    normalizePrizeLabel(mainPrizeTitle) ||
    (typeof data.prize_value === "number" ? `${data.prize_value} EUR` : "") ||
    normalizePrizeLabel(
      readText(
        mainPrizeDescription,
        secondaryPrize ? readText(secondaryPrize.presentation, secondaryPrize.description, secondaryPrize.name) : "",
        data.description,
      ),
    ) ||
    "Lot a gagner";

  return {
    id: gameId,
    title: readText(data.title, data.name, "Jeu ProxiPlay"),
    merchantName: readText(data.merchantName, data.enseigne_name, "Commerce partenaire"),
    description: readText(data.description, data.conditions),
    imageUrl,
    prizeLabel,
    conditions: readText(data.conditions, data.description, "Voir conditions en magasin."),
    deadlineLabel: formatDate(endDate),
    qrCodeDataUrl,
    restrictedToAdults:
      data.prohibited_for_minors === true ||
      data.restrictedToAdults === true ||
      Boolean(data.ageRestriction),
    merchantCategory: readText(data.commerce_type, data.merchantCategory, "commerce local"),
  } satisfies PosterVisualGameData;
}

export function PosterVisualGeneratorPage({ gameId }: PosterVisualGeneratorPageProps) {
  const [gameData, setGameData] = useState<PosterVisualGameData | null>(null);
  const [format, setFormat] = useState<PosterVisualFormat>("a4-portrait");
  const [overlay, setOverlay] = useState<PosterOverlayState | null>(null);
  const [backgroundDataUrl, setBackgroundDataUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [backgroundSource, setBackgroundSource] = useState<"fallback" | "ai">("fallback");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      setInfoMessage(null);

      try {
        let gameSnapshot = await getDoc(doc(db, "games", gameId));

        if (!gameSnapshot.exists()) {
          gameSnapshot = await getDoc(doc(db, "jeux", gameId));
        }

        if (!gameSnapshot.exists()) {
          throw new Error("Jeu introuvable.");
        }

        const game = gameSnapshot.data() as FirestoreGameDocument;
        const deepLink = buildGamePosterDeepLink({
          id: gameId,
          merchantId: readText(game.merchantId),
          animationId: readText(game.animation_id, game.campaign_id) || null,
        });
        const qrCodeOptions = {
          width: 720,
          margin: 0,
          color: {
            dark: "#1A1A1A",
            light: "#FFFFFF",
          },
        } as Parameters<typeof QRCode.toDataURL>[1];
        const qrCodeDataUrl = await QRCode.toDataURL(deepLink, qrCodeOptions);
        const rawImageUrl = readText(game.imageUrl, game.photo, game.coverUrl) || null;
        const resolvedImageUrl = await toDataUrlIfPossible(rawImageUrl);
        const mappedGameData = mapGameData(gameId, game, qrCodeDataUrl, resolvedImageUrl);
        const defaultOverlay = createDefaultOverlayState(mappedGameData);

        if (cancelled) {
          return;
        }

        setGameData(mappedGameData);
        setOverlay(defaultOverlay);
        setBackgroundDataUrl(buildPosterFallbackBackground("a4-portrait"));
        setBackgroundSource("fallback");
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Impossible de charger ce jeu.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [gameId]);

  useEffect(() => {
    setBackgroundDataUrl((current) =>
      current && backgroundSource === "ai" ? current : buildPosterFallbackBackground(format),
    );
  }, [backgroundSource, format]);

  useEffect(() => {
    if (!gameData || !overlay || !backgroundDataUrl) {
      setPreviewUrl(null);
      return;
    }

    setPreviewUrl(buildPosterPreviewDataUrl(gameData, backgroundDataUrl, format, overlay));
  }, [backgroundDataUrl, format, gameData, overlay]);

  const handleGenerate = async () => {
    if (!gameData || !overlay || generating) {
      return;
    }

    setGenerating(true);
    setError(null);
    setInfoMessage("Generation du fond IA en cours...");

    try {
      const result = await generatePosterBackgroundWithAI(gameData, format, overlay);
      setBackgroundDataUrl(result.imageDataUrl);
      setBackgroundSource("ai");
      setInfoMessage("Fond IA genere avec succes.");
    } catch (generationError) {
      setBackgroundDataUrl((current) => current || buildPosterFallbackBackground(format));
      setBackgroundSource((current) => (current === "ai" ? current : "fallback"));
      setError(
        generationError instanceof Error
          ? generationError.message
          : "Impossible de generer le fond IA.",
      );
      setInfoMessage("Le fond degrade ProxiPlay reste utilise.");
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadPng = async () => {
    if (!gameData || !overlay || !backgroundDataUrl) {
      return;
    }

    const fileName = sanitizeFileName(`poster-${gameData.merchantName}-${gameData.title}-${format}`);
    const svgMarkup = composePosterWithOverlay(gameData, backgroundDataUrl, format, overlay);

    await exportPosterPng(svgMarkup, format, fileName || `poster-${gameData.id}`);
  };

  const handleDownloadPdf = async () => {
    if (!gameData || !overlay || !backgroundDataUrl) {
      return;
    }

    const fileName = sanitizeFileName(`poster-${gameData.merchantName}-${gameData.title}-${format}`);
    const svgMarkup = composePosterWithOverlay(gameData, backgroundDataUrl, format, overlay);

    await exportPosterPdf(svgMarkup, format, fileName || `poster-${gameData.id}`);
  };

  if (loading) {
    return (
      <div className="rounded-[16px] border border-[#E8E8E4] bg-white p-6 text-[13px] text-[#666666]">
        Chargement du generateur de visuel et du QR code...
      </div>
    );
  }

  if (error && !gameData) {
    return (
      <div className="rounded-[16px] border border-[#F5C9C9] bg-[#FFF5F5] p-6 text-[13px] text-[#A32D2D]">
        {error}
      </div>
    );
  }

  if (!gameData || !overlay) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-[16px] border border-[#E8E8E4] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-[#A0134D]">
              Visuels IA ProxiPlay
            </p>
            <h1 className="mt-1 text-[24px] font-semibold text-[#1A1A1A]">{gameData.title}</h1>
            <p className="mt-1 text-[13px] text-[#666666]">
              {gameData.merchantName} - {gameData.prizeLabel}
            </p>
          </div>
          <Link
            href={`/admin/games/${gameId}`}
            className="rounded-[10px] border border-[#E8E8E4] bg-white px-4 py-[10px] text-[12px] font-medium text-[#1A1A1A] hover:bg-[#F7F7F5]"
          >
            Retour au jeu
          </Link>
        </div>

        <div className="grid gap-2 md:grid-cols-3">
          <div className="rounded-[12px] bg-[#FAFAF8] px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.08em] text-[#7B7B7B]">Titre exact</p>
            <p className="mt-1 text-[13px] font-medium text-[#1A1A1A]">{gameData.title}</p>
          </div>
          <div className="rounded-[12px] bg-[#FAFAF8] px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.08em] text-[#7B7B7B]">Lot exact</p>
            <p className="mt-1 text-[13px] font-medium text-[#1A1A1A]">{gameData.prizeLabel}</p>
          </div>
          <div className="rounded-[12px] bg-[#FAFAF8] px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.08em] text-[#7B7B7B]">Fin du jeu</p>
            <p className="mt-1 text-[13px] font-medium text-[#1A1A1A]">{gameData.deadlineLabel}</p>
          </div>
        </div>

        {error ? (
          <div className="rounded-[12px] border border-[#F5C9C9] bg-[#FFF5F5] px-4 py-3 text-[12px] text-[#A32D2D]">
            {error}
          </div>
        ) : null}

        {infoMessage ? (
          <div className="rounded-[12px] border border-[#DCE7F7] bg-[#F5FAFE] px-4 py-3 text-[12px] text-[#185FA5]">
            {infoMessage}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <PosterOverlayEditor
          format={format}
          overlay={overlay}
          onFormatChange={setFormat}
          onOverlayChange={(patch) => setOverlay((current) => (current ? { ...current, ...patch } : current))}
          onGenerate={() => void handleGenerate()}
          onDownloadPng={() => void handleDownloadPng()}
          onDownloadPdf={() => void handleDownloadPdf()}
          loading={generating}
          hasBackground={Boolean(backgroundDataUrl)}
        />
        <PosterPreview format={format} previewUrl={previewUrl} loading={generating} />
      </div>
    </div>
  );
}
