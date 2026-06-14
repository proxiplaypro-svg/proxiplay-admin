import { jsPDF } from "jspdf";
import { auth } from "@/lib/firebase/auth";

export type PosterVisualFormat = "a4-portrait" | "facebook-square" | "instagram-story";

export type PosterVisualGameData = {
  id: string;
  title: string;
  merchantName: string;
  description: string;
  imageUrl: string | null;
  prizeLabel: string;
  conditions: string;
  deadlineLabel: string;
  qrCodeDataUrl: string;
  restrictedToAdults: boolean;
  merchantCategory: string;
};

export type PosterOverlayState = {
  headline: string;
  headlineAccent: string;
  kicker: string;
  subline: string;
  ctaTitle: string;
  ctaButton: string;
  stepOneTitle: string;
  stepOneText: string;
  stepTwoTitle: string;
  stepTwoText: string;
  stepThreeTitle: string;
  stepThreeText: string;
  badgeText: string;
  promptMood: string;
};

export type PosterAiBackgroundResult = {
  imageDataUrl: string;
};

type PosterFormatSpec = {
  width: number;
  height: number;
  viewBox: string;
  label: string;
  exportScale: number;
};

const BRAND = {
  navy: "#29286A",
  frame: "#A0134D",
  pink: "#C21763",
  orange: "#F4A300",
  yellow: "#FFC62B",
  cream: "#F8F3EA",
  text: "#26233D",
  white: "#FFFFFF",
};

const FORMAT_SPECS: Record<PosterVisualFormat, PosterFormatSpec> = {
  "a4-portrait": {
    width: 1240,
    height: 1754,
    viewBox: "0 0 1240 1754",
    label: "A4 portrait",
    exportScale: 2,
  },
  "facebook-square": {
    width: 1080,
    height: 1080,
    viewBox: "0 0 1080 1080",
    label: "Facebook 1080x1080",
    exportScale: 2,
  },
  "instagram-story": {
    width: 1080,
    height: 1920,
    viewBox: "0 0 1080 1920",
    label: "Story 1080x1920",
    exportScale: 2,
  },
};

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function encodeSvg(svgMarkup: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
}

function downloadDataUrl(dataUrl: string, fileName: string) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Impossible de charger l image composee."));
    image.src = src;
  });
}

function getLogoUrl() {
  if (typeof window === "undefined") {
    return "/proxiplay-wordmark.png";
  }

  return new URL("/proxiplay-wordmark.png", window.location.origin).toString();
}

function normalizeSingleLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function clampText(value: string, maxLength: number) {
  const normalized = normalizeSingleLine(value);

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function wrapText(value: string, maxCharsPerLine: number, maxLines: number) {
  const words = normalizeSingleLine(value).split(" ").filter(Boolean);

  if (words.length === 0) {
    return [""];
  }

  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;

    if (candidate.length <= maxCharsPerLine) {
      currentLine = candidate;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    currentLine = word;

    if (lines.length === maxLines - 1) {
      break;
    }
  }

  if (lines.length < maxLines && currentLine) {
    lines.push(currentLine);
  }

  const consumedWordCount = lines.join(" ").split(" ").filter(Boolean).length;
  const wasTruncated = consumedWordCount < words.length;

  if (wasTruncated && lines.length > 0) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[.,;:!?…]*$/, "")}…`;
  }

  return lines.slice(0, maxLines);
}

function buildMultilineText(options: {
  lines: string[];
  x: number;
  y: number;
  lineHeight: number;
  fontSize: number;
  fill: string;
  fontWeight: number;
  fontFamily?: string;
}) {
  const { lines, x, y, lineHeight, fontSize, fill, fontWeight, fontFamily } = options;

  return `
    <text x="${x}" y="${y}" fill="${fill}" font-size="${fontSize}" font-weight="${fontWeight}" font-family="${fontFamily ?? "Segoe UI, Arial, sans-serif"}">
      ${lines
        .map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`)
        .join("")}
    </text>
  `;
}

function inferCommerceTheme(category: string, merchantName: string) {
  const seed = `${category} ${merchantName}`.toLowerCase();

  if (seed.includes("mode") || seed.includes("boutique") || seed.includes("vetement")) {
    return "mode locale premium, boutique lifestyle, shopping chaleureux";
  }

  if (seed.includes("restaurant") || seed.includes("snack") || seed.includes("food")) {
    return "restauration de proximite, gourmand, urbain, chaleureux";
  }

  if (seed.includes("beaute") || seed.includes("coiff")) {
    return "beaute locale, premium, elegant, lumineux";
  }

  return "commerce de proximite moderne, premium, chaleureux, mobile-first";
}

export function getPosterFormatSpec(format: PosterVisualFormat) {
  return FORMAT_SPECS[format];
}

export function createDefaultOverlayState(gameData: PosterVisualGameData): PosterOverlayState {
  const prizeUpper = (gameData.prizeLabel || "LOT").trim().toUpperCase();
  const hasReduction = prizeUpper.includes("REDUCTION");

  return {
    headline: hasReduction ? prizeUpper : gameData.title.trim().toUpperCase() || "JEU PROXIPLAY",
    headlineAccent: "A GAGNER",
    kicker: "Scannez, jouez, gagnez",
    subline: `C'est gratuit. Jouez maintenant chez ${gameData.merchantName}.`,
    ctaTitle: "SCANNEZ POUR JOUER",
    ctaButton: `FIN DU JEU ${gameData.deadlineLabel.toUpperCase()}`,
    stepOneTitle: "Scannez",
    stepOneText: "le QR code.",
    stepTwoTitle: "Jouez",
    stepTwoText: "gratuitement.",
    stepThreeTitle: "Gagnez",
    stepThreeText: hasReduction ? "votre reduction." : "votre lot.",
    badgeText: hasReduction ? "100 % GRATUIT" : "A GAGNER",
    promptMood: "publicite premium Meta, locale, mobile, chaleureuse",
  };
}

export function buildPosterFallbackBackground(format: PosterVisualFormat) {
  const spec = getPosterFormatSpec(format);

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${spec.width}" height="${spec.height}" viewBox="${spec.viewBox}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#FFF5DA" />
          <stop offset="44%" stop-color="#F8F3EA" />
          <stop offset="100%" stop-color="#ECECFA" />
        </linearGradient>
        <radialGradient id="glowOne" cx="0" cy="0" r="1" gradientTransform="translate(${spec.width * 0.18} ${spec.height * 0.16}) scale(${spec.width * 0.24} ${spec.width * 0.24})">
          <stop offset="0%" stop-color="rgba(255,198,43,0.85)" />
          <stop offset="100%" stop-color="rgba(255,198,43,0)" />
        </radialGradient>
        <radialGradient id="glowTwo" cx="0" cy="0" r="1" gradientTransform="translate(${spec.width * 0.82} ${spec.height * 0.22}) scale(${spec.width * 0.26} ${spec.width * 0.26})">
          <stop offset="0%" stop-color="rgba(160,19,77,0.22)" />
          <stop offset="100%" stop-color="rgba(160,19,77,0)" />
        </radialGradient>
        <radialGradient id="glowThree" cx="0" cy="0" r="1" gradientTransform="translate(${spec.width * 0.76} ${spec.height * 0.86}) scale(${spec.width * 0.34} ${spec.width * 0.34})">
          <stop offset="0%" stop-color="rgba(41,40,106,0.18)" />
          <stop offset="100%" stop-color="rgba(41,40,106,0)" />
        </radialGradient>
      </defs>
      <rect width="${spec.width}" height="${spec.height}" fill="url(#bg)" />
      <rect width="${spec.width}" height="${spec.height}" fill="url(#glowOne)" />
      <rect width="${spec.width}" height="${spec.height}" fill="url(#glowTwo)" />
      <rect width="${spec.width}" height="${spec.height}" fill="url(#glowThree)" />
    </svg>
  `)}`;
}

export function buildPosterBackgroundPrompt(
  gameData: PosterVisualGameData,
  format: PosterVisualFormat,
  overlay: PosterOverlayState,
) {
  const formatSpec = getPosterFormatSpec(format);
  const theme = inferCommerceTheme(gameData.merchantCategory, gameData.merchantName);

  return [
    "Create a premium advertising background for a local mobile game promotion poster.",
    `Format: ${formatSpec.label}, ${formatSpec.width}x${formatSpec.height}.`,
    `Commerce theme: ${theme}.`,
    `Prize universe: ${gameData.prizeLabel || gameData.title}.`,
    `Mood: ${overlay.promptMood}.`,
    `Brand colors to echo subtly: deep navy ${BRAND.navy}, raspberry ${BRAND.frame}, warm yellow ${BRAND.yellow}, cream ${BRAND.cream}.`,
    "Show a modern lifestyle / product / boutique ambiance with strong visual appeal and shallow depth of field.",
    "This image is only a background plate for a later overlay system.",
    "Reserve generous clean negative space for overlays: top-left for the gain headline, right side for a QR card, lower area for short steps and legal info.",
    "Absolutely no readable text, no letters, no words, no numbers, no dates, no percentages, no sale tags, no fake promotion claims, no coupon code, no discount values.",
    "Absolutely no QR code, no barcode, no tickets, no coupon shapes suggesting scannable codes.",
    "Absolutely no logo, no invented brand mark, no watermark, no fake mobile UI, no typography, no packaging text.",
    "No tables, no admin layout, no document-style composition.",
    "Make it feel like a polished Meta ad for a neighborhood commerce app.",
  ].join(" ");
}

export async function generatePosterBackgroundWithAI(
  gameData: PosterVisualGameData,
  format: PosterVisualFormat,
  overlay: PosterOverlayState,
) {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error("Connexion admin requise pour generer un fond IA.");
  }

  const idToken = await currentUser.getIdToken(true);
  const response = await fetch("/api/admin/posters/background", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      gameId: gameData.id,
      format,
      prompt: buildPosterBackgroundPrompt(gameData, format, overlay),
    }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || "Impossible de generer le fond IA.");
  }

  return (await response.json()) as PosterAiBackgroundResult;
}

function buildA4PosterSvg(
  gameData: PosterVisualGameData,
  backgroundUrl: string,
  overlay: PosterOverlayState,
) {
  const logoUrl = getLogoUrl();
  const safeConditions = wrapText(gameData.conditions, 102, 3);
  const safePrizeLabel = clampText(gameData.prizeLabel, 42);
  const safeMerchantName = clampText(gameData.merchantName, 28);
  const safeSubline = clampText(overlay.subline, 74);
  const adultBadge = gameData.restrictedToAdults
    ? `
      <g transform="translate(1030 92)">
        <rect x="0" y="0" rx="24" ry="24" width="108" height="44" fill="rgba(160,19,77,0.10)" stroke="rgba(160,19,77,0.18)" />
        <text x="54" y="29" text-anchor="middle" font-size="22" font-weight="800" fill="${BRAND.frame}" font-family="Segoe UI, Arial, sans-serif">18+</text>
      </g>
    `
    : "";

  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="1240" height="1754" viewBox="0 0 1240 1754">
    <defs>
      <linearGradient id="posterGlow" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="rgba(255,255,255,0.84)" />
        <stop offset="50%" stop-color="rgba(255,255,255,0.42)" />
        <stop offset="100%" stop-color="rgba(248,243,234,0.78)" />
      </linearGradient>
      <linearGradient id="ctaCard" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#251C63" />
        <stop offset="100%" stop-color="#342B78" />
      </linearGradient>
      <linearGradient id="badge" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#FFB617" />
        <stop offset="100%" stop-color="#F39A00" />
      </linearGradient>
      <filter id="softShadow" x="-20%" y="-20%" width="140%" height="160%">
        <feDropShadow dx="0" dy="22" stdDeviation="26" flood-color="#231B60" flood-opacity="0.22" />
      </filter>
      <filter id="photoShadow" x="-20%" y="-20%" width="160%" height="180%">
        <feDropShadow dx="0" dy="20" stdDeviation="24" flood-color="#000000" flood-opacity="0.22" />
      </filter>
    </defs>
    <rect width="1240" height="1754" rx="44" fill="${BRAND.cream}" />
    <image href="${backgroundUrl}" x="0" y="0" width="1240" height="1754" preserveAspectRatio="xMidYMid slice" />
    <rect width="1240" height="1754" rx="44" fill="url(#posterGlow)" />
    <rect x="12" y="12" width="1216" height="1730" rx="36" fill="none" stroke="${BRAND.frame}" stroke-width="8" />

    <image href="${logoUrl}" x="58" y="56" width="370" height="110" preserveAspectRatio="xMinYMin meet" />
    ${adultBadge}

    <text x="64" y="238" fill="${BRAND.frame}" font-size="28" font-weight="800" letter-spacing="4" font-family="Segoe UI, Arial, sans-serif" text-transform="uppercase">${escapeXml(overlay.kicker.toUpperCase())}</text>
    <text x="64" y="370" fill="${BRAND.navy}" font-size="98" font-weight="900" font-family="Segoe UI, Arial, sans-serif">${escapeXml(overlay.headline.toUpperCase())}</text>
    <text x="64" y="478" fill="${BRAND.pink}" font-size="92" font-weight="900" font-family="Segoe UI, Arial, sans-serif">${escapeXml(overlay.headlineAccent.toUpperCase())}</text>
    <text x="64" y="538" fill="${BRAND.text}" font-size="34" font-weight="700" font-family="Segoe UI, Arial, sans-serif">${escapeXml(safeSubline)}</text>

    <g filter="url(#photoShadow)">
      <rect x="44" y="604" width="760" height="760" rx="54" fill="rgba(255,255,255,0.22)" />
      <image href="${backgroundUrl}" x="44" y="604" width="760" height="760" preserveAspectRatio="xMidYMid slice" opacity="0.18" />
      <rect x="44" y="604" width="760" height="760" rx="54" fill="rgba(255,198,43,0.22)" />
      <image href="${gameData.imageUrl || backgroundUrl}" x="44" y="604" width="760" height="760" preserveAspectRatio="xMidYMid slice" />
    </g>

    <g transform="translate(684 626)">
      <circle cx="0" cy="0" r="92" fill="url(#badge)" stroke="rgba(255,255,255,0.68)" stroke-width="4" />
      <text x="0" y="-6" text-anchor="middle" fill="${BRAND.white}" font-size="28" font-weight="900" font-family="Segoe UI, Arial, sans-serif">${escapeXml(overlay.badgeText.split(" ")[0])}</text>
      <text x="0" y="30" text-anchor="middle" fill="${BRAND.white}" font-size="28" font-weight="900" font-family="Segoe UI, Arial, sans-serif">${escapeXml(overlay.badgeText.split(" ").slice(1).join(" ") || "GRATUIT")}</text>
    </g>

    <g filter="url(#softShadow)">
      <rect x="860" y="252" width="310" height="582" rx="34" fill="url(#ctaCard)" />
      <text x="1015" y="318" text-anchor="middle" fill="${BRAND.white}" font-size="34" font-weight="900" font-family="Segoe UI, Arial, sans-serif">${escapeXml(overlay.ctaTitle)}</text>
      <rect x="906" y="354" width="218" height="218" rx="22" fill="${BRAND.white}" />
      <image href="${gameData.qrCodeDataUrl}" x="930" y="378" width="170" height="170" preserveAspectRatio="xMidYMid meet" />
      <text x="1015" y="636" text-anchor="middle" fill="${BRAND.white}" font-size="28" font-weight="800" font-family="Segoe UI, Arial, sans-serif">JOUEZ MAINTENANT</text>
      <rect x="892" y="680" width="246" height="64" rx="32" fill="${BRAND.yellow}" />
      <text x="1015" y="721" text-anchor="middle" fill="${BRAND.navy}" font-size="24" font-weight="900" font-family="Segoe UI, Arial, sans-serif">${escapeXml(overlay.ctaButton)}</text>
    </g>

    <g transform="translate(846 940)">
      <g transform="translate(0 0)">
        <circle cx="20" cy="20" r="20" fill="${BRAND.frame}" />
        <text x="20" y="28" text-anchor="middle" fill="${BRAND.white}" font-size="22" font-weight="800" font-family="Segoe UI, Arial, sans-serif">1</text>
        <text x="58" y="18" fill="${BRAND.navy}" font-size="30" font-weight="900" font-family="Segoe UI, Arial, sans-serif">${escapeXml(overlay.stepOneTitle.toUpperCase())}</text>
        <text x="58" y="54" fill="${BRAND.text}" font-size="22" font-weight="500" font-family="Segoe UI, Arial, sans-serif">${escapeXml(overlay.stepOneText)}</text>
      </g>
      <g transform="translate(0 128)">
        <circle cx="20" cy="20" r="20" fill="${BRAND.frame}" />
        <text x="20" y="28" text-anchor="middle" fill="${BRAND.white}" font-size="22" font-weight="800" font-family="Segoe UI, Arial, sans-serif">2</text>
        <text x="58" y="18" fill="${BRAND.navy}" font-size="30" font-weight="900" font-family="Segoe UI, Arial, sans-serif">${escapeXml(overlay.stepTwoTitle.toUpperCase())}</text>
        <text x="58" y="54" fill="${BRAND.text}" font-size="22" font-weight="500" font-family="Segoe UI, Arial, sans-serif">${escapeXml(overlay.stepTwoText)}</text>
      </g>
      <g transform="translate(0 256)">
        <circle cx="20" cy="20" r="20" fill="${BRAND.frame}" />
        <text x="20" y="28" text-anchor="middle" fill="${BRAND.white}" font-size="22" font-weight="800" font-family="Segoe UI, Arial, sans-serif">3</text>
        <text x="58" y="18" fill="${BRAND.navy}" font-size="30" font-weight="900" font-family="Segoe UI, Arial, sans-serif">${escapeXml(overlay.stepThreeTitle.toUpperCase())}</text>
        <text x="58" y="54" fill="${BRAND.text}" font-size="22" font-weight="500" font-family="Segoe UI, Arial, sans-serif">${escapeXml(overlay.stepThreeText)}</text>
      </g>
    </g>

    <g transform="translate(52 1462)">
      <rect x="0" y="0" width="1136" height="210" rx="34" fill="rgba(255,252,245,0.86)" stroke="rgba(160,19,77,0.12)" />
      <g transform="translate(34 46)">
        <text x="0" y="0" fill="${BRAND.frame}" font-size="22" font-weight="800" font-family="Segoe UI, Arial, sans-serif">PERIODE</text>
        <text x="0" y="46" fill="${BRAND.text}" font-size="30" font-weight="700" font-family="Segoe UI, Arial, sans-serif">${escapeXml(gameData.deadlineLabel)}</text>
      </g>
      <g transform="translate(330 46)">
        <text x="0" y="0" fill="${BRAND.frame}" font-size="22" font-weight="800" font-family="Segoe UI, Arial, sans-serif">COMMERCANT</text>
        <text x="0" y="46" fill="${BRAND.text}" font-size="30" font-weight="700" font-family="Segoe UI, Arial, sans-serif">${escapeXml(safeMerchantName)}</text>
      </g>
      <g transform="translate(650 46)">
        <text x="0" y="0" fill="${BRAND.frame}" font-size="22" font-weight="800" font-family="Segoe UI, Arial, sans-serif">LOT</text>
        <text x="0" y="46" fill="${BRAND.text}" font-size="30" font-weight="700" font-family="Segoe UI, Arial, sans-serif">${escapeXml(safePrizeLabel)}</text>
      </g>
      <g transform="translate(34 132)">
        <text x="0" y="0" fill="${BRAND.frame}" font-size="20" font-weight="700" font-family="Segoe UI, Arial, sans-serif">CONDITIONS</text>
        ${buildMultilineText({
          lines: safeConditions,
          x: 0,
          y: 30,
          lineHeight: 24,
          fontSize: 18,
          fill: BRAND.text,
          fontWeight: 500,
        })}
      </g>
    </g>
  </svg>`;
}

function buildSquarePosterSvg(
  gameData: PosterVisualGameData,
  backgroundUrl: string,
  overlay: PosterOverlayState,
) {
  const logoUrl = getLogoUrl();
  const safeMerchantName = clampText(gameData.merchantName, 22);
  const safePrizeLabel = clampText(gameData.prizeLabel, 28);
  const safeDeadline = clampText(gameData.deadlineLabel, 18);
  const safeSubline = clampText(overlay.subline, 64);

  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
    <defs>
      <linearGradient id="squareMask" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="rgba(255,255,255,0.78)" />
        <stop offset="55%" stop-color="rgba(255,255,255,0.26)" />
        <stop offset="100%" stop-color="rgba(36,28,99,0.22)" />
      </linearGradient>
    </defs>
    <rect width="1080" height="1080" rx="42" fill="${BRAND.cream}" />
    <image href="${backgroundUrl}" x="0" y="0" width="1080" height="1080" preserveAspectRatio="xMidYMid slice" />
    <rect width="1080" height="1080" rx="42" fill="url(#squareMask)" />
    <image href="${logoUrl}" x="58" y="50" width="280" height="84" preserveAspectRatio="xMinYMin meet" />
    <text x="58" y="204" fill="${BRAND.frame}" font-size="24" font-weight="800" letter-spacing="3" font-family="Segoe UI, Arial, sans-serif">${escapeXml(overlay.kicker.toUpperCase())}</text>
    <text x="58" y="300" fill="${BRAND.navy}" font-size="70" font-weight="900" font-family="Segoe UI, Arial, sans-serif">${escapeXml(overlay.headline.toUpperCase())}</text>
    <text x="58" y="378" fill="${BRAND.pink}" font-size="70" font-weight="900" font-family="Segoe UI, Arial, sans-serif">${escapeXml(overlay.headlineAccent.toUpperCase())}</text>
    <text x="58" y="430" fill="${BRAND.text}" font-size="28" font-weight="700" font-family="Segoe UI, Arial, sans-serif">${escapeXml(safeSubline)}</text>

    <rect x="58" y="492" width="640" height="458" rx="42" fill="rgba(255,255,255,0.18)" />
    <image href="${gameData.imageUrl || backgroundUrl}" x="58" y="492" width="640" height="458" preserveAspectRatio="xMidYMid slice" />
    <g transform="translate(626 522)">
      <circle cx="0" cy="0" r="68" fill="${BRAND.orange}" />
      <text x="0" y="-4" text-anchor="middle" fill="${BRAND.white}" font-size="22" font-weight="900" font-family="Segoe UI, Arial, sans-serif">${escapeXml(overlay.badgeText.split(" ")[0])}</text>
      <text x="0" y="24" text-anchor="middle" fill="${BRAND.white}" font-size="22" font-weight="900" font-family="Segoe UI, Arial, sans-serif">${escapeXml(overlay.badgeText.split(" ").slice(1).join(" ") || "GRATUIT")}</text>
    </g>

    <rect x="744" y="206" width="278" height="430" rx="30" fill="${BRAND.navy}" opacity="0.96" />
    <text x="883" y="256" text-anchor="middle" fill="${BRAND.white}" font-size="28" font-weight="900" font-family="Segoe UI, Arial, sans-serif">${escapeXml(overlay.ctaTitle)}</text>
    <rect x="788" y="286" width="190" height="190" rx="20" fill="${BRAND.white}" />
    <image href="${gameData.qrCodeDataUrl}" x="808" y="306" width="150" height="150" preserveAspectRatio="xMidYMid meet" />
    <rect x="774" y="520" width="218" height="56" rx="28" fill="${BRAND.yellow}" />
    <text x="883" y="556" text-anchor="middle" fill="${BRAND.navy}" font-size="20" font-weight="900" font-family="Segoe UI, Arial, sans-serif">${escapeXml(overlay.ctaButton)}</text>

    <g transform="translate(744 704)">
      <text x="0" y="0" fill="${BRAND.white}" font-size="24" font-weight="800" font-family="Segoe UI, Arial, sans-serif">1. ${escapeXml(overlay.stepOneTitle.toUpperCase())}</text>
      <text x="0" y="28" fill="${BRAND.white}" font-size="18" font-weight="500" font-family="Segoe UI, Arial, sans-serif">${escapeXml(overlay.stepOneText)}</text>
      <text x="0" y="84" fill="${BRAND.white}" font-size="24" font-weight="800" font-family="Segoe UI, Arial, sans-serif">2. ${escapeXml(overlay.stepTwoTitle.toUpperCase())}</text>
      <text x="0" y="112" fill="${BRAND.white}" font-size="18" font-weight="500" font-family="Segoe UI, Arial, sans-serif">${escapeXml(overlay.stepTwoText)}</text>
      <text x="0" y="168" fill="${BRAND.white}" font-size="24" font-weight="800" font-family="Segoe UI, Arial, sans-serif">3. ${escapeXml(overlay.stepThreeTitle.toUpperCase())}</text>
      <text x="0" y="196" fill="${BRAND.white}" font-size="18" font-weight="500" font-family="Segoe UI, Arial, sans-serif">${escapeXml(overlay.stepThreeText)}</text>
    </g>

    <rect x="58" y="972" width="964" height="54" rx="20" fill="rgba(255,252,245,0.86)" />
    <text x="82" y="1008" fill="${BRAND.frame}" font-size="18" font-weight="800" font-family="Segoe UI, Arial, sans-serif">${escapeXml(safeMerchantName)}</text>
    <text x="404" y="1008" fill="${BRAND.text}" font-size="18" font-weight="600" font-family="Segoe UI, Arial, sans-serif">${escapeXml(safePrizeLabel)}</text>
    <text x="792" y="1008" fill="${BRAND.text}" font-size="18" font-weight="600" font-family="Segoe UI, Arial, sans-serif">${escapeXml(safeDeadline)}</text>
  </svg>`;
}

function buildStoryPosterSvg(
  gameData: PosterVisualGameData,
  backgroundUrl: string,
  overlay: PosterOverlayState,
) {
  const logoUrl = getLogoUrl();
  const safeConditions = wrapText(gameData.conditions, 36, 2);
  const safePrizeLabel = clampText(gameData.prizeLabel, 30);
  const safeMerchantName = clampText(gameData.merchantName, 28);
  const safeSubline = clampText(overlay.subline, 60);

  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
    <rect width="1080" height="1920" fill="${BRAND.cream}" />
    <image href="${backgroundUrl}" x="0" y="0" width="1080" height="1920" preserveAspectRatio="xMidYMid slice" />
    <rect width="1080" height="1920" fill="rgba(248,243,234,0.42)" />
    <image href="${logoUrl}" x="58" y="68" width="280" height="84" preserveAspectRatio="xMinYMin meet" />
    <text x="58" y="248" fill="${BRAND.frame}" font-size="24" font-weight="800" letter-spacing="3" font-family="Segoe UI, Arial, sans-serif">${escapeXml(overlay.kicker.toUpperCase())}</text>
    <text x="58" y="352" fill="${BRAND.navy}" font-size="74" font-weight="900" font-family="Segoe UI, Arial, sans-serif">${escapeXml(overlay.headline.toUpperCase())}</text>
    <text x="58" y="434" fill="${BRAND.pink}" font-size="74" font-weight="900" font-family="Segoe UI, Arial, sans-serif">${escapeXml(overlay.headlineAccent.toUpperCase())}</text>
    <text x="58" y="494" fill="${BRAND.text}" font-size="30" font-weight="700" font-family="Segoe UI, Arial, sans-serif">${escapeXml(safeSubline)}</text>

    <rect x="54" y="590" width="972" height="820" rx="54" fill="rgba(255,255,255,0.14)" />
    <image href="${gameData.imageUrl || backgroundUrl}" x="54" y="590" width="972" height="820" preserveAspectRatio="xMidYMid slice" />

    <g transform="translate(900 646)">
      <circle cx="0" cy="0" r="78" fill="${BRAND.orange}" />
      <text x="0" y="-4" text-anchor="middle" fill="${BRAND.white}" font-size="24" font-weight="900" font-family="Segoe UI, Arial, sans-serif">${escapeXml(overlay.badgeText.split(" ")[0])}</text>
      <text x="0" y="26" text-anchor="middle" fill="${BRAND.white}" font-size="24" font-weight="900" font-family="Segoe UI, Arial, sans-serif">${escapeXml(overlay.badgeText.split(" ").slice(1).join(" ") || "GRATUIT")}</text>
    </g>

    <rect x="642" y="1112" width="340" height="392" rx="32" fill="${BRAND.navy}" opacity="0.97" />
    <text x="812" y="1164" text-anchor="middle" fill="${BRAND.white}" font-size="30" font-weight="900" font-family="Segoe UI, Arial, sans-serif">${escapeXml(overlay.ctaTitle)}</text>
    <rect x="694" y="1196" width="236" height="236" rx="24" fill="${BRAND.white}" />
    <image href="${gameData.qrCodeDataUrl}" x="720" y="1222" width="184" height="184" preserveAspectRatio="xMidYMid meet" />
    <rect x="680" y="1454" width="264" height="60" rx="30" fill="${BRAND.yellow}" />
    <text x="812" y="1494" text-anchor="middle" fill="${BRAND.navy}" font-size="21" font-weight="900" font-family="Segoe UI, Arial, sans-serif">${escapeXml(overlay.ctaButton)}</text>

    <g transform="translate(58 1492)">
      <text x="0" y="0" fill="${BRAND.navy}" font-size="26" font-weight="900" font-family="Segoe UI, Arial, sans-serif">1. ${escapeXml(overlay.stepOneTitle.toUpperCase())}</text>
      <text x="0" y="32" fill="${BRAND.text}" font-size="20" font-weight="500" font-family="Segoe UI, Arial, sans-serif">${escapeXml(overlay.stepOneText)}</text>
      <text x="0" y="108" fill="${BRAND.navy}" font-size="26" font-weight="900" font-family="Segoe UI, Arial, sans-serif">2. ${escapeXml(overlay.stepTwoTitle.toUpperCase())}</text>
      <text x="0" y="140" fill="${BRAND.text}" font-size="20" font-weight="500" font-family="Segoe UI, Arial, sans-serif">${escapeXml(overlay.stepTwoText)}</text>
      <text x="0" y="216" fill="${BRAND.navy}" font-size="26" font-weight="900" font-family="Segoe UI, Arial, sans-serif">3. ${escapeXml(overlay.stepThreeTitle.toUpperCase())}</text>
      <text x="0" y="248" fill="${BRAND.text}" font-size="20" font-weight="500" font-family="Segoe UI, Arial, sans-serif">${escapeXml(overlay.stepThreeText)}</text>
    </g>

    <rect x="54" y="1766" width="972" height="104" rx="30" fill="rgba(255,252,245,0.88)" />
    <text x="86" y="1814" fill="${BRAND.frame}" font-size="20" font-weight="800" font-family="Segoe UI, Arial, sans-serif">${escapeXml(safeMerchantName)}</text>
    <text x="86" y="1848" fill="${BRAND.text}" font-size="18" font-weight="600" font-family="Segoe UI, Arial, sans-serif">${escapeXml(safePrizeLabel)}</text>
    <text x="652" y="1814" fill="${BRAND.frame}" font-size="20" font-weight="800" font-family="Segoe UI, Arial, sans-serif">Conditions</text>
    ${buildMultilineText({
      lines: safeConditions,
      x: 652,
      y: 1848,
      lineHeight: 24,
      fontSize: 18,
      fill: BRAND.text,
      fontWeight: 500,
    })}
  </svg>`;
}

export function composePosterWithOverlay(
  gameData: PosterVisualGameData,
  aiBackground: string,
  format: PosterVisualFormat,
  overlay: PosterOverlayState,
) {
  switch (format) {
    case "facebook-square":
      return buildSquarePosterSvg(gameData, aiBackground, overlay);
    case "instagram-story":
      return buildStoryPosterSvg(gameData, aiBackground, overlay);
    case "a4-portrait":
    default:
      return buildA4PosterSvg(gameData, aiBackground, overlay);
  }
}

export async function rasterizePosterSvg(
  svgMarkup: string,
  format: PosterVisualFormat,
  scale = 1,
) {
  const spec = getPosterFormatSpec(format);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(spec.width * scale);
  canvas.height = Math.round(spec.height * scale);
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas indisponible pour exporter le visuel.");
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.scale(scale, scale);
  const image = await loadImage(encodeSvg(svgMarkup));
  context.drawImage(image, 0, 0, spec.width, spec.height);

  return canvas.toDataURL("image/png");
}

export async function exportPosterPng(
  svgMarkup: string,
  format: PosterVisualFormat,
  fileName: string,
) {
  const spec = getPosterFormatSpec(format);
  const pngDataUrl = await rasterizePosterSvg(svgMarkup, format, spec.exportScale);
  downloadDataUrl(pngDataUrl, fileName.endsWith(".png") ? fileName : `${fileName}.png`);
}

export async function exportPosterPdf(
  svgMarkup: string,
  format: PosterVisualFormat,
  fileName: string,
) {
  const spec = getPosterFormatSpec(format);
  const pngDataUrl = await rasterizePosterSvg(svgMarkup, format, spec.exportScale);
  const pdf =
    format === "a4-portrait"
      ? new jsPDF({ unit: "pt", format: "a4" })
      : new jsPDF({
          unit: "pt",
          format: [spec.width, spec.height],
        });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  pdf.addImage(pngDataUrl, "PNG", 0, 0, pageWidth, pageHeight, undefined, "NONE");
  pdf.save(fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`);
}

export function buildPosterPreviewDataUrl(
  gameData: PosterVisualGameData,
  aiBackground: string,
  format: PosterVisualFormat,
  overlay: PosterOverlayState,
) {
  return encodeSvg(composePosterWithOverlay(gameData, aiBackground, format, overlay));
}
