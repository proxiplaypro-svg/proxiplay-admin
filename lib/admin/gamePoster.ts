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
  mainPrizeTitle?: string | null;
  secondaryPrizeTitle?: string | null;
  secondaryPrizeSummary?: string | null;
};

export type PrintableGameFacebookPostData = {
  id: string;
  title: string;
  merchantName: string;
  description: string;
  imageUrl: string | null;
  prizeImageUrl?: string | null;
  merchantId: string | null;
  animationId?: string | null;
  restrictedToAdults?: boolean;
  mainPrizeLabel?: string | null;
  mainPrizeTitle?: string | null;
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

export async function downloadGamePosterPdf(gameId: string) {
  const normalizedGameId = gameId.trim();

  if (!normalizedGameId) {
    throw new Error("Identifiant de jeu manquant.");
  }

  const response = await fetch("/api/generate-poster", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gameId: normalizedGameId }),
  });

  if (!response.ok) {
    throw new Error("Erreur generation PDF");
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `affiche-${normalizedGameId}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function buildFacebookCaption({
  title,
  merchantName,
  description,
  link,
  mainPrizeLabel,
}: {
  title: string;
  merchantName: string;
  description: string;
  link: string;
  mainPrizeLabel?: string | null;
}) {
  const lines = [
    `${title}${merchantName ? ` chez ${merchantName}` : ""}`,
    mainPrizeLabel ? `Lot a gagner: ${mainPrizeLabel}` : "",
    description,
    `Jouez ici: ${link}`,
  ].filter((line) => line.trim().length > 0);

  return lines.join("\n\n");
}

function normalizePromotionalCopy(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ") || "";
}

function looksGenericPrizeLabel(value: string) {
  const normalized = value.toLowerCase();

  return (
    normalized.length === 0 ||
    normalized === "lot a gagner" ||
    normalized === "lot principal configure" ||
    normalized === "lot principal configuré" ||
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

function buildPosterGainHeadline(game: {
  title: string;
  mainPrizeTitle?: string | null;
  mainPrizeLabel?: string | null;
  secondaryPrizeTitle?: string | null;
}) {
  const candidates = [
    normalizePromotionalCopy(game.mainPrizeTitle),
    normalizePromotionalCopy(game.mainPrizeLabel),
    normalizePromotionalCopy(game.secondaryPrizeTitle),
    normalizePromotionalCopy(game.title),
  ].filter((value) => value.length > 0 && !looksGenericPrizeLabel(value));
  const selected = candidates[0] || normalizePromotionalCopy(game.title) || "JEU PROXIPLAY";
  const upper = selected.toUpperCase();

  return {
    lead: upper,
    accent: "A GAGNER",
    badge: shouldUseFreeBadge(selected) ? "100 % GRATUIT" : "A GAGNER",
  };
}

export async function openGamePosterPrintWindow(game: PrintableGamePosterData) {
  await downloadGamePosterPdf(game.id);
}

/*
  const printWindow = window.open("", "_blank")!;

  if (!printWindow) {
    throw new Error("Impossible d'ouvrir la fenetre d'impression.");
  }

  printWindow.document.open();
  printWindow.document.write(`<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Pr&eacute;paration de l&rsquo;affiche...</title>
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
      <h1 class="loading-title">Pr&eacute;paration de l&rsquo;affiche</h1>
      <p class="loading-text">Le visuel premium est en cours de g&eacute;n&eacute;ration...</p>
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
    const safeWordmarkUrl = escapeHtml(
      new URL(PROXIPLAY_WORDMARK_PATH, window.location.origin).toString(),
    );
    const safeEndDateLabel = escapeHtml(game.endDateLabel.trim() || "Date a definir");
    const gainHeadline = buildPosterGainHeadline({
      title: game.title,
      mainPrizeTitle: game.mainPrizeTitle,
      mainPrizeLabel: game.mainPrizeLabel,
      secondaryPrizeTitle: game.secondaryPrizeTitle,
    });
    const safeGainLead = escapeHtml(gainHeadline.lead);
    const safeGainAccent = escapeHtml(gainHeadline.accent);
    const safeGainBadge = escapeHtml(gainHeadline.badge);
    const adultBadge = game.restrictedToAdults
      ? '<span class="badge badge-danger">18+</span>'
      : "";
    const mainPrizeBlock = safeMainPrize
      ? `<div class="meta-row"><span class="meta-icon">🏆</span><div><span class="meta-label">Lot principal</span><span class="meta-value">${safeMainPrize}</span></div></div>`
      : "";
    const secondaryPrizeBlock = safeSecondaryPrizes
      ? `<div class="meta-row"><span class="meta-icon">🎁</span><div><span class="meta-label">Lots secondaires</span><span class="meta-value">${safeSecondaryPrizes}</span></div></div>`
      : "";
    const coverBlock = safeImageUrl
      ? `<img class="hero-image" src="${safeImageUrl}" alt="${safeTitle}" />`
      : `<div class="hero-fallback">Visuel du jeu</div>`;
    const legacyImageBadge = safeMainPrize
      ? `<div class="hero-badge"><span class="hero-badge-icon">🎁</span><span>${safeMainPrize}</span></div>`
      : `<div class="hero-badge"><span class="hero-badge-icon">🎁</span><span>A gagner</span></div>`;
    const imageBadge = `<div class="hero-badge"><span>${safeGainBadge}</span></div>`;
    void mainPrizeBlock;
    void secondaryPrizeBlock;
    void legacyImageBadge;
    const premiumMainPrizeBlock = safeMainPrize
      ? `<div class="meta-row"><div><span class="meta-label">Lot principal</span><span class="meta-value">${safeMainPrize}</span></div></div>`
      : "";
    const premiumSecondaryPrizeBlock = safeSecondaryPrizes
      ? `<div class="meta-row"><div><span class="meta-label">Lots secondaires</span><span class="meta-value">${safeSecondaryPrizes}</span></div></div>`
      : "";

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
        --brand-intro: #2B285F;
        --brand-frame: #A0134D;
        --brand-pink: #B2145A;
        --brand-orange: #F27B3D;
        --brand-green: #6EC12B;
        --brand-yellow: #FFF12B;
        --brand-blue: #90A6D8;
        background:
          radial-gradient(circle at top left, rgba(255, 241, 43, 0.22), transparent 24%),
          radial-gradient(circle at bottom right, rgba(242, 123, 61, 0.14), transparent 22%),
          #f8f3ea;
        color: #191919;
        font-family: "Segoe UI", Arial, sans-serif;
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
        display: flex;
        flex-direction: column;
        gap: 0;
        background:
          radial-gradient(circle at top center, rgba(255,255,255,0.95), rgba(255,253,249,0.96) 48%, rgba(249,243,234,0.96) 100%);
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
        padding: 5.6mm 7mm 3.2mm;
      }
      .brand-wordmark {
        width: 70mm;
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
      .content {
        display: flex;
        flex-direction: column;
        padding: 0 7mm;
        gap: 4.6mm;
        flex: 1;
      }
      .intro-copy {
        display: grid;
        gap: 2.4mm;
        padding-top: 1.2mm;
        max-width: 122mm;
      }
      .eyebrow {
        font-size: 8.8pt;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--brand-frame);
      }
      .intro-title {
        margin: 0;
        font-size: 39pt;
        line-height: 0.86;
        font-weight: 900;
        color: var(--brand-navy);
        letter-spacing: -0.03em;
        text-transform: uppercase;
        max-width: 132mm;
      }
      .intro-accent {
        color: var(--brand-frame);
      }
      .free-line {
        font-size: 12pt;
        font-weight: 700;
        color: #383552;
      }
      .free-line strong {
        color: var(--brand-frame);
      }
      .description {
        margin: 0;
        max-width: 122mm;
        font-size: 10.8pt;
        line-height: 1.36;
        color: #33314a;
      }
      .visual-block {
        position: relative;
        min-height: 112mm;
      }
      .hero-visual {
        position: relative;
        width: calc(100% - 66mm);
        min-height: 114mm;
        border-radius: 0 0 34mm 34mm;
        overflow: hidden;
        background: linear-gradient(180deg, #fff1c9 0%, #f7bd3f 100%);
        border: 1px solid rgba(242, 123, 61, 0.22);
        box-shadow:
          0 18px 34px rgba(242, 123, 61, 0.12),
          inset 0 0 0 1px rgba(255,255,255,0.28);
      }
      .hero-visual::before {
        content: "";
        position: absolute;
        inset: 0;
        background:
          linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0)),
          radial-gradient(circle at center, rgba(255,255,255,0) 40%, rgba(0,0,0,0.16) 100%);
        z-index: 0;
      }
      .hero-visual::after {
        content: "";
        position: absolute;
        inset: auto 6% 6% 6%;
        height: 18mm;
        border-radius: 999px;
        background: radial-gradient(circle, rgba(0,0,0,0.18), transparent 72%);
        filter: blur(6px);
        z-index: 0;
      }
      .hero-image {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
        position: relative;
        z-index: 1;
        filter: drop-shadow(0 10px 20px rgba(0, 0, 0, 0.14));
      }
      .hero-fallback {
        width: 100%;
        height: 100%;
        min-height: 114mm;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 8mm;
        text-align: center;
        font-size: 22pt;
        font-weight: 800;
        color: var(--brand-navy);
        background: linear-gradient(180deg, #fff1c9 0%, #f7bd3f 100%);
      }
      .hero-badge {
        position: absolute;
        right: 4mm;
        top: 4mm;
        width: 30mm;
        min-height: 30mm;
        border-radius: 999px;
        padding: 5.2mm 3.2mm;
        background: linear-gradient(180deg, #ffb617 0%, #f39a00 100%);
        color: #ffffff;
        border: 1px solid rgba(255,255,255,0.55);
        box-shadow: 0 10px 20px rgba(243, 154, 0, 0.24);
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        font-size: 9pt;
        font-weight: 900;
        text-transform: uppercase;
        z-index: 2;
      }
      .scan-panel {
        position: absolute;
        right: 0;
        bottom: 2mm;
        width: 64mm;
        border-radius: 5mm;
        background: linear-gradient(180deg, #241c63 0%, #2f2870 100%);
        color: #ffffff;
        padding: 4.4mm 3.5mm 3.6mm;
        text-align: center;
        box-shadow:
          0 16px 34px rgba(41, 40, 106, 0.22),
          inset 0 0 0 0.35mm rgba(255,255,255,0.08);
      }
      .scan-title {
        margin: 0 0 2.6mm;
        font-size: 9.1pt;
        font-weight: 800;
        text-transform: uppercase;
      }
      .scan-frame {
        border-radius: 4mm;
        padding: 2.4mm;
        background: #ffffff;
      }
      .scan-frame img {
        width: 42mm;
        height: 42mm;
        display: block;
        margin: 0 auto;
        border-radius: 2.8mm;
      }
      .scan-label {
        margin-top: 3mm;
        font-size: 9.3pt;
        font-weight: 800;
        text-transform: uppercase;
      }
      .scan-deadline {
        margin-top: 3mm;
        border-radius: 999px;
        background: #ffc62b;
        color: #2f2870;
        padding: 2.2mm 2.4mm;
        font-size: 8.5pt;
        font-weight: 800;
        line-height: 1.2;
      }
      .steps-column {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 4mm;
        align-items: start;
        margin-top: 2.4mm;
      }
      .step-row {
        display: grid;
        grid-template-columns: 12mm 1fr;
        gap: 2.8mm;
        align-items: start;
      }
      .step-number {
        width: 8.6mm;
        height: 8.6mm;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        background: var(--brand-frame);
        color: #ffffff;
        font-size: 9.2pt;
        font-weight: 700;
      }
      .step-copy {
        display: flex;
        flex-direction: column;
        gap: 0.4mm;
      }
      .step-title {
        font-size: 11.6pt;
        font-weight: 800;
        color: var(--brand-navy);
        text-transform: uppercase;
      }
      .step-text {
        font-size: 9.2pt;
        line-height: 1.25;
        color: #33314a;
      }
      .meta-card {
        margin: 5.4mm 7mm 7mm;
        border-top: 0.35mm solid rgba(160, 19, 77, 0.12);
        background: transparent;
        padding: 3.2mm 0 0;
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 3mm;
      }
      .meta-row {
        display: block;
        min-width: 0;
        padding: 0;
      }
      .meta-row + .meta-row {
        border-left: 0.35mm solid rgba(160, 19, 77, 0.12);
        padding-left: 3mm;
      }
      .meta-icon {
        display: none;
      }
      .meta-label {
        display: block;
        font-size: 7.4pt;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--brand-frame);
      }
      .meta-value {
        display: block;
        margin-top: 1.2mm;
        font-size: 10pt;
        line-height: 1.32;
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
        .meta-card {
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
      <section class="content">
        <div class="intro-copy">
          <div class="eyebrow">Scannez, jouez, gagnez</div>
          <h1 class="intro-title">${safeGainLead}<br /><span class="intro-accent">${safeGainAccent}</span></h1>
          <div class="free-line">C&apos;est <strong>gratuit</strong>. Jouez maintenant chez ${safeMerchantName}.</div>
          <p class="description">${safeDescription || "Scannez le QR code pour tenter votre chance tout de suite."}</p>
        </div>

        <section class="visual-block">
          <div class="hero-visual">
            ${imageBadge}
            ${coverBlock}
          </div>
          <aside class="scan-panel">
            <div class="scan-title">Scannez pour jouer</div>
            <div class="scan-frame">
              <img src="${qrCodeUrl}" alt="QR code ${safeTitle}" />
            </div>
            <div class="scan-label">Jouez maintenant</div>
            <div class="scan-deadline">Fin du jeu le ${safeEndDateLabel}</div>
          </aside>
        </section>

        <section class="steps-column">
          <div class="step-row">
            <div class="step-number">1</div>
            <div class="step-copy">
              <div class="step-title">Scannez</div>
              <div class="step-text">le QR code.</div>
            </div>
          </div>
          <div class="step-row">
            <div class="step-number">2</div>
            <div class="step-copy">
              <div class="step-title">Jouez</div>
              <div class="step-text">gratuitement.</div>
            </div>
          </div>
          <div class="step-row">
            <div class="step-number">3</div>
            <div class="step-copy">
              <div class="step-title">Gagnez</div>
              <div class="step-text">votre reduction.</div>
            </div>
          </div>
        </section>
      </section>
      <section class="meta-card">
        <div class="meta-row"><span class="meta-icon">📅</span><div><span class="meta-label">P&eacute;riode</span><span class="meta-value">${safeDates}</span></div></div>
        <div class="meta-row"><span class="meta-icon">🏪</span><div><span class="meta-label">Commer&ccedil;ant</span><span class="meta-value">${safeMerchantName}</span></div></div>
        ${premiumMainPrizeBlock}
        ${premiumSecondaryPrizeBlock}
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
        : "Impossible de generer l'affiche.";

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
*/
export async function openGameFacebookPostWindow(game: PrintableGameFacebookPostData) {
  const postWindow = window.open("", "_blank");

  if (!postWindow) {
    throw new Error("Impossible d'ouvrir la fenetre du post Facebook.");
  }

  const deepLink = buildGamePosterDeepLink(game);
  const safeTitle = escapeHtml(game.title.trim() || "Jeu ProxiPlay");
  const safeMerchantName = escapeHtml(game.merchantName.trim() || "Commercant");
  const safeDescription = escapeHtml(game.description.trim());
  const safeMainPrizeLabel = escapeHtml(game.mainPrizeLabel?.trim() || "");
  const safeMainPrizeTitle = escapeHtml(game.mainPrizeTitle?.trim() || "");
  const safeLink = escapeHtml(deepLink);
  const safeLinkJs = JSON.stringify(deepLink);
  const safeCaption = escapeHtml(
    buildFacebookCaption({
      title: game.title.trim() || "Jeu ProxiPlay",
      merchantName: game.merchantName.trim(),
      description: game.description.trim(),
      link: deepLink,
      mainPrizeLabel: game.mainPrizeLabel?.trim() || null,
    }),
  );
  const safeCaptionJs = JSON.stringify(
    buildFacebookCaption({
      title: game.title.trim() || "Jeu ProxiPlay",
      merchantName: game.merchantName.trim(),
      description: game.description.trim(),
      link: deepLink,
      mainPrizeLabel: game.mainPrizeLabel?.trim() || null,
    }),
  );
  const safeWordmarkUrl = escapeHtml(
    new URL(PROXIPLAY_WORDMARK_PATH, window.location.origin).toString(),
  );
  const safeVisualUrl = escapeHtml(game.prizeImageUrl?.trim() || game.imageUrl?.trim() || "");
  const adultBadge = game.restrictedToAdults
    ? '<span class="badge badge-danger">18+</span>'
    : "";
  const prizeBlock = safeMainPrizeLabel || safeMainPrizeTitle
    ? `<div class="prize-card">
        <div class="section-kicker">Lot mis en avant</div>
        <p class="prize-title">${safeMainPrizeTitle || safeMainPrizeLabel}</p>
        ${safeMainPrizeTitle && safeMainPrizeLabel && safeMainPrizeTitle !== safeMainPrizeLabel ? `<p class="prize-value">${safeMainPrizeLabel}</p>` : ""}
      </div>`
    : "";
  const visualBlock = safeVisualUrl
    ? `<img class="cover-image" src="${safeVisualUrl}" alt="${safeTitle}" />`
    : `<div class="cover-fallback">Visuel du lot indisponible</div>`;

  postWindow.document.open();
  postWindow.document.write(`<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Post Facebook ${safeTitle}</title>
    <style>
      * {
        box-sizing: border-box;
      }
      html, body {
        margin: 0;
        min-height: 100%;
        background:
          radial-gradient(circle at top left, rgba(255, 241, 43, 0.28), transparent 28%),
          linear-gradient(180deg, #f7f1e8 0%, #eef1f7 100%);
        color: #1a1a1a;
        font-family: "Segoe UI", Arial, sans-serif;
      }
      body {
        padding: 24px;
      }
      .layout {
        max-width: 1240px;
        margin: 0 auto;
        display: grid;
        grid-template-columns: minmax(320px, 1080px) minmax(280px, 360px);
        gap: 24px;
        align-items: start;
      }
      .social-card {
        width: min(100%, 1080px);
        aspect-ratio: 1 / 1;
        background: #fffdfa;
        border: 1px solid rgba(160, 19, 77, 0.14);
        border-radius: 32px;
        overflow: hidden;
        box-shadow: 0 24px 80px rgba(41, 40, 106, 0.12);
        display: grid;
        grid-template-rows: auto 1fr auto;
      }
      .card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        padding: 26px 28px 0;
      }
      .wordmark img {
        display: block;
        width: 220px;
        max-width: 100%;
        height: auto;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 8px 14px;
        font-size: 12px;
        font-weight: 700;
        border: 1px solid rgba(160, 19, 77, 0.18);
        background: rgba(255, 255, 255, 0.9);
      }
      .badge-danger {
        color: #a0134d;
        background: rgba(160, 19, 77, 0.08);
      }
      .card-body {
        display: grid;
        grid-template-columns: minmax(0, 0.9fr) minmax(320px, 0.7fr);
        gap: 28px;
        padding: 24px 28px 28px;
      }
      .visual-shell {
        border-radius: 28px;
        overflow: hidden;
        background: linear-gradient(180deg, #f4efe8 0%, #edf1f8 100%);
        border: 1px solid rgba(41, 40, 106, 0.08);
        min-height: 0;
      }
      .cover-image {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .cover-fallback {
        width: 100%;
        height: 100%;
        min-height: 420px;
        display: grid;
        place-items: center;
        padding: 40px;
        text-align: center;
        color: #29286a;
        font-size: 36px;
        font-weight: 800;
      }
      .copy-column {
        display: flex;
        flex-direction: column;
        gap: 16px;
        min-width: 0;
      }
      .merchant-chip {
        align-self: flex-start;
        border-radius: 999px;
        padding: 8px 14px;
        background: #fff7b8;
        color: #a0134d;
        border: 1px solid rgba(160, 19, 77, 0.18);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .section-kicker {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #a0134d;
      }
      .title {
        margin: 0;
        color: #29286a;
        font-size: clamp(38px, 4vw, 62px);
        line-height: 0.96;
        font-weight: 800;
        text-wrap: balance;
      }
      .description {
        margin: 0;
        font-size: 19px;
        line-height: 1.5;
        color: #4d4a57;
      }
      .prize-card {
        border-radius: 24px;
        background: linear-gradient(180deg, #fff8de 0%, #fff2c4 100%);
        border: 1px solid rgba(242, 123, 61, 0.28);
        padding: 18px 20px;
      }
      .prize-title {
        margin: 8px 0 0;
        font-size: 26px;
        line-height: 1.12;
        font-weight: 800;
        color: #1f1f1f;
      }
      .prize-value {
        margin: 8px 0 0;
        font-size: 15px;
        color: #695b3f;
      }
      .cta {
        margin-top: auto;
        border-radius: 24px;
        background: #29286a;
        color: #ffffff;
        padding: 18px 22px;
      }
      .cta-label {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        opacity: 0.82;
      }
      .cta-link {
        display: block;
        margin-top: 8px;
        color: #ffffff;
        font-size: 17px;
        font-weight: 700;
        line-height: 1.45;
        word-break: break-word;
        text-decoration: none;
      }
      .sidebar {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .panel {
        border-radius: 24px;
        border: 1px solid rgba(26, 26, 26, 0.08);
        background: rgba(255, 255, 255, 0.88);
        padding: 18px;
        box-shadow: 0 16px 40px rgba(26, 26, 26, 0.06);
      }
      .panel h2 {
        margin: 0 0 8px;
        font-size: 16px;
      }
      .panel p, .panel pre {
        margin: 0;
        color: #555555;
        font-size: 13px;
        line-height: 1.55;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .actions button, .actions a {
        border: 0;
        border-radius: 999px;
        padding: 11px 15px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        text-decoration: none;
      }
      .primary-action {
        background: #639922;
        color: #ffffff;
      }
      .secondary-action {
        background: #ffffff;
        color: #1a1a1a;
        border: 1px solid #ddd7cb;
      }
      @media (max-width: 1120px) {
        .layout {
          grid-template-columns: 1fr;
        }
        .social-card {
          width: 100%;
          aspect-ratio: auto;
        }
        .card-body {
          grid-template-columns: 1fr;
        }
        .visual-shell {
          aspect-ratio: 1 / 1;
        }
      }
    </style>
  </head>
  <body>
    <div class="layout">
      <main class="social-card">
        <header class="card-header">
          <div class="wordmark">
            <img src="${safeWordmarkUrl}" alt="ProxiPlay" />
          </div>
          ${adultBadge}
        </header>
        <section class="card-body">
          <div class="visual-shell">${visualBlock}</div>
          <div class="copy-column">
            <div class="merchant-chip">${safeMerchantName}</div>
            <div>
              <div class="section-kicker">Post Facebook</div>
              <h1 class="title">${safeTitle}</h1>
            </div>
            ${safeDescription ? `<p class="description">${safeDescription}</p>` : ""}
            ${prizeBlock}
            <div class="cta">
              <div class="cta-label">Lien du jeu</div>
              <a class="cta-link" href="${safeLink}" target="_blank" rel="noopener noreferrer">${safeLink}</a>
            </div>
          </div>
        </section>
      </main>

      <aside class="sidebar">
        <section class="panel">
          <h2>Legende proposee</h2>
          <pre>${safeCaption}</pre>
        </section>
        <section class="panel">
          <h2>Actions rapides</h2>
          <div class="actions">
            <button type="button" class="primary-action" onclick="copyCaption()">Copier la legende</button>
            <button type="button" class="secondary-action" onclick="copyLink()">Copier le lien</button>
            <a class="secondary-action" href="${safeLink}" target="_blank" rel="noopener noreferrer">Ouvrir le jeu</a>
          </div>
        </section>
      </aside>
    </div>
    <script>
      async function copyText(value, successMessage) {
        try {
          if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(value);
          } else {
            const textarea = document.createElement("textarea");
            textarea.value = value;
            textarea.setAttribute("readonly", "");
            textarea.style.position = "absolute";
            textarea.style.left = "-9999px";
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand("copy");
            document.body.removeChild(textarea);
          }
          window.alert(successMessage);
        } catch (_error) {
          window.alert("Copie impossible depuis cette fenetre.");
        }
      }
      function copyLink() {
        void copyText(${safeLinkJs}, "Lien du jeu copie.");
      }
      function copyCaption() {
        void copyText(${safeCaptionJs}, "Legende du post copiee.");
      }
    </script>
  </body>
</html>`);
  postWindow.document.close();
}
