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

type FirestoreGameDocument = {
  title?: string;
  name?: string;
  description?: string;
  startDate?: TimestampLike | null;
  start_date?: TimestampLike | null;
  endDate?: TimestampLike | null;
  end_date?: TimestampLike | null;
  merchantId?: string | null;
  qrCodeUrl?: string | null;
  prizeImageUrl?: string | null;
  secondaryPrizes?: Array<{ name?: string; description?: string } | string> | null;
};

type FirestoreMerchantDocument = {
  name?: string;
};

type PosterTemplateData = {
  title: string;
  description: string;
  merchantName: string;
  startDateLabel: string;
  endDateLabel: string;
  qrCodeDataUrl: string;
  prizeImageDataUrl: string;
  firstSecondaryPrizeLabel: string;
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

function getFirstSecondaryPrizeLabel(
  secondaryPrizes: FirestoreGameDocument["secondaryPrizes"],
) {
  if (!Array.isArray(secondaryPrizes)) {
    return "Aucun";
  }

  for (const prize of secondaryPrizes) {
    if (typeof prize === "string") {
      const normalized = prize.trim();
      if (normalized) {
        return normalized;
      }
      continue;
    }

    const label = readText(prize?.name, prize?.description);
    if (label) {
      return label;
    }
  }

  return "Aucun";
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
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#FFF3D6" />
          <stop offset="100%" stop-color="#F7D8E6" />
        </linearGradient>
      </defs>
      <rect width="1200" height="800" fill="url(#bg)" />
      <circle cx="190" cy="170" r="150" fill="rgba(245,166,35,0.38)" />
      <circle cx="1030" cy="150" r="180" fill="rgba(45,42,110,0.12)" />
      <circle cx="920" cy="690" r="220" fill="rgba(192,0,108,0.16)" />
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function readLogoDataUrl() {
  const logoCandidates = [
    path.join(/* turbopackIgnore: true */ process.cwd(), "public", "logo-proxiplay.png"),
    path.join(/* turbopackIgnore: true */ process.cwd(), "public", "proxiplay-wordmark.png"),
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
  const safeTitle = escapeHtml(data.title);
  const safeDescription = escapeHtml(data.description);
  const safeMerchantName = escapeHtml(data.merchantName);
  const safeStartDate = escapeHtml(data.startDateLabel);
  const safeEndDate = escapeHtml(data.endDateLabel);
  const safeFirstSecondaryPrize = escapeHtml(data.firstSecondaryPrizeLabel);

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
        padding: 24px;
        background: #ffffff;
      }
      .poster {
        width: 100%;
        height: 100%;
        border: 3px solid #8B1A4A;
        border-radius: 16px;
        padding: 24px;
        background:
          radial-gradient(circle at top left, rgba(245,166,35,0.12), transparent 20%),
          radial-gradient(circle at bottom right, rgba(192,0,108,0.08), transparent 16%),
          #ffffff;
        display: flex;
        flex-direction: column;
        gap: 18px;
      }
      .header {
        display: flex;
        justify-content: space-between;
        gap: 18px;
        align-items: flex-start;
      }
      .header-left {
        flex: 1;
        min-width: 0;
      }
      .logo {
        width: 220px;
        max-width: 100%;
        height: auto;
        display: block;
      }
      .tagline {
        margin-top: 12px;
        color: #C0006C;
        font-size: 13px;
        font-weight: 900;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }
      .gain-title {
        margin: 8px 0 0;
        color: #2D2A6E;
        font-family: "Bebas Neue", Impact, sans-serif;
        font-size: 52px;
        line-height: 0.92;
        letter-spacing: 0.02em;
      }
      .gain-accent {
        color: #C0006C;
      }
      .merchant-line {
        margin-top: 10px;
        font-size: 17px;
        line-height: 1.45;
        color: #2A273B;
      }
      .merchant-line strong {
        font-weight: 900;
      }
      .description {
        margin-top: 8px;
        font-size: 13px;
        line-height: 1.55;
        color: #5A5870;
      }
      .header-right {
        width: 140px;
        flex-shrink: 0;
        border-radius: 12px;
        background: #2D2A6E;
        padding: 12px 10px 14px;
        color: #ffffff;
        text-align: center;
        box-shadow: 0 18px 36px rgba(45, 42, 110, 0.22);
      }
      .chance-title {
        font-size: 12px;
        font-weight: 900;
        line-height: 1.25;
        letter-spacing: 0.08em;
      }
      .qr-frame {
        margin: 10px auto 0;
        width: 116px;
        height: 116px;
        border-radius: 10px;
        background: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 8px;
      }
      .qr-frame img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
      }
      .deadline-badge {
        margin-top: 10px;
        border-radius: 999px;
        background: #F5A623;
        color: #2D2A6E;
        padding: 7px 8px;
        font-size: 11px;
        font-weight: 900;
      }
      .middle {
        display: flex;
        gap: 18px;
        align-items: stretch;
        flex: 1;
        min-height: 0;
      }
      .visual-wrapper {
        position: relative;
        flex: 1;
        min-width: 0;
      }
      .prize-image {
        width: 100%;
        height: 200px;
        border-radius: 8px;
        object-fit: cover;
        display: block;
      }
      .prize-badge {
        position: absolute;
        top: 12px;
        right: 12px;
        width: 84px;
        height: 84px;
        border-radius: 999px;
        background: #F5A623;
        color: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        font-size: 14px;
        font-weight: 900;
        line-height: 1.1;
        box-shadow: 0 12px 26px rgba(245, 166, 35, 0.28);
      }
      .steps {
        width: 140px;
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 0;
      }
      .step {
        padding: 14px 0;
      }
      .step + .step {
        border-top: 1px solid #D8D8DD;
      }
      .step-index {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        border-radius: 999px;
        background: #C0006C;
        color: #ffffff;
        font-size: 13px;
        font-weight: 900;
      }
      .step-title {
        margin-top: 10px;
        color: #2D2A6E;
        font-size: 18px;
        font-weight: 900;
      }
      .step-text {
        margin-top: 4px;
        color: #5A5870;
        font-size: 13px;
        line-height: 1.4;
      }
      .footer {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        border-radius: 10px;
        background: #F7F7F5;
        padding: 14px 16px;
      }
      .footer-block {
        min-width: 0;
      }
      .footer-label {
        color: #8B1A4A;
        font-size: 11px;
        font-weight: 900;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .footer-value {
        margin-top: 6px;
        color: #2A273B;
        font-size: 13px;
        line-height: 1.4;
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
            <h1 class="gain-title">${safeTitle}<br /><span class="gain-accent">À GAGNER</span></h1>
            <div class="merchant-line">Une offre locale gratuite chez <strong>${safeMerchantName}</strong></div>
            <p class="description">${safeDescription || "Scannez le QR code et tentez votre chance tout de suite."}</p>
          </div>
          <aside class="header-right">
            <div class="chance-title">TENTEZ VOTRE CHANCE</div>
            <div class="qr-frame">
              <img src="${data.qrCodeDataUrl}" alt="QR code du jeu" />
            </div>
            <div class="deadline-badge">Fin le ${safeEndDate}</div>
          </aside>
        </section>

        <section class="middle">
          <div class="visual-wrapper">
            <img class="prize-image" src="${data.prizeImageDataUrl}" alt="${safeTitle}" />
            <div class="prize-badge">À GAGNER</div>
          </div>
          <div class="steps">
            <div class="step">
              <div class="step-index">1</div>
              <div class="step-title">SCANNEZ</div>
              <div class="step-text">le QR code</div>
            </div>
            <div class="step">
              <div class="step-index">2</div>
              <div class="step-title">GRATTEZ</div>
              <div class="step-text">et jouez tout de suite</div>
            </div>
            <div class="step">
              <div class="step-index">3</div>
              <div class="step-title">GAGNEZ</div>
              <div class="step-text">votre lot immediatement</div>
            </div>
          </div>
        </section>

        <section class="footer">
          <div class="footer-block">
            <div class="footer-label">PÉRIODE</div>
            <div class="footer-value">${safeStartDate} au ${safeEndDate}</div>
          </div>
          <div class="footer-block">
            <div class="footer-label">COMMERÇANT</div>
            <div class="footer-value">${safeMerchantName}</div>
          </div>
          <div class="footer-block">
            <div class="footer-label">LOT</div>
            <div class="footer-value">${safeTitle}</div>
          </div>
          <div class="footer-block">
            <div class="footer-label">SECONDAIRES</div>
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
    } as Parameters<typeof QRCode.toDataURL>[1];
    const qrCodeDataUrl = await QRCode.toDataURL(qrCodeUrl, qrCodeOptions);

    const prizeImageDataUrl = game.prizeImageUrl
      ? await fetchAsDataUrl(game.prizeImageUrl, "image/jpeg")
      : buildPrizeImageFallbackDataUrl();

    const templateData: PosterTemplateData = {
      title: readText(game.title, game.name, "Jeu ProxiPlay"),
      description: readText(game.description),
      merchantName,
      startDateLabel: readDateLabel(game.startDate ?? game.start_date),
      endDateLabel: readDateLabel(game.endDate ?? game.end_date),
      qrCodeDataUrl,
      prizeImageDataUrl,
      firstSecondaryPrizeLabel: getFirstSecondaryPrizeLabel(game.secondaryPrizes),
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
