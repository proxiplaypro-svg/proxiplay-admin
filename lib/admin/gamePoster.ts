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
  endDateLabel?: string | null;
  merchantId: string | null;
  animationId?: string | null;
  restrictedToAdults?: boolean;
  mainPrizeLabel?: string | null;
  mainPrizeTitle?: string | null;
};

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

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Impossible de charger l'image: ${src}`));
    image.src = src;
  });
}

function drawCoverImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
) {
  const sourceRatio = image.width / image.height;
  const targetRatio = width / height;

  let sx = 0;
  let sy = 0;
  let sw = image.width;
  let sh = image.height;

  if (sourceRatio > targetRatio) {
    sw = image.height * targetRatio;
    sx = (image.width - sw) / 2;
  } else {
    sh = image.width / targetRatio;
    sy = (image.height - sh) / 2;
  }

  context.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth || !currentLine) {
      currentLine = candidate;
      continue;
    }
    lines.push(currentLine);
    currentLine = word;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function generateFacebookVisual(
  game: PrintableGameFacebookPostData,
  merchant = game.merchantName,
) {
  const merchantName = merchant.trim() || game.merchantName.trim() || "Commercant";
  const title = game.title.trim() || "Jeu ProxiPlay";
  const prizeImageUrl = game.prizeImageUrl?.trim() || game.imageUrl?.trim() || "";
  const logoUrl = new URL("/logo-proxiplay.png", window.location.origin).toString();
  const endDateLabel = formatPosterDate(game.endDateLabel?.trim() || "");
  const deepLink = buildGamePosterDeepLink(game);

  if (!prizeImageUrl) {
    throw new Error("Aucune image de lot disponible pour generer le visuel Facebook.");
  }

  const [backgroundImage, logoImage] = await Promise.all([
    loadImage(prizeImageUrl),
    loadImage(logoUrl),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1080;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Impossible de preparer le canvas Facebook.");
  }

  context.fillStyle = "#FFFFFF";
  context.fillRect(0, 0, canvas.width, canvas.height);

  drawCoverImage(context, backgroundImage, canvas.width, canvas.height);

  const overlay = context.createLinearGradient(0, canvas.height, 0, canvas.height * 0.42);
  overlay.addColorStop(0, "rgba(0,0,0,0.78)");
  overlay.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = overlay;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const logoHeight = 40;
  const logoWidth = (logoImage.width / logoImage.height) * logoHeight;
  context.drawImage(logoImage, 48, 48, logoWidth, logoHeight);

  const badgeText = `Fin le ${endDateLabel}`;
  context.font = "bold 30px Inter, Arial, sans-serif";
  const badgeWidth = context.measureText(badgeText).width + 40;
  const badgeHeight = 52;
  const badgeX = canvas.width - badgeWidth - 48;
  const badgeY = 48;
  context.fillStyle = "#F5A623";
  context.beginPath();
  context.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 26);
  context.fill();
  context.fillStyle = "#FFFFFF";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(badgeText, badgeX + badgeWidth / 2, badgeY + badgeHeight / 2 + 1);

  const qrOptions = {
    width: 160,
    margin: 1,
    color: {
      dark: "#1A1A1A",
      light: "#FFFFFF",
    },
  } as Parameters<typeof QRCode.toDataURL>[1];
  const qrDataUrl = await QRCode.toDataURL(deepLink, qrOptions);
  const qrImage = await loadImage(qrDataUrl);

  const qrFrameSize = 176;
  const qrX = canvas.width - qrFrameSize - 48;
  const qrY = canvas.height - qrFrameSize - 48;
  context.fillStyle = "#FFFFFF";
  context.beginPath();
  context.roundRect(qrX, qrY, qrFrameSize, qrFrameSize, 20);
  context.fill();
  context.drawImage(qrImage, qrX + 8, qrY + 8, 160, 160);

  const textLeft = 48;
  const textMaxWidth = qrX - textLeft - 36;
  const titleBottomY = canvas.height - 220;
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillStyle = "#FFFFFF";
  context.font = "bold 64px Inter, Arial, sans-serif";
  const titleLines = wrapText(context, title, textMaxWidth).slice(0, 3);
  const titleLineHeight = 72;
  const titleStartY = titleBottomY - (titleLines.length - 1) * titleLineHeight;
  titleLines.forEach((line, index) => {
    context.fillText(line, textLeft, titleStartY + index * titleLineHeight);
  });

  const accentY = titleStartY + titleLines.length * titleLineHeight + 14;
  context.fillStyle = "#F5A623";
  context.font = "bold 48px Inter, Arial, sans-serif";
  context.fillText("À GAGNER !", textLeft, accentY);

  context.fillStyle = "#FFFFFF";
  context.font = "italic 28px Inter, Arial, sans-serif";
  context.fillText(
    `Chez ${merchantName} • Gratuit • Scannez le QR !`,
    textLeft,
    accentY + 52,
  );

  const fileName = `facebook-${sanitizeFileName(merchantName) || "merchant"}-${sanitizeFileName(game.id) || "game"}.png`;

  await new Promise<void>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Impossible d'exporter le visuel Facebook."));
        return;
      }
      triggerBlobDownload(blob, fileName);
      resolve();
    }, "image/png");
  });
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
  const safeMainPrize = escapeHtml(game.title.trim() || "-");
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
    <meta charset="UTF-8" />
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
        font-family: "Bebas Neue", sans-serif;
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
          <p class="merchant-line">C'est <span style="color:#C0006C;text-decoration:underline">gratuit</span>. Jouez maintenant chez <strong>${safeMerchantName}</strong>.</p>
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
  return openGameFacebookPostWindowWithMerchant(game, game.merchantName);
}

export async function openGameFacebookPostWindowWithMerchant(
  game: PrintableGameFacebookPostData,
  merchant = game.merchantName,
) {
  const postWindow = window.open("", "_blank");

  if (!postWindow) {
    throw new Error("Impossible d'ouvrir la fenetre du post Facebook.");
  }

  (postWindow as Window & { generateFacebookVisual?: () => void }).generateFacebookVisual = () => {
    void generateFacebookVisual(game, merchant);
  };

  const merchantName = merchant.trim() || game.merchantName.trim() || "Commercant";
  const title = game.title.trim() || "Jeu ProxiPlay";
  const endDateLabel = formatPosterDate(game.endDateLabel?.trim() || "");
  const safeTitle = escapeHtml(title);
  const safeVisualUrl = escapeHtml(game.prizeImageUrl?.trim() || game.imageUrl?.trim() || "");
  const safeWordmarkUrl = escapeHtml(
    new URL("/proxiplay-wordmark.png", window.location.origin).toString(),
  );
  const merchantHashTag = merchantName.replace(/\s+/g, "");
  const postText = [
    `🎉 ${merchantName} vous offre une chance de gagner !`,
    "",
    `🎁 ${title}`,
    `📍 Rendez-vous chez ${merchantName}`,
    "📱 Scannez le QR code sur place et tentez votre chance !",
    "🆓 C'est 100% gratuit",
    `⏰ Jusqu'au ${endDateLabel}`,
    "",
    `#Proxiplay #Dunkerque #${merchantHashTag} #JeuGratuit #BonPlan`,
  ].join("\n");
  const safePostText = escapeHtml(postText);
  const safePostTextJs = JSON.stringify(postText);
  const safeDownloadName = escapeHtml(
    `${sanitizeFileName(`${merchantName}-${title}`) || game.id}-facebook-visuel`,
  );
  const visualBlock = safeVisualUrl
    ? `<img class="cover-image" src="${safeVisualUrl}" alt="${safeTitle}" />`
    : `<div class="cover-fallback">Visuel du lot indisponible</div>`;

  postWindow.document.open();
  postWindow.document.write(`<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
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
        max-width: 960px;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        gap: 20px;
      }
      .panel {
        border-radius: 24px;
        border: 1px solid rgba(26, 26, 26, 0.08);
        background: rgba(255, 255, 255, 0.92);
        padding: 22px;
        box-shadow: 0 16px 40px rgba(26, 26, 26, 0.06);
      }
      .header {
        display: flex;
        align-items: center;
        gap: 16px;
      }
      .wordmark img {
        display: block;
        width: 180px;
        height: auto;
      }
      .eyebrow {
        margin: 0;
        color: #a0134d;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }
      .title {
        margin: 6px 0 0;
        color: #29286a;
        font-size: 32px;
        line-height: 1.05;
        font-weight: 800;
      }
      .helper {
        margin: 6px 0 0;
        color: #666666;
        font-size: 14px;
        line-height: 1.5;
      }
      .text-area {
        width: 100%;
        min-height: 250px;
        margin-top: 16px;
        padding: 16px;
        border-radius: 18px;
        border: 1px solid #ddd7cb;
        background: #fffdfa;
        color: #1a1a1a;
        font: inherit;
        line-height: 1.6;
        resize: vertical;
      }
      .cover-image {
        width: 100%;
        max-height: 520px;
        object-fit: cover;
        display: block;
        border-radius: 20px;
      }
      .cover-fallback {
        width: 100%;
        min-height: 260px;
        display: grid;
        place-items: center;
        padding: 32px;
        text-align: center;
        color: #29286a;
        font-size: 28px;
        font-weight: 800;
        border: 1px solid rgba(41, 40, 106, 0.08);
        border-radius: 20px;
        background: linear-gradient(180deg, #f4efe8 0%, #edf1f8 100%);
      }
      .instruction {
        margin: 14px 0 0;
        color: #4d4a57;
        font-size: 14px;
        line-height: 1.5;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 16px;
      }
      .actions button, .actions a {
        border: 0;
        border-radius: 999px;
        padding: 11px 16px;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        text-decoration: none;
      }
      .primary-action {
        background: #29286a;
        color: #ffffff;
      }
      .secondary-action {
        background: #ffffff;
        color: #1a1a1a;
        border: 1px solid #ddd7cb;
      }
      @media (max-width: 720px) {
        body {
          padding: 16px;
        }
      }
    </style>
  </head>
  <body>
    <div class="layout">
      <section class="panel">
        <div class="header">
          <div class="wordmark">
            <img src="${safeWordmarkUrl}" alt="ProxiPlay" />
          </div>
          <div>
            <p class="eyebrow">Post Facebook</p>
            <h1 class="title">${safeTitle}</h1>
            <p class="helper">Texte prêt à copier pour publier le jeu sur Facebook.</p>
          </div>
        </div>
        <textarea id="post-text" class="text-area">${safePostText}</textarea>
        <div class="actions">
          <button type="button" class="primary-action" onclick="copyPostText()">Copier le texte</button>
        </div>
      </section>

      <section class="panel">
        <p class="eyebrow">Visuel du jeu</p>
        <div style="margin-top:16px">${visualBlock}</div>
        ${safeVisualUrl ? `<div class="actions"><button type="button" class="secondary-action" onclick="downloadFacebookVisual()">Télécharger le visuel</button><a class="secondary-action" href="${safeVisualUrl}" download="${safeDownloadName}">Télécharger l'image</a></div>` : ""}
        <p class="instruction">Collez le texte et ajoutez l'image manuellement sur Facebook.</p>
      </section>
    </div>
    <script>
      const textarea = document.getElementById("post-text");
      if (textarea) {
        textarea.focus();
        textarea.select();
      }
      async function copyPostText() {
        try {
          await navigator.clipboard.writeText(${safePostTextJs});
          window.alert("Texte du post copié.");
        } catch (_error) {
          if (textarea) {
            textarea.focus();
            textarea.select();
          }
          window.alert("Copie impossible automatiquement. Sélectionnez puis copiez le texte.");
        }
      }
      function downloadFacebookVisual() {
        if (typeof window.generateFacebookVisual === "function") {
          window.generateFacebookVisual();
          return;
        }
        window.alert("Generation du visuel indisponible.");
      }
    </script>
  </body>
</html>`);
  postWindow.document.close();
}
