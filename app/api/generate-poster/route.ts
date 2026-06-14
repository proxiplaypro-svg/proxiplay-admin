import { readFile } from "node:fs/promises";
import path from "node:path";
import chromium from "@sparticuz/chromium-min";
import { NextResponse } from "next/server";
import puppeteer from "puppeteer-core";
import type { Browser } from "puppeteer-core";
import QRCode from "qrcode";
import { getAdminDb } from "@/lib/firebase/admin-app";

type GeneratePosterRequestBody = {
  gameId?: string;
};

type TimestampLike = {
  toDate?: () => Date;
};

type SecondaryPrizeLike =
  | {
      name?: string;
      description?: string;
      presentation?: string;
    }
  | string;

type FirestoreGameDocument = {
  title?: string;
  name?: string;
  description?: string;
  imageUrl?: string | null;
  photo?: string | null;
  startDate?: TimestampLike | null;
  start_date?: TimestampLike | null;
  endDate?: TimestampLike | null;
  end_date?: TimestampLike | null;
  merchantId?: string | null;
  qrCodeUrl?: string | null;
  prizeImageUrl?: string | null;
  prize_value?: number | null;
  mainPrizeTitle?: string | null;
  main_prize_title?: string | null;
  mainPrizeDescription?: string | null;
  main_prize_description?: string | null;
  mainPrizeImageUrl?: string | null;
  main_prize_image?: string | null;
  restrictedToAdults?: boolean | null;
  prohibited_for_minors?: boolean | null;
  secondaryPrizes?: SecondaryPrizeLike[] | null;
  secondary_prizes?: SecondaryPrizeLike[] | null;
};

type FirestoreMerchantDocument = {
  name?: string;
};

type PosterTemplateData = {
  altTitle: string;
  headlineLead: string;
  headlineAccent: string;
  badgeLabel: string;
  mainPrizeLabel: string;
  description: string;
  merchantName: string;
  startDateLabel: string;
  endDateLabel: string;
  qrCodeDataUrl: string;
  prizeImageDataUrl: string;
  firstSecondaryPrizeLabel: string;
  restrictedToAdults: boolean;
  logoDataUrl: string;
};

const CHROMIUM_PACK_URL =
  process.env.CHROMIUM_PACK_URL?.trim() ||
  "https://github.com/Sparticuz/chromium/releases/download/v147.0.0/chromium-v147.0.0-pack.tar";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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

function readDateLabel(value: TimestampLike | null | undefined) {
  const date = value?.toDate?.();

  if (!date) {
    return "Date a definir";
  }

  return date.toLocaleDateString("fr-FR");
}

function normalizePromotionalCopy(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ") || "";
}

function looksGenericPrizeLabel(value: string) {
  const normalized = value.toLowerCase();

  return (
    normalized.length === 0 ||
    normalized === "lot a gagner" ||
    normalized === "lot à gagner" ||
    normalized === "lot principal configure" ||
    normalized === "lot principal configuré" ||
    normalized === "lot principal configuree" ||
    normalized === "lot"
  );
}

function shouldUseFreeBadge(value: string) {
  const normalized = value.toLowerCase();

  return (
    normalized.includes("reduction") ||
    normalized.includes("réduction") ||
    normalized.includes("bon") ||
    normalized.includes("offert") ||
    normalized.includes("gratu")
  );
}

function readSecondaryPrizeLabel(prize: SecondaryPrizeLike) {
  if (typeof prize === "string") {
    return prize.trim();
  }

  return readText(prize.name, prize.presentation, prize.description);
}

function getSecondaryPrizes(game: FirestoreGameDocument) {
  const values = game.secondaryPrizes ?? game.secondary_prizes;
  return Array.isArray(values) ? values : [];
}

function getFirstSecondaryPrizeLabel(game: FirestoreGameDocument) {
  for (const prize of getSecondaryPrizes(game)) {
    const label = readSecondaryPrizeLabel(prize);

    if (label) {
      return label;
    }
  }

  return "-";
}

function readMainPrizeLabel(game: FirestoreGameDocument) {
  const mainPrizeTitle = normalizePromotionalCopy(game.mainPrizeTitle || game.main_prize_title);
  const mainPrizeDescription = normalizePromotionalCopy(
    game.mainPrizeDescription || game.main_prize_description,
  );
  const firstSecondaryPrize = getFirstSecondaryPrizeLabel(game);
  const title = normalizePromotionalCopy(game.title || game.name);

  const selected = [
    title,
    mainPrizeTitle,
    mainPrizeDescription,
    firstSecondaryPrize,
  ].find((value) => value.length > 0 && value !== "-" && !looksGenericPrizeLabel(value));

  return selected || title || "Jeu ProxiPlay";
}

function buildPosterGainHeadline(game: FirestoreGameDocument) {
  const mainPrizeLabel = readMainPrizeLabel(game);

  return {
    lead: mainPrizeLabel.toUpperCase(),
    accent: "A GAGNER",
    badge: shouldUseFreeBadge(mainPrizeLabel) ? "100 % GRATUIT" : "A GAGNER",
    mainPrizeLabel,
  };
}

function readPrizeImageUrl(game: FirestoreGameDocument) {
  return readText(
    game.mainPrizeImageUrl,
    game.main_prize_image,
    game.prizeImageUrl,
    game.imageUrl,
    game.photo,
  );
}

async function fetchAsDataUrl(url: string, fallbackMimeType = "image/jpeg") {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Impossible de recuperer la ressource distante: ${url}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || fallbackMimeType;
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  return `data:${contentType};base64,${base64}`;
}

function buildPrizeImageFallbackDataUrl() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#FFF2D8" />
          <stop offset="55%" stop-color="#FCE6EF" />
          <stop offset="100%" stop-color="#EEF2FF" />
        </linearGradient>
        <radialGradient id="glowA" cx="35%" cy="28%" r="50%">
          <stop offset="0%" stop-color="rgba(245,166,35,0.75)" />
          <stop offset="100%" stop-color="rgba(245,166,35,0)" />
        </radialGradient>
        <radialGradient id="glowB" cx="70%" cy="78%" r="48%">
          <stop offset="0%" stop-color="rgba(192,0,108,0.32)" />
          <stop offset="100%" stop-color="rgba(192,0,108,0)" />
        </radialGradient>
      </defs>
      <rect width="1200" height="1600" fill="url(#bg)" />
      <circle cx="310" cy="360" r="310" fill="url(#glowA)" />
      <circle cx="920" cy="1170" r="360" fill="url(#glowB)" />
      <rect x="90" y="120" width="1020" height="1360" rx="68" fill="rgba(255,255,255,0.42)" />
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function formatPosterTitleHtml(value: string) {
  const compactPercent = value.replace(/(\d)\s+%/g, "$1%");
  const normalized = compactPercent.trim().replace(/\s+/g, " ");
  const lastSpaceIndex = normalized.lastIndexOf(" ");

  if (lastSpaceIndex <= 0) {
    return escapeHtml(normalized);
  }

  const beforeLastWord = normalized.slice(0, lastSpaceIndex);
  const lastWord = normalized.slice(lastSpaceIndex + 1);

  return `${escapeHtml(beforeLastWord)} <span class="title-tail">${escapeHtml(lastWord)}</span>`;
}

async function readLogoDataUrl() {
  const logoCandidates = [
    path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "logo-proxiplay.png"),
    path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "proxiplay-wordmark.png"),
  ];

  for (const candidate of logoCandidates) {
    try {
      const file = await readFile(candidate);
      return `data:image/png;base64,${file.toString("base64")}`;
    } catch {
      continue;
    }
  }

  throw new Error("Logo ProxiPlay introuvable dans /public.");
}

async function resolveGameDocument(gameId: string) {
  const adminDb = getAdminDb();

  for (const collectionName of ["games", "jeux"] as const) {
    const snapshot = await adminDb.collection(collectionName).doc(gameId).get();

    if (snapshot.exists) {
      return snapshot.data() as FirestoreGameDocument;
    }
  }

  return null;
}

async function resolveMerchantName(merchantId: string | null) {
  if (!merchantId) {
    return "Commerce partenaire";
  }

  const adminDb = getAdminDb();

  for (const collectionName of ["merchants", "enseignes"] as const) {
    const snapshot = await adminDb.collection(collectionName).doc(merchantId).get();

    if (snapshot.exists) {
      const data = snapshot.data() as FirestoreMerchantDocument;
      return readText(data.name, "Commerce partenaire");
    }
  }

  return "Commerce partenaire";
}

async function getChromiumExecutablePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH?.trim()) {
    return process.env.PUPPETEER_EXECUTABLE_PATH.trim();
  }

  return chromium.executablePath(CHROMIUM_PACK_URL);
}

function generatePosterHTML(data: PosterTemplateData) {
  const safeAltTitle = escapeHtml(data.altTitle);
  const safeMainPrizeLabel = escapeHtml(data.mainPrizeLabel);
  const posterTitleHtml = formatPosterTitleHtml(data.headlineLead);
  const safeDescription = escapeHtml(data.description);
  const safeMerchantName = escapeHtml(data.merchantName);
  const safeStartDate = escapeHtml(data.startDateLabel);
  const safeEndDate = escapeHtml(data.endDateLabel);
  const safeFirstSecondaryPrize = escapeHtml(data.firstSecondaryPrizeLabel);
  const safeBadgeLabel = escapeHtml(data.badgeLabel);
  const safeHeadlineAccent = escapeHtml(data.headlineAccent);
  const adultBadge = data.restrictedToAdults
    ? '<div class="adult-badge">18+</div>'
    : "";

  return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Affiche ProxiPlay</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;700;900&display=swap" rel="stylesheet" />
    <style>
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        width: 210mm;
        height: 297mm;
        background: #ffffff;
        color: #161520;
        font-family: "Inter", Arial, sans-serif;
      }
      body { padding: 0; }
      .page {
        width: 210mm;
        height: 297mm;
        padding: 22px;
        background: #ffffff;
      }
      .poster {
        width: 100%;
        height: 100%;
        border: 3px solid #8B1A4A;
        border-radius: 18px;
        padding: 30px 30px 24px;
        background:
          radial-gradient(circle at top left, rgba(245,166,35,0.08), transparent 26%),
          radial-gradient(circle at bottom right, rgba(192,0,108,0.06), transparent 18%),
          #ffffff;
        display: flex;
        flex-direction: column;
        gap: 18px;
      }
      .header {
        display: flex;
        justify-content: space-between;
        gap: 20px;
        align-items: flex-start;
      }
      .header-left {
        flex: 0 0 58%;
        min-width: 0;
      }
      .header-right {
        position: relative;
        flex: 0 0 34.5%;
        min-width: 0;
        border-radius: 22px;
        background: #2D2A6E;
        padding: 18px 18px 16px;
        color: #ffffff;
        text-align: center;
        box-shadow: 0 14px 30px rgba(45, 42, 110, 0.18);
      }
      .logo {
        width: 250px;
        max-width: 100%;
        height: auto;
        display: block;
      }
      .tagline {
        margin-top: 18px;
        color: #C0006C;
        font-size: 14px;
        font-weight: 900;
        letter-spacing: 0.22em;
        text-transform: uppercase;
      }
      .gain-title {
        margin: 10px 0 0;
        color: #2D2A6E;
        font-family: "Bebas Neue", Impact, sans-serif;
        font-size: 48px;
        line-height: 0.93;
        letter-spacing: 0.01em;
        word-break: break-word;
        overflow-wrap: anywhere;
      }
      .gain-accent {
        color: #C0006C;
      }
      .title-tail {
        white-space: nowrap;
      }
      .merchant-line {
        margin-top: 14px;
        font-size: 19px;
        line-height: 1.28;
        color: #2D2A6E;
      }
      .merchant-line strong {
        font-weight: 900;
        color: #C0006C;
      }
      .merchant-line strong:last-child {
        color: #2D2A6E;
      }
      .description {
        margin-top: 8px;
        max-width: 95%;
        font-size: 16px;
        line-height: 1.22;
        font-style: italic;
        color: #777487;
      }
      .adult-badge {
        position: absolute;
        top: -8px;
        right: -8px;
        width: 48px;
        height: 48px;
        border-radius: 999px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(45, 42, 110, 0.92);
        border: 3px solid rgba(255, 255, 255, 0.45);
        box-shadow: 0 0 0 2px rgba(45, 42, 110, 0.4);
        color: #ffffff;
        font-size: 12px;
        font-weight: 900;
      }
      .chance-title {
        font-size: 14px;
        font-weight: 900;
        line-height: 1.25;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .qr-frame {
        margin: 14px auto 0;
        width: 188px;
        height: 188px;
        border-radius: 16px;
        background: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 14px;
      }
      .qr-frame img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
      }
      .scan-label {
        margin-top: 14px;
        font-size: 15px;
        font-weight: 900;
        line-height: 1.1;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .deadline-badge {
        margin-top: 14px;
        border-radius: 999px;
        background: #F5A623;
        color: #ffffff;
        padding: 10px 14px;
        font-size: 13px;
        font-weight: 900;
      }
      .middle {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 252px;
        gap: 18px;
        align-items: stretch;
        flex: 1;
        min-height: 0;
      }
      .visual-wrapper {
        position: relative;
        min-width: 0;
        min-height: 0;
        padding-top: 12px;
      }
      .promo-badge {
        position: absolute;
        top: 28px;
        right: 18px;
        border-radius: 999px;
        width: 104px;
        height: 104px;
        background: #FFB11B;
        color: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 10px;
        font-size: 12px;
        font-weight: 900;
        line-height: 1.15;
        box-shadow: 0 12px 24px rgba(243, 154, 0, 0.18);
      }
      .prize-image {
        width: 100%;
        height: 305px;
        border-radius: 18px;
        object-fit: cover;
        display: block;
        background: linear-gradient(180deg, #F6E1AA 0%, #E9CB8B 100%);
      }
      .steps {
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 0;
        padding: 18px 0 0;
      }
      .step {
        padding: 18px 0;
      }
      .step + .step {
        border-top: 1px solid #D8D8DD;
      }
      .step-header {
        display: flex;
        align-items: flex-start;
        gap: 12px;
      }
      .step-index {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 38px;
        height: 38px;
        border-radius: 999px;
        background: #A61B5B;
        color: #ffffff;
        font-size: 20px;
        font-family: "Bebas Neue", Impact, sans-serif;
        font-weight: 900;
        flex-shrink: 0;
      }
      .step-copy {
        min-width: 0;
      }
      .step-title {
        margin-top: 0;
        color: #2D2A6E;
        font-size: 26px;
        font-family: "Bebas Neue", Impact, sans-serif;
        font-weight: 900;
        line-height: 0.98;
      }
      .step-text {
        margin-top: 2px;
        color: #2B2940;
        font-size: 14px;
        line-height: 1.28;
      }
      .footer {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 0;
        border-radius: 18px;
        background: #F7F7F5;
        padding: 16px 18px;
      }
      .footer-block {
        min-width: 0;
        padding: 0 14px;
      }
      .footer-block + .footer-block {
        border-left: 1px solid #E7E3DF;
      }
      .footer-label {
        color: #8A8796;
        font-size: 10px;
        font-weight: 900;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }
      .footer-value {
        margin-top: 6px;
        color: #2D2A6E;
        font-size: 14px;
        font-weight: 800;
        line-height: 1.2;
        word-break: break-word;
      }
    </style>
  </head>
  <body>
    <div class="page">
      <article class="poster">
        <section class="header">
          <div class="header-left">
            <img class="logo" src="${data.logoDataUrl}" alt="ProxiPlay" />
            <div class="tagline">Scannez, jouez, gagnez</div>
            <h1 class="gain-title">${posterTitleHtml}<br /><span class="gain-accent">${safeHeadlineAccent}</span></h1>
            <div class="merchant-line">C&apos;est <strong>gratuit</strong>. Jouez maintenant chez <strong>${safeMerchantName}</strong>.</div>
            <p class="description">${safeDescription || "Scannez le QR code et tentez votre chance tout de suite."}</p>
          </div>
          <aside class="header-right">
            ${adultBadge}
            <div class="chance-title">TENTEZ VOTRE CHANCE</div>
            <div class="qr-frame">
              <img src="${data.qrCodeDataUrl}" alt="QR code du jeu" />
            </div>
            <div class="scan-label">SCANNEZ POUR JOUER !</div>
            <div class="deadline-badge">Fin le ${safeEndDate}</div>
          </aside>
        </section>

        <section class="middle">
          <div class="visual-wrapper">
            <div class="promo-badge">${safeBadgeLabel.replace(" ", "<br />")}</div>
            <img class="prize-image" src="${data.prizeImageDataUrl}" alt="${safeAltTitle}" />
          </div>
          <div class="steps">
            <div class="step">
              <div class="step-header">
                <div class="step-index">1</div>
                <div class="step-copy">
                  <div class="step-title">SCANNEZ</div>
                  <div class="step-text">le QR code avec votre telephone.</div>
                </div>
              </div>
            </div>
            <div class="step">
              <div class="step-header">
                <div class="step-index">2</div>
                <div class="step-copy">
                  <div class="step-title">GRATTEZ</div>
                  <div class="step-text">et decouvrez si vous avez gagne.</div>
                </div>
              </div>
            </div>
            <div class="step">
              <div class="step-header">
                <div class="step-index">3</div>
                <div class="step-copy">
                  <div class="step-title">GAGNEZ</div>
                  <div class="step-text">votre lot immediatement !</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="footer">
          <div class="footer-block">
            <div class="footer-label">PERIODE</div>
            <div class="footer-value">${safeStartDate} au ${safeEndDate}</div>
          </div>
          <div class="footer-block">
            <div class="footer-label">COMMERCANT</div>
            <div class="footer-value">${safeMerchantName}</div>
          </div>
          <div class="footer-block">
            <div class="footer-label">LOT PRINCIPAL</div>
            <div class="footer-value">${safeMainPrizeLabel}</div>
          </div>
          <div class="footer-block">
            <div class="footer-label">LOTS SECONDAIRES</div>
            <div class="footer-value">${safeFirstSecondaryPrize}</div>
          </div>
        </section>
      </article>
    </div>
  </body>
</html>`;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let browser: Browser | null = null;

  try {
    const body = (await request.json()) as GeneratePosterRequestBody;
    const gameId = body.gameId?.trim();

    if (!gameId) {
      return NextResponse.json({ error: "gameId manquant." }, { status: 400 });
    }

    const game = await resolveGameDocument(gameId);

    if (!game) {
      return NextResponse.json({ error: "Jeu introuvable." }, { status: 404 });
    }

    const merchantId = readText(game.merchantId) || null;
    const qrCodeUrl = readText(game.qrCodeUrl);

    if (!qrCodeUrl) {
      return NextResponse.json({ error: "qrCodeUrl manquant sur le jeu." }, { status: 500 });
    }

    const [merchantName, logoDataUrl] = await Promise.all([
      resolveMerchantName(merchantId),
      readLogoDataUrl(),
    ]);

    const qrCodeOptions = {
      width: 200,
      margin: 1,
      color: {
        dark: "#FFFFFF",
        light: "#2D2A6E",
      },
    } as unknown as Parameters<typeof QRCode.toDataURL>[1];
    const qrCodeDataUrl = await QRCode.toDataURL(qrCodeUrl, qrCodeOptions);

    const prizeImageUrl = readPrizeImageUrl(game);
    const prizeImageDataUrl = prizeImageUrl
      ? await fetchAsDataUrl(prizeImageUrl, "image/jpeg").catch(() => buildPrizeImageFallbackDataUrl())
      : buildPrizeImageFallbackDataUrl();

    const gainHeadline = buildPosterGainHeadline(game);
    const templateData: PosterTemplateData = {
      altTitle: readText(game.title, game.name, gainHeadline.mainPrizeLabel, "Jeu ProxiPlay"),
      headlineLead: gainHeadline.lead,
      headlineAccent: gainHeadline.accent,
      badgeLabel: gainHeadline.badge,
      mainPrizeLabel: gainHeadline.mainPrizeLabel,
      description: readText(
        game.mainPrizeDescription,
        game.main_prize_description,
        game.description,
      ),
      merchantName,
      startDateLabel: readDateLabel(game.startDate ?? game.start_date),
      endDateLabel: readDateLabel(game.endDate ?? game.end_date),
      qrCodeDataUrl,
      prizeImageDataUrl,
      firstSecondaryPrizeLabel: getFirstSecondaryPrizeLabel(game),
      restrictedToAdults:
        game.restrictedToAdults === true || game.prohibited_for_minors === true,
      logoDataUrl,
    };

    const executablePath = await getChromiumExecutablePath();

    browser = await puppeteer.launch({
      args: puppeteer.defaultArgs({
        args: chromium.args,
        headless: "shell",
      }),
      defaultViewport: {
        width: 1240,
        height: 1754,
        deviceScaleFactor: 2,
      },
      executablePath,
      headless: "shell",
    });

    const page = await browser.newPage();
    await page.setContent(generatePosterHTML(templateData), { waitUntil: "domcontentloaded" });
    await page.waitForNetworkIdle();

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    return new NextResponse(Buffer.from(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="affiche-${gameId}.pdf"`,
      },
    });
  } catch (error) {
    console.error("[GENERATE_POSTER_ERROR]", error);
    return NextResponse.json(
      { error: "Impossible de generer l affiche PDF pour le moment." },
      { status: 500 },
    );
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}
