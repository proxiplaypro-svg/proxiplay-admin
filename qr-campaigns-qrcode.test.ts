import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
// Types locaux : l'Admin ne declare que toDataURL pour qrcode, pngjs n'a pas de types.
type DecodedPng = { width: number; height: number; data: Buffer };
type QrMatrix = { modules: { size: number; get(row: number, col: number): number } };
const require = createRequire(import.meta.url);
const { PNG } = require("pngjs") as { PNG: { sync: { read(buffer: Buffer): DecodedPng } } };
const QRCode = require("qrcode") as {
  toDataURL(text: string, options: Record<string, unknown>): Promise<string>;
  create(text: string, options: Record<string, unknown>): QrMatrix;
};
import { qrPublicUrl } from "@/lib/admin/qrCampaigns";

// Memes options que la fiche de campagne (app/admin/qr-campaigns/[id]).
const OPTIONS = { width: 2048, margin: 4, errorCorrectionLevel: "M" as const };

async function readPng(text: string) {
  const dataUrl = await QRCode.toDataURL(text, OPTIONS);
  return PNG.sync.read(Buffer.from(dataUrl.split(",")[1], "base64"));
}

/** Lit le PNG module par module et le compare a la matrice attendue. */
function matchesModules(png: DecodedPng, text: string): boolean {
  const qr = QRCode.create(text, { errorCorrectionLevel: OPTIONS.errorCorrectionLevel });
  const size = qr.modules.size;
  const scale = png.width / (size + OPTIONS.margin * 2);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const x = Math.floor((col + OPTIONS.margin + 0.5) * scale);
      const y = Math.floor((row + OPTIONS.margin + 0.5) * scale);
      const dark = png.data[(y * png.width + x) * 4] < 128;
      if (dark !== Boolean(qr.modules.get(row, col))) return false;
    }
  }
  return true;
}

test("le QR de la campagne bus encode https://proxiplay.fr/bus, en PNG 2048 px", async () => {
  const url = qrPublicUrl("bus");
  assert.equal(url, "https://proxiplay.fr/bus");
  const png = await readPng(url);
  assert.equal(png.width, 2048);
  assert.equal(png.height, 2048);
  assert.equal(matchesModules(png, url), true);
  // Jamais le lien OneLink.
  assert.equal(matchesModules(png, "https://onelink.to/jx4ee7"), false);
});

test("la fiche génère le QR depuis l'URL publique, jamais depuis la destination", () => {
  const page = readFileSync("app/admin/qr-campaigns/[id]/page.tsx", "utf8");
  assert.match(page, /QRCode\.toDataURL\(campaign\.publicUrl, \{ width: QR_PNG_SIZE, margin: 4, errorCorrectionLevel: "M" \}\)/);
  assert.match(page, /const QR_PNG_SIZE = 2048;/);
  assert.doesNotMatch(page, /toDataURL\([^)]*destination/i);
  assert.match(page, /download=\{`qr-\$\{campaign\.id\}-\$\{QR_PNG_SIZE\}px\.png`\}/);
});

test("la rubrique Campagnes QR est dans le groupe Communication", () => {
  const sidebar = readFileSync("components/admin/Sidebar.tsx", "utf8");
  assert.match(sidebar, /label: "Communication"[\s\S]{0,300}\{ href: "\/admin\/qr-campaigns", label: "Campagnes QR"/);
});
