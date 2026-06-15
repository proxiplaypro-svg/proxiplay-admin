"use client";

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
    accent: "A Gagner !",
    badge: shouldUseFreeBadge(selected) ? "100 % GRATUIT" : "A Gagner",
  };
}

function formatPosterDate(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "Date a definir";
  }

  const parsed = new Date(trimmed);

  if (Number.isNaN(parsed.getTime())) {
    return trimmed;
  }

  return parsed.toLocaleDateString("fr-FR");
}

export async function openGamePosterPrintWindow(
  game: PrintableGamePosterData,
  merchant = game.merchantName,
) {
  const printWindow = window.open("", "_blank");

  if (!printWindow) {
    throw new Error("Impossible d'ouvrir la fenetre d'impression.");
  }

  const deepLink = buildGamePosterDeepLink(game);
  const safeTitle = escapeHtml(game.title.trim() || "Jeu ProxiPlay");
  const safeMerchantName = escapeHtml(merchant.trim() || game.merchantName.trim() || "Commercant");
  const safeDescription = escapeHtml(game.description.trim());
  const safePeriod = escapeHtml(
    `${formatPosterDate(game.startDateLabel)} au ${formatPosterDate(game.endDateLabel)}`,
  );
  const safeEndDate = escapeHtml(formatPosterDate(game.endDateLabel));
  const safeMainPrize = escapeHtml(game.mainPrizeLabel?.trim() || game.mainPrizeTitle?.trim() || "-");
  const safeSecondaryPrizes = escapeHtml(
    game.secondaryPrizeSummary?.trim() || game.secondaryPrizeTitle?.trim() || "-",
  );
  const safeImageUrl = game.imageUrl ? escapeHtml(game.imageUrl) : null;
  const safeLogoUrl = escapeHtml(new URL("/logo-proxiplay.png", window.location.origin).toString());
  const safeFileName = sanitizeFileName(`${merchant}-${game.title}`) || game.id;
  const gainHeadline = buildPosterGainHeadline({
    title: game.title,
    mainPrizeTitle: game.mainPrizeTitle,
    mainPrizeLabel: game.mainPrizeLabel,
    secondaryPrizeTitle: game.secondaryPrizeTitle,
  });
  const safeGainLead = escapeHtml(gainHeadline.lead);
  const safeGainAccent = escapeHtml(gainHeadline.accent);
  const safeImageBadge = escapeHtml(gainHeadline.badge);
  const coverBlock = safeImageUrl
    ? `<img class="hero-image" src="${safeImageUrl}" alt="${safeTitle}" />`
    : `<div class="hero-fallback">Image du lot</div>`;

  printWindow.document.open();
  printWindow.document.write(`<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Affiche ${safeTitle}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;700;900&display=swap" rel="stylesheet" />
    <style>
      * {
        box-sizing: border-box;
      }
      html, body {
        margin: 0;
        padding: 0;
        background: #f3eee7;
        color: #1f2240;
        font-family: "Inter", Arial, sans-serif;
      }
      body {
        padding: 24px;
      }
      .poster {
        width: 100%;
        max-width: 794px;
        margin: 0 auto;
        background: #ffffff;
        border: 4px solid #8b1a4a;
        border-radius: 28px;
        padding: 24px;
        display: flex;
        flex-direction: column;
        gap: 24px;
        box-shadow: 0 18px 48px rgba(45, 42, 110, 0.14);
      }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 24px;
      }
      .header-left {
        flex: 1;
        min-width: 0;
      }
      .logo {
        display: block;
        width: 320px;
        max-width: 100%;
        height: auto;
        margin-bottom: 16px;
      }
      .tagline {
        margin: 0 0 8px;
        color: #c0006c;
        font-size: 13px;
        font-weight: 800;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }
      .title {
        margin: 0;
        color: #2d2a6e;
        font-family: "Bebas Neue", Impact, sans-serif;
        font-size: 48px;
        line-height: 0.92;
        letter-spacing: 0.01em;
        text-transform: uppercase;
      }
      .title-accent {
        margin: 2px 0 0;
        color: #c0006c;
        font-family: "Bebas Neue", Impact, sans-serif;
        font-size: 40px;
        line-height: 0.95;
      }
      .merchant-line {
        margin: 14px 0 6px;
        color: #2d2a6e;
        font-size: 16px;
        font-weight: 800;
      }
      .description {
        margin: 0;
        color: #55556f;
        font-size: 15px;
        line-height: 1.45;
      }
      .header-right {
        width: 160px;
        flex: 0 0 160px;
        background: #2d2a6e;
        color: #ffffff;
        border-radius: 22px;
        padding: 18px 14px;
        text-align: center;
        box-shadow: 0 18px 38px rgba(45, 42, 110, 0.22);
      }
      .qr-title {
        margin: 0 0 12px;
        font-size: 14px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }
      #qr-container {
        width: 120px;
        height: 120px;
        margin: 0 auto 14px;
        background: #ffffff;
        border-radius: 16px;
        padding: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      #qr-container img,
      #qr-container canvas {
        display: block;
        width: 100% !important;
        height: 100% !important;
      }
      .deadline-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        min-height: 40px;
        padding: 8px 12px;
        border-radius: 999px;
        background: #f5a623;
        color: #2d2a6e;
        font-size: 13px;
        font-weight: 800;
        text-align: center;
      }
      .middle {
        display: flex;
        gap: 24px;
        align-items: stretch;
      }
      .visual-column {
        position: relative;
        flex: 1;
        min-width: 0;
      }
      .hero-image {
        display: block;
        width: 100%;
        height: 220px;
        object-fit: cover;
        border-radius: 28px;
        background: linear-gradient(180deg, #f1eadf 0%, #e5d2a9 100%);
      }
      .hero-fallback {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 220px;
        border-radius: 28px;
        background: linear-gradient(180deg, #f1eadf 0%, #e5d2a9 100%);
        color: #8e6f3d;
        font-size: 28px;
        font-style: italic;
      }
      .image-badge {
        position: absolute;
        top: 16px;
        right: 16px;
        width: 96px;
        height: 96px;
        border-radius: 999px;
        background: #f5a623;
        color: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        font-family: "Bebas Neue", Impact, sans-serif;
        font-size: 22px;
        line-height: 0.95;
        letter-spacing: 0.04em;
        box-shadow: 0 12px 24px rgba(245, 166, 35, 0.3);
      }
      .steps-column {
        width: 160px;
        flex: 0 0 160px;
        display: flex;
        flex-direction: column;
      }
      .step {
        display: flex;
        gap: 12px;
        align-items: flex-start;
        padding: 12px 0;
      }
      .step + .step {
        border-top: 1px solid #d9d9df;
      }
      .step-number {
        width: 34px;
        height: 34px;
        flex: 0 0 34px;
        border-radius: 999px;
        background: #8b1a4a;
        color: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 15px;
        font-weight: 800;
      }
      .step-title {
        margin: 0 0 2px;
        color: #2d2a6e;
        font-size: 14px;
        font-weight: 900;
        text-transform: uppercase;
      }
      .step-text {
        margin: 0;
        color: #55556f;
        font-size: 13px;
        line-height: 1.35;
      }
      .footer {
        display: flex;
        gap: 12px;
      }
      .footer-block {
        flex: 1;
        min-width: 0;
        background: #f7f7f5;
        border-radius: 16px;
        padding: 14px 16px;
      }
      .footer-label {
        display: block;
        margin-bottom: 6px;
        color: #8b1a4a;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .footer-value {
        color: #2d2a6e;
        font-size: 14px;
        font-weight: 700;
        line-height: 1.35;
        word-break: break-word;
      }
      @media print {
        @page {
          size: A4 portrait;
          margin: 0;
        }
        html, body {
          background: #ffffff;
        }
        body {
          padding: 0;
        }
        .poster {
          max-width: none;
          min-height: 1122px;
          border-radius: 0;
          box-shadow: none;
        }
      }
    </style>
  </head>
  <body>
    <main class="poster">
      <header class="header">
        <div class="header-left">
          <img class="logo" src="${safeLogoUrl}" alt="ProxiPlay" />
          <p class="tagline">Scannez, jouez, gagnez</p>
          <h1 class="title">${safeGainLead}</h1>
          <p class="title-accent">${safeGainAccent}</p>
          <p class="merchant-line">Chez ${safeMerchantName}</p>
          <p class="description">${safeDescription || "Scannez le QR code pour tenter votre chance tout de suite."}</p>
        </div>
        <aside class="header-right">
          <p class="qr-title">Tentez votre chance</p>
          <div id="qr-container" aria-label="QR code vers le jeu"></div>
          <div class="deadline-badge">Fin le ${safeEndDate}</div>
        </aside>
      </header>
      <section class="middle">
        <div class="visual-column">
          ${coverBlock}
          <div class="image-badge">${safeImageBadge}</div>
        </div>
        <aside class="steps-column">
          <div class="step">
            <div class="step-number">1</div>
            <div>
              <p class="step-title">Scannez</p>
              <p class="step-text">Scannez le QR code avec votre telephone.</p>
            </div>
          </div>
          <div class="step">
            <div class="step-number">2</div>
            <div>
              <p class="step-title">Jouez</p>
              <p class="step-text">Jouez tout de suite gratuitement.</p>
            </div>
          </div>
          <div class="step">
            <div class="step-number">3</div>
            <div>
              <p class="step-title">Gagnez</p>
              <p class="step-text">Decouvrez immediatement si vous avez gagne.</p>
            </div>
          </div>
        </aside>
      </section>
      <section class="footer">
        <div class="footer-block">
          <span class="footer-label">Periode</span>
          <span class="footer-value">${safePeriod}</span>
        </div>
        <div class="footer-block">
          <span class="footer-label">Commercant</span>
          <span class="footer-value">${safeMerchantName}</span>
        </div>
        <div class="footer-block">
          <span class="footer-label">Lot principal</span>
          <span class="footer-value">${safeMainPrize}</span>
        </div>
        <div class="footer-block">
          <span class="footer-label">Lots secondaires</span>
          <span class="footer-value">${safeSecondaryPrizes}</span>
        </div>
      </section>
    </main>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <script>
      window.onload = () => {
        document.title = "affiche-${safeFileName}";
        const container = document.getElementById("qr-container");
        if (container && typeof QRCode !== "undefined") {
          new QRCode(container, {
            text: ${JSON.stringify(deepLink)},
            width: 120,
            height: 120,
          });
        }
        window.setTimeout(() => window.print(), 150);
      };
      window.onafterprint = () => window.close();
    </script>
  </body>
</html>`);
  printWindow.document.close();
}

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
