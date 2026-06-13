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

const PROXIPLAY_WORDMARK_PATH = "/proxiplay-wordmark.png";

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
    throw new Error("Impossible d’ouvrir la fenêtre d’impression.");
  }

  printWindow.document.open();
  printWindow.document.write(`<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Préparation de l’affiche...</title>
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
      <h1 class="loading-title">Préparation de l’affiche</h1>
      <p class="loading-text">Le visuel premium est en cours de génération...</p>
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
    const safeMerchantName = escapeHtml(game.merchantName.trim() || "Commerçant");
    const safeDescription = escapeHtml(game.description.trim());
    const safeDates = escapeHtml(`${game.startDateLabel} au ${game.endDateLabel}`);
    const safeMainPrize = escapeHtml(game.mainPrizeLabel?.trim() || "");
    const safeSecondaryPrizes = escapeHtml(game.secondaryPrizeSummary?.trim() || "");
    const safeImageUrl = game.imageUrl ? escapeHtml(game.imageUrl) : null;
    const safeFileName = sanitizeFileName(`${game.merchantName}-${game.title}`) || game.id;
    const safeWordmarkUrl = escapeHtml(
      new URL(PROXIPLAY_WORDMARK_PATH, window.location.origin).toString(),
    );
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
        height: 297mm;
        --brand-navy: #29286A;
        --brand-frame: #A0134D;
        --brand-pink: #B2145A;
        --brand-orange: #F27B3D;
        --brand-green: #6EC12B;
        --brand-yellow: #FFF12B;
        --brand-blue: #90A6D8;
        --paper: #fbf8f3;
        background:
          radial-gradient(circle at top left, rgba(160, 19, 77, 0.14), transparent 26%),
          radial-gradient(circle at bottom right, rgba(110, 193, 43, 0.14), transparent 30%),
          radial-gradient(circle at 82% 16%, rgba(242, 123, 61, 0.13), transparent 16%),
          linear-gradient(180deg, #fcfaf7 0%, #f4efe7 100%);
        color: #191919;
        font-family: Georgia, "Times New Roman", serif;
      }
      body {
        position: relative;
        overflow: hidden;
      }
      .sheet {
        width: 210mm;
        height: 297mm;
        padding: 8mm;
      }
      .poster {
        width: 100%;
        height: 281mm;
        margin: 0;
        display: grid;
        grid-template-rows: auto auto 1fr auto;
        gap: 4mm;
        background:
          radial-gradient(circle at top right, rgba(255, 241, 43, 0.18), transparent 18%),
          radial-gradient(circle at bottom left, rgba(144, 166, 216, 0.12), transparent 22%),
          linear-gradient(180deg, rgba(255,255,255,0.99) 0%, rgba(248,244,238,0.99) 100%);
        border: 2.2mm solid var(--brand-frame);
        border-radius: 7mm;
        overflow: hidden;
        box-shadow:
          0 20px 60px rgba(41, 40, 106, 0.1),
          inset 0 0 0 1.2mm rgba(255, 255, 255, 0.72);
      }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6mm 7mm 0;
      }
      .brand-wordmark {
        width: 92mm;
        max-width: 100%;
      }
      .brand-wordmark img {
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
        border: 1px solid rgba(160, 19, 77, 0.18);
        background: rgba(255, 255, 255, 0.9);
        font-family: "Segoe UI", Arial, sans-serif;
      }
      .badge-danger {
        color: var(--brand-frame);
        background: rgba(160, 19, 77, 0.08);
        border-color: rgba(160, 19, 77, 0.2);
      }
      .intro-band {
        margin: 0 7mm;
        border-radius: 5mm;
        padding: 5.5mm 6mm;
        background:
          linear-gradient(135deg, var(--brand-navy) 0%, #3f378f 34%, var(--brand-frame) 74%, var(--brand-orange) 100%);
        color: #ffffff;
        display: grid;
        grid-template-columns: 1fr 44mm;
        gap: 6mm;
        align-items: center;
        box-shadow: inset 0 0 0 0.4mm rgba(255, 255, 255, 0.16);
      }
      .intro-copy {
        display: grid;
        gap: 1.8mm;
      }
      .eyebrow {
        font-family: "Segoe UI", Arial, sans-serif;
        font-size: 8.5pt;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        opacity: 0.9;
      }
      .intro-title {
        margin: 0;
        font-size: 24pt;
        line-height: 0.96;
        font-weight: 800;
        text-wrap: balance;
      }
      .intro-subtitle {
        font-family: "Segoe UI", Arial, sans-serif;
        font-size: 10.5pt;
        line-height: 1.38;
        max-width: 82mm;
        opacity: 0.96;
      }
      .scan-panel {
        border-radius: 4.5mm;
        background: linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.08));
        border: 1px solid rgba(255,255,255,0.24);
        padding: 3mm;
        text-align: center;
        box-shadow: inset 0 0 0 0.4mm rgba(255,255,255,0.08);
      }
      .scan-panel img {
        width: 34mm;
        height: 34mm;
        display: block;
        margin: 0 auto;
        border-radius: 3.2mm;
        background: #ffffff;
        padding: 1.7mm;
      }
      .scan-label {
        margin-top: 1.4mm;
        font-family: "Segoe UI", Arial, sans-serif;
        font-size: 8.7pt;
        font-weight: 700;
      }
      .hero {
        display: grid;
        grid-template-columns: 1.08fr 0.92fr;
        gap: 6mm;
        padding: 0 7mm;
        align-items: start;
      }
      .hero-visual {
        min-height: 104mm;
        max-height: 118mm;
        border-radius: 5mm;
        overflow: hidden;
        background: linear-gradient(180deg, rgba(144,166,216,0.12), rgba(255,255,255,0.5));
        border: 1px solid rgba(41, 40, 106, 0.08);
        box-shadow:
          0 10px 25px rgba(41, 40, 106, 0.08),
          inset 0 0 0 1px rgba(255,255,255,0.25);
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
        min-height: 104mm;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 8mm;
        text-align: center;
        font-size: 21pt;
        font-weight: 800;
        color: var(--brand-navy);
        background:
          radial-gradient(circle at top left, rgba(160, 19, 77, 0.18), transparent 42%),
          radial-gradient(circle at bottom right, rgba(110, 193, 43, 0.16), transparent 38%),
          linear-gradient(160deg, #faf8ff 0%, #eef4ff 100%);
      }
      .hero-copy {
        display: flex;
        flex-direction: column;
        gap: 2.7mm;
        min-width: 0;
      }
      .merchant-chip {
        align-self: flex-start;
        border-radius: 999px;
        padding: 1.6mm 3.3mm;
        background: linear-gradient(180deg, rgba(255, 241, 43, 0.3), rgba(255, 255, 255, 0.92));
        color: var(--brand-frame);
        border: 1px solid rgba(160, 19, 77, 0.18);
        font-family: "Segoe UI", Arial, sans-serif;
        font-size: 8.3pt;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .title {
        margin: 0;
        font-size: 21pt;
        line-height: 1;
        font-weight: 800;
        color: var(--brand-navy);
        text-wrap: balance;
      }
      .section-copy {
        display: grid;
        gap: 1.4mm;
      }
      .section-kicker {
        font-family: "Segoe UI", Arial, sans-serif;
        font-size: 8pt;
        font-weight: 700;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--brand-frame);
      }
      .description {
        margin: 0;
        font-size: 10.6pt;
        line-height: 1.46;
        color: #514d58;
      }
      .meta-card {
        margin: 0 7mm 7mm;
        border: 1px solid rgba(160, 19, 77, 0.14);
        border-radius: 5mm;
        background:
          linear-gradient(180deg, rgba(255,255,255,0.98), rgba(250,247,242,0.98));
        padding: 4.5mm;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 3mm 4mm;
        box-shadow: inset 0 0 0 0.6mm rgba(255, 255, 255, 0.6);
      }
      .meta-row {
        display: grid;
        grid-template-columns: 1fr;
        gap: 0.8mm;
        align-items: start;
        border-radius: 3.6mm;
        padding: 3.2mm;
        background:
          linear-gradient(180deg, rgba(255, 241, 43, 0.16) 0%, rgba(255,255,255,0.94) 36%, rgba(144, 166, 216, 0.1) 100%);
      }
      .meta-label {
        font-family: "Segoe UI", Arial, sans-serif;
        font-size: 7.8pt;
        font-weight: 700;
        color: #7b7b7b;
        text-transform: uppercase;
        letter-spacing: 0.12em;
      }
      .meta-value {
        font-size: 10.3pt;
        line-height: 1.35;
        color: #2b2a38;
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
          height: 297mm;
        }
        .sheet {
          width: 210mm;
          height: 297mm;
          padding: 8mm;
        }
        .poster {
          width: 100%;
          height: 281mm;
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
        <div class="brand-wordmark">
          <img src="${safeWordmarkUrl}" alt="ProxiPlay" />
        </div>
        ${adultBadge}
      </header>
      <section class="intro-band">
        <div class="intro-copy">
          <div class="eyebrow">Scannez, jouez, gagnez</div>
          <h1 class="intro-title">Tentez votre chance</h1>
          <div class="intro-subtitle">Un jeu instantané à découvrir directement chez votre commerçant ProxiPlay.</div>
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
            <p class="description">Scannez le QR code, ouvrez le jeu sur votre téléphone et jouez en quelques secondes pour tenter de remporter les lots proposés.</p>
          </div>
        </div>
      </section>
      <section class="meta-card">
        <div class="meta-row"><span class="meta-label">Période</span><span class="meta-value">${safeDates}</span></div>
        <div class="meta-row"><span class="meta-label">Commerçant</span><span class="meta-value">${safeMerchantName}</span></div>
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
        : "Impossible de générer l’affiche.";

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
