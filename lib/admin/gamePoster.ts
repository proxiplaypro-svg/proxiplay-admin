"use client";

import QRCode from "qrcode";

export type PrintableGamePosterData = {
  id: string;
  title: string;
  merchantName: string;
  description: string;
  imageUrl: string | null;
  startDateLabel: string;
  endDateLabel: string;
  merchantId: string | null;
  animationId?: string | null;
  restrictedToAdults?: boolean;
  mainPrizeLabel?: string | null;
  secondaryPrizeSummary?: string | null;
};

const PROXIPLAY_WORDMARK_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 150" role="img" aria-label="ProxiPlay">
  <g transform="translate(6 6)">
    <rect width="138" height="138" rx="30" fill="#FFFFFF"/>
    <path d="M47 40c-13.6 0-24.2-8.8-24.2-20.8S33.4-1.6 47-1.6c17 0 30.2 16.8 30.2 33.8v8.8h-8.8c-17.2 0-21.2-19.8-21.2-28.8 0-3.6.6-6.8 1.8-9.8-7.6 2.2-13.8 9.2-13.8 18.2 0 7.8 5.8 14.2 11.8 14.2z" fill="#FFFFFF" stroke="#29286A" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M91 40c13.6 0 24.2-8.8 24.2-20.8S104.6-1.6 91-1.6c-17 0-30.2 16.8-30.2 33.8v8.8h8.8c17.2 0 21.2-19.8 21.2-28.8 0-3.6-.6-6.8-1.8-9.8 7.6 2.2 13.8 9.2 13.8 18.2 0 7.8-5.8 14.2-11.8 14.2z" fill="#FFFFFF" stroke="#29286A" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="4" y="40" width="130" height="98" rx="22" fill="#FFFFFF" stroke="#29286A" stroke-width="11"/>
    <rect x="28" y="64" width="82" height="50" rx="8" fill="#29286A"/>
    <path d="M28 64h30v50H28z" fill="#B2145A"/>
    <path d="M110 64H80v50h30z" fill="#F27B3D"/>
    <path d="M28 114h54L55 87z" fill="#90A6D8"/>
    <path d="M110 114H80L55 89l25-25z" fill="#6EC12B"/>
    <rect x="55" y="75" width="25" height="25" rx="4" transform="rotate(45 67.5 87.5)" fill="#FFF12B"/>
  </g>
  <text
    x="178"
    y="106"
    font-family="Arial Rounded MT Bold, Trebuchet MS, Verdana, sans-serif"
    font-size="112"
    font-weight="900"
    fill="#FFFFFF"
    stroke="#29286A"
    stroke-width="18"
    paint-order="stroke fill"
    stroke-linejoin="round"
  >ProxiPlay</text>
</svg>
`;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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

export function buildGamePosterDeepLink(game: {
  id: string;
  merchantId: string | null;
  animationId?: string | null;
}) {
  const params = new URLSearchParams();

  if (game.animationId) {
    params.set("animationId", game.animationId);
    params.set("animation_id", game.animationId);
  }

  if (game.merchantId) {
    params.set("merchantId", game.merchantId);
    params.set("merchant_id", game.merchantId);
  }

  const queryString = params.toString();
  return `https://proxiplay.fr/j/${game.id}${queryString ? `?${queryString}` : ""}`;
}

export async function openGamePosterPrintWindow(game: PrintableGamePosterData) {
  const printWindow = window.open("", "_blank");

  if (!printWindow) {
    throw new Error("Impossible d ouvrir la fenetre d impression.");
  }

  printWindow.document.open();
  printWindow.document.write(`<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Preparation de l affiche...</title>
    <style>
      html, body {
        margin: 0;
        min-height: 100%;
        background: #f7f7f5;
        color: #1a1a1a;
        font-family: "Segoe UI", Arial, sans-serif;
      }
      body {
        display: grid;
        place-items: center;
      }
      .loading-card {
        width: min(92vw, 420px);
        padding: 28px 24px;
        border: 1px solid #e8e8e4;
        border-radius: 20px;
        background: #ffffff;
        text-align: center;
        box-shadow: 0 20px 50px rgba(26, 26, 26, 0.08);
      }
      .loading-title {
        margin: 0;
        font-size: 24px;
        font-weight: 800;
      }
      .loading-text {
        margin: 10px 0 0;
        color: #666666;
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <div class="loading-card">
      <h1 class="loading-title">Preparation de l affiche</h1>
      <p class="loading-text">Le visuel premium est en cours de generation...</p>
    </div>
  </body>
</html>`);
  printWindow.document.close();

  try {
    const qrCodeOptions = {
      width: 720,
      margin: 0,
      color: {
        dark: "#1A1A1A",
        light: "#FFFFFF",
      },
    } as Parameters<typeof QRCode.toDataURL>[1];

    const deepLink = buildGamePosterDeepLink(game);
    const qrCodeUrl = await QRCode.toDataURL(deepLink, qrCodeOptions);

    const safeTitle = escapeHtml(game.title.trim() || "Jeu ProxiPlay");
    const safeMerchantName = escapeHtml(game.merchantName.trim() || "Commercant");
    const safeDescription = escapeHtml(game.description.trim());
    const safeDates = escapeHtml(`${game.startDateLabel} au ${game.endDateLabel}`);
    const safeMainPrize = escapeHtml(game.mainPrizeLabel?.trim() || "");
    const safeSecondaryPrizes = escapeHtml(game.secondaryPrizeSummary?.trim() || "");
    const safeImageUrl = game.imageUrl ? escapeHtml(game.imageUrl) : null;
    const safeFileName = sanitizeFileName(`${game.merchantName}-${game.title}`) || game.id;
    const adultBadge = game.restrictedToAdults
      ? '<span class="badge badge-danger">18+</span>'
      : "";
    const mainPrizeBlock = safeMainPrize
      ? `<div class="meta-row"><span class="meta-label">Lot principal</span><span class="meta-value">${safeMainPrize}</span></div>`
      : "";
    const secondaryPrizeBlock = safeSecondaryPrizes
      ? `<div class="meta-row"><span class="meta-label">Lots secondaires</span><span class="meta-value">${safeSecondaryPrizes}</span></div>`
      : "";
    const descriptionBlock = safeDescription
      ? `<div class="section-copy"><div class="section-kicker">Description</div><p class="description">${safeDescription}</p></div>`
      : "";
    const coverBlock = safeImageUrl
      ? `<img class="hero-image" src="${safeImageUrl}" alt="${safeTitle}" />`
      : `<div class="hero-fallback">Affiche ProxiPlay</div>`;
    const merchantBlock = `<div class="merchant-chip">${safeMerchantName}</div>`;

    printWindow.document.open();
    printWindow.document.write(`<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Affiche ${safeTitle}</title>
    <style>
      @page {
        size: A4 portrait;
        margin: 0;
      }
      * {
        box-sizing: border-box;
      }
      html, body {
        margin: 0;
        padding: 0;
        width: 210mm;
        min-height: 297mm;
        --brand-navy: #29286A;
        --brand-pink: #B2145A;
        --brand-orange: #F27B3D;
        --brand-green: #6EC12B;
        --brand-yellow: #FFF12B;
        --brand-blue: #90A6D8;
        --paper: #f6f3ee;
        background:
          radial-gradient(circle at top left, rgba(178, 20, 90, 0.12), transparent 24%),
          radial-gradient(circle at bottom right, rgba(110, 193, 43, 0.16), transparent 30%),
          radial-gradient(circle at 85% 18%, rgba(36, 40, 106, 0.1), transparent 18%),
          #f3f1ed;
        color: #1a1a1a;
        font-family: Georgia, "Times New Roman", serif;
      }
      body {
        position: relative;
      }
      .sheet {
        width: 210mm;
        min-height: 297mm;
        padding: 12mm;
      }
      .poster {
        width: 100%;
        min-height: 273mm;
        margin: 0;
        display: grid;
        grid-template-rows: auto auto auto 1fr;
        gap: 6mm;
        background:
          linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(246,243,238,0.98) 100%);
        border: 1px solid #dfd9cd;
        border-radius: 8mm;
        overflow: hidden;
        box-shadow: 0 18px 60px rgba(26, 26, 26, 0.08);
      }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8mm 10mm 0;
      }
      .brand-wordmark {
        width: 94mm;
        max-width: 100%;
      }
      .brand-wordmark svg {
        display: block;
        width: 100%;
        height: auto;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 2.2mm 4.2mm;
        font-size: 10pt;
        font-weight: 700;
        border: 1px solid #e1b5b5;
        background: #ffffff;
        font-family: "Segoe UI", Arial, sans-serif;
      }
      .badge-danger {
        color: #a32d2d;
        background: #fcebeb;
        border-color: #f1c4c4;
      }
      .intro-band {
        margin: 0 10mm;
        border-radius: 6mm;
        padding: 7mm 8mm;
        background:
          linear-gradient(135deg, var(--brand-navy) 0%, #3b368a 32%, var(--brand-pink) 100%);
        color: #ffffff;
        display: grid;
        grid-template-columns: 1fr 50mm;
        gap: 8mm;
        align-items: center;
      }
      .intro-copy {
        display: grid;
        gap: 2.5mm;
      }
      .eyebrow {
        font-family: "Segoe UI", Arial, sans-serif;
        font-size: 9pt;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        opacity: 0.9;
      }
      .intro-title {
        margin: 0;
        font-size: 29pt;
        line-height: 0.98;
        font-weight: 800;
      }
      .intro-subtitle {
        font-family: "Segoe UI", Arial, sans-serif;
        font-size: 12pt;
        line-height: 1.5;
        max-width: 92mm;
        opacity: 0.96;
      }
      .scan-panel {
        border-radius: 5mm;
        background: rgba(255,255,255,0.12);
        border: 1px solid rgba(255,255,255,0.24);
        padding: 4mm;
        text-align: center;
      }
      .scan-panel img {
        width: 40mm;
        height: 40mm;
        display: block;
        margin: 0 auto;
        border-radius: 4mm;
        background: #ffffff;
        padding: 2mm;
      }
      .scan-label {
        margin-top: 2mm;
        font-family: "Segoe UI", Arial, sans-serif;
        font-size: 9.5pt;
        font-weight: 700;
      }
      .hero {
        display: grid;
        grid-template-columns: 1.08fr 0.92fr;
        gap: 8mm;
        padding: 0 10mm 0;
        align-items: start;
      }
      .hero-visual {
        min-height: 116mm;
        border-radius: 6mm;
        overflow: hidden;
        background: #f4f2fb;
        border: 1px solid rgba(41, 40, 106, 0.08);
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.25);
      }
      .hero-image {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .hero-fallback {
        width: 100%;
        height: 100%;
        min-height: 116mm;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 10mm;
        text-align: center;
        font-size: 24pt;
        font-weight: 800;
        color: var(--brand-navy);
        background:
          radial-gradient(circle at top left, rgba(178, 20, 90, 0.16), transparent 42%),
          radial-gradient(circle at bottom right, rgba(110, 193, 43, 0.18), transparent 38%),
          linear-gradient(160deg, #faf8ff 0%, #eef4ff 100%);
      }
      .hero-copy {
        display: flex;
        flex-direction: column;
        gap: 4mm;
      }
      .merchant-chip {
        align-self: flex-start;
        border-radius: 999px;
        padding: 2mm 4mm;
        background: rgba(144, 166, 216, 0.18);
        color: var(--brand-navy);
        border: 1px solid rgba(144, 166, 216, 0.5);
        font-family: "Segoe UI", Arial, sans-serif;
        font-size: 9pt;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .title {
        margin: 0;
        font-size: 25pt;
        line-height: 1.02;
        font-weight: 800;
      }
      .section-copy {
        display: grid;
        gap: 2mm;
      }
      .section-kicker {
        font-family: "Segoe UI", Arial, sans-serif;
        font-size: 8.5pt;
        font-weight: 700;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--brand-pink);
      }
      .description {
        margin: 0;
        font-size: 12pt;
        line-height: 1.62;
        color: #555555;
      }
      .meta-card {
        margin: 0 10mm 10mm;
        border: 1px solid #e8e4dc;
        border-radius: 5mm;
        background: #ffffff;
        padding: 6mm;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 4mm 6mm;
      }
      .meta-row {
        display: grid;
        grid-template-columns: 1fr;
        gap: 1.2mm;
        align-items: start;
        border-radius: 4mm;
        padding: 4mm;
        background: linear-gradient(180deg, rgba(255, 241, 43, 0.12) 0%, rgba(255,255,255,0.92) 100%);
      }
      .meta-label {
        font-family: "Segoe UI", Arial, sans-serif;
        font-size: 8.5pt;
        font-weight: 700;
        color: #7b7b7b;
        text-transform: uppercase;
        letter-spacing: 0.12em;
      }
      .meta-value {
        font-size: 12pt;
        line-height: 1.4;
      }
      .print-tools {
        position: fixed;
        top: 14px;
        right: 14px;
        display: flex;
        gap: 8px;
      }
      .print-tools button {
        border: 0;
        border-radius: 999px;
        padding: 10px 16px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
      }
      .print-button {
        background: #639922;
        color: #ffffff;
      }
      .download-button {
        background: #ffffff;
        color: #1a1a1a;
        border: 1px solid #d9d4ca !important;
      }
      @media print {
        body {
          background: #ffffff;
          width: 210mm;
          min-height: 297mm;
        }
        .sheet {
          width: 210mm;
          min-height: 297mm;
          padding: 12mm;
        }
        .poster {
          width: 100%;
          min-height: 273mm;
          border: 0;
          border-radius: 0;
          box-shadow: none;
        }
        .print-tools {
          display: none;
        }
      }
    </style>
  </head>
  <body>
    <div class="print-tools">
      <button class="download-button" onclick="window.print()">Imprimer</button>
      <button class="print-button" onclick="window.close()">Fermer</button>
    </div>
    <div class="sheet">
    <main class="poster">
      <header class="header">
        <div class="brand-wordmark" aria-hidden="true">
          ${PROXIPLAY_WORDMARK_SVG}
        </div>
        ${adultBadge}
      </header>
      <section class="intro-band">
        <div class="intro-copy">
          <div class="eyebrow">Scannez, jouez, gagnez</div>
          <h1 class="intro-title">Tentez votre chance</h1>
          <div class="intro-subtitle">Un jeu instantane a decouvrir directement chez votre commercant ProxiPlay.</div>
        </div>
        <aside class="scan-panel">
          <img src="${qrCodeUrl}" alt="QR code ${safeTitle}" />
          <div class="scan-label">Scannez pour participer</div>
        </aside>
      </section>
      <section class="hero">
        <div class="hero-visual">${coverBlock}</div>
        <div class="hero-copy">
          ${merchantBlock}
          <h1 class="title">${safeTitle}</h1>
          ${descriptionBlock}
          <div class="section-copy">
            <div class="section-kicker">Comment jouer</div>
            <p class="description">Scannez le QR code, ouvrez le jeu sur votre telephone et jouez en quelques secondes pour tenter de remporter les lots proposes.</p>
          </div>
        </div>
      </section>
      <section class="meta-card">
        <div class="meta-row"><span class="meta-label">Periode</span><span class="meta-value">${safeDates}</span></div>
        <div class="meta-row"><span class="meta-label">Commercant</span><span class="meta-value">${safeMerchantName}</span></div>
        ${mainPrizeBlock}
        ${secondaryPrizeBlock}
      </section>
    </main>
    </div>
    <script>
      window.addEventListener("load", () => {
        document.title = "affiche-${safeFileName}";
        window.setTimeout(() => {
          window.print();
        }, 450);
      });
    </script>
  </body>
</html>`);
    printWindow.document.close();
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim()
        ? escapeHtml(error.message)
        : "Impossible de generer l affiche.";

    printWindow.document.open();
    printWindow.document.write(`<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Erreur affiche</title>
    <style>
      html, body {
        margin: 0;
        min-height: 100%;
        background: #fff7f7;
        color: #1a1a1a;
        font-family: "Segoe UI", Arial, sans-serif;
      }
      body {
        display: grid;
        place-items: center;
      }
      .error-card {
        width: min(92vw, 460px);
        padding: 28px 24px;
        border: 1px solid #f1c4c4;
        border-radius: 20px;
        background: #ffffff;
        box-shadow: 0 20px 50px rgba(26, 26, 26, 0.08);
      }
      .error-title {
        margin: 0;
        font-size: 22px;
        font-weight: 800;
        color: #a32d2d;
      }
      .error-text {
        margin: 12px 0 0;
        color: #666666;
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <div class="error-card">
      <h1 class="error-title">Affiche indisponible</h1>
      <p class="error-text">${message}</p>
    </div>
  </body>
</html>`);
    printWindow.document.close();
    throw error;
  }
}
