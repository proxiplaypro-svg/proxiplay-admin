import { readFile } from "node:fs/promises";
import path from "node:path";
import { jsPDF } from "jspdf";
import { NextResponse } from "next/server";
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

const PAGE = {
  width: 595.28,
  height: 841.89,
  margin: 22,
};

const BRAND = {
  navy: "#2D2A6E",
  magenta: "#C0006C",
  frame: "#8B1A4A",
  orange: "#FFB11B",
  yellow: "#F5A623",
  lightGray: "#F7F7F5",
  midGray: "#D8D8DD",
  text: "#2B2940",
  softText: "#777487",
  white: "#FFFFFF",
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
    lead: mainPrizeLabel.replace(/(\d)\s+%/g, "$1%").toUpperCase(),
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
  return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ioAAAAASUVORK5CYII=";
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

function splitHeadlineLines(doc: jsPDF, value: string, maxWidth: number) {
  return doc.splitTextToSize(value, maxWidth) as string[];
}

function drawStep(
  doc: jsPDF,
  index: number,
  x: number,
  y: number,
  title: string,
  text: string,
) {
  doc.setFillColor(BRAND.frame);
  doc.circle(x + 18, y + 18, 14, "F");
  doc.setTextColor(BRAND.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(String(index), x + 18, y + 23, { align: "center" });

  doc.setTextColor(BRAND.navy);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(title, x + 42, y + 12);

  doc.setTextColor(BRAND.text);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  const lines = doc.splitTextToSize(text, 150) as string[];
  doc.text(lines, x + 42, y + 29);
}

function drawFooterBlock(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
) {
  doc.setTextColor("#8A8796");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text(label, x, y);

  doc.setTextColor(BRAND.navy);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  const lines = doc.splitTextToSize(value || "-", width) as string[];
  doc.text(lines, x, y + 16);
}

function buildPosterPdf(data: PosterTemplateData) {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const outerX = PAGE.margin;
  const outerY = PAGE.margin;
  const outerW = pageWidth - PAGE.margin * 2;
  const outerH = pageHeight - PAGE.margin * 2;

  pdf.setFillColor(BRAND.white);
  pdf.rect(0, 0, pageWidth, pageHeight, "F");
  pdf.setDrawColor(BRAND.frame);
  pdf.setLineWidth(3);
  pdf.roundedRect(outerX, outerY, outerW, outerH, 20, 20, "S");

  const leftX = outerX + 26;
  const topY = outerY + 22;
  const qrCardW = 180;
  const qrCardH = 210;
  const qrCardX = outerX + outerW - 26 - qrCardW;
  const qrCardY = topY + 8;

  pdf.addImage(data.logoDataUrl, "PNG", leftX, topY, 220, 58);

  pdf.setTextColor(BRAND.magenta);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.text("SCANNEZ, JOUEZ, GAGNEZ", leftX, topY + 86);

  pdf.setTextColor(BRAND.navy);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(33);
  const headlineLines = splitHeadlineLines(pdf, data.headlineLead, 220);
  let headlineY = topY + 112;
  for (const line of headlineLines) {
    pdf.text(line, leftX, headlineY);
    headlineY += 36;
  }

  pdf.setTextColor(BRAND.magenta);
  pdf.setFontSize(34);
  pdf.text(data.headlineAccent, leftX, headlineY + 4);

  const merchantY = headlineY + 32;
  pdf.setTextColor(BRAND.navy);
  pdf.setFontSize(15);
  pdf.text("C'est ", leftX, merchantY);
  pdf.setTextColor(BRAND.magenta);
  pdf.text("gratuit", leftX + 38, merchantY);
  pdf.setTextColor(BRAND.navy);
  pdf.text(`. Jouez maintenant chez ${data.merchantName}.`, leftX + 84, merchantY);

  pdf.setTextColor(BRAND.softText);
  pdf.setFont("helvetica", "italic");
  pdf.setFontSize(10.5);
  const descLines = pdf.splitTextToSize(data.description || "Scannez et tentez votre chance tout de suite.", 250) as string[];
  pdf.text(descLines, leftX, merchantY + 22);

  pdf.setFillColor(BRAND.navy);
  pdf.roundedRect(qrCardX, qrCardY, qrCardW, qrCardH, 18, 18, "F");

  if (data.restrictedToAdults) {
    pdf.setFillColor(45, 42, 110);
    pdf.setDrawColor(255, 255, 255);
    pdf.setLineWidth(2);
    pdf.circle(qrCardX + qrCardW - 16, qrCardY + 16, 16, "FD");
    pdf.setTextColor(BRAND.white);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text("18+", qrCardX + qrCardW - 16, qrCardY + 20, { align: "center" });
  }

  pdf.setTextColor(BRAND.white);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text("TENTEZ VOTRE CHANCE", qrCardX + qrCardW / 2, qrCardY + 24, { align: "center" });

  pdf.setFillColor(BRAND.white);
  pdf.roundedRect(qrCardX + 24, qrCardY + 40, 132, 132, 12, 12, "F");
  pdf.addImage(data.qrCodeDataUrl, "PNG", qrCardX + 36, qrCardY + 52, 108, 108);

  pdf.setTextColor(BRAND.white);
  pdf.setFontSize(14);
  pdf.text("SCANNEZ POUR JOUER !", qrCardX + qrCardW / 2, qrCardY + 190, { align: "center" });

  pdf.setFillColor(BRAND.yellow);
  pdf.roundedRect(qrCardX + 18, qrCardY + 198, qrCardW - 36, 24, 12, 12, "F");
  pdf.setTextColor(BRAND.white);
  pdf.setFontSize(12);
  pdf.text(`Fin le ${data.endDateLabel}`, qrCardX + qrCardW / 2, qrCardY + 214, { align: "center" });

  const visualX = leftX;
  const visualY = topY + 250;
  const visualW = 342;
  const visualH = 360;

  pdf.addImage(data.prizeImageDataUrl, "JPEG", visualX, visualY, visualW, visualH);

  pdf.setFillColor(BRAND.orange);
  pdf.circle(visualX + visualW - 42, visualY + 48, 38, "F");
  pdf.setTextColor(BRAND.white);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  const badgeLines = data.badgeLabel === "100 % GRATUIT" ? ["100 %", "GRATUIT"] : ["A", "GAGNER"];
  pdf.text(badgeLines, visualX + visualW - 42, visualY + 44, { align: "center" });

  const stepsX = visualX + visualW + 18;
  const stepsY = visualY + 18;
  drawStep(pdf, 1, stepsX, stepsY, "SCANNEZ", "le QR code avec votre telephone.");
  pdf.setDrawColor(BRAND.midGray);
  pdf.line(stepsX, stepsY + 72, stepsX + 150, stepsY + 72);
  drawStep(pdf, 2, stepsX, stepsY + 86, "GRATTEZ", "et decouvrez si vous avez gagne.");
  pdf.line(stepsX, stepsY + 158, stepsX + 150, stepsY + 158);
  drawStep(pdf, 3, stepsX, stepsY + 172, "GAGNEZ", "votre lot immediatement !");

  const footerX = leftX;
  const footerY = outerY + outerH - 76;
  const footerW = outerW - 52;
  const footerH = 58;
  const footerBlockW = footerW / 4;

  pdf.setFillColor(BRAND.lightGray);
  pdf.roundedRect(footerX, footerY, footerW, footerH, 16, 16, "F");
  pdf.setDrawColor("#E7E3DF");
  pdf.line(footerX + footerBlockW, footerY + 8, footerX + footerBlockW, footerY + footerH - 8);
  pdf.line(footerX + footerBlockW * 2, footerY + 8, footerX + footerBlockW * 2, footerY + footerH - 8);
  pdf.line(footerX + footerBlockW * 3, footerY + 8, footerX + footerBlockW * 3, footerY + footerH - 8);

  drawFooterBlock(pdf, footerX + 14, footerY + 16, footerBlockW - 24, "PERIODE", `${data.startDateLabel}\nau ${data.endDateLabel}`);
  drawFooterBlock(pdf, footerX + footerBlockW + 14, footerY + 16, footerBlockW - 24, "COMMERCANT", data.merchantName);
  drawFooterBlock(pdf, footerX + footerBlockW * 2 + 14, footerY + 16, footerBlockW - 24, "LOT PRINCIPAL", data.mainPrizeLabel);
  drawFooterBlock(pdf, footerX + footerBlockW * 3 + 14, footerY + 16, footerBlockW - 24, "LOTS SECONDAIRES", data.firstSecondaryPrizeLabel);

  return Buffer.from(pdf.output("arraybuffer"));
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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
      width: 220,
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

    const pdfBuffer = buildPosterPdf(templateData);

    return new NextResponse(pdfBuffer, {
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
  }
}
