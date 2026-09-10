"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { issueGameQr, readGameQr } from "@/lib/admin/gameQrClient";
import { QR_REGENERATION_MESSAGE } from "@/lib/admin/secureGameQr";
import { openGamePosterPrintWindow, type PrintableGamePosterData } from "@/lib/admin/gamePoster";

export function GameQrSection({ game, created = false }: { game: PrintableGamePosterData; created?: boolean }) {
  const [image, setImage] = useState<string>();
  const [error, setError] = useState<string>();
  const [needsGeneration, setNeedsGeneration] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setBusy(true); setError(undefined); setImage(undefined); setNeedsGeneration(false);
      try {
        const qr = await readGameQr(game.id);
        if (cancelled) return;
        if (qr.state === "public" || qr.state === "not-found") throw new Error("Jeu QR-only introuvable.");
        if (qr.state === "ended") throw new Error("Ce jeu est terminé ou désactivé : aucun QR actif à diffuser.");
        if (qr.state !== "ready") {
          setNeedsGeneration(true);
          if (!created) return;
        }
        const url = qr.url ?? await issueGameQr(game.id);
        const data = await QRCode.toDataURL(url, { width: 1024, margin: 4, errorCorrectionLevel: "M" });
        if (!cancelled) { setImage(data); setNeedsGeneration(false); }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error && !cause.name.includes("Firebase") ? cause.message : "Impossible de charger le QR sécurisé. Vérifiez le rôle admin de votre compte et la disponibilité du service QR, puis réessayez.");
      } finally { if (!cancelled) setBusy(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [game.id, created, retry]);

  async function generate() {
    setBusy(true); setError(undefined);
    try {
      const url = await issueGameQr(game.id);
      setImage(await QRCode.toDataURL(url, { width: 1024, margin: 4, errorCorrectionLevel: "M" }));
      setNeedsGeneration(false);
    } catch { setError("Génération impossible. Vérifiez les droits admin et la disponibilité du service QR, puis réessayez."); }
    finally { setBusy(false); }
  }

  return <section aria-label="QR code boutique" className="rounded-xl border-2 border-[#C0DD97] bg-[#FAFCF7] p-5">
    <h2 className="text-xl font-semibold">{created ? "Jeu QR créé ✓" : "QR code boutique"}</h2>
    <p className="mt-2">Ce jeu est accessible uniquement en scannant ce QR code en boutique.</p>
    {created && <p className="mt-1 text-sm">{game.title} — {game.merchantName}</p>}
    <div aria-live="polite">
      {busy && <p className="mt-4">Chargement du QR sécurisé…</p>}
      {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
      {needsGeneration && !busy && <p className="mt-3 text-amber-800">{QR_REGENERATION_MESSAGE} Aucune régénération automatique n’a été effectuée.</p>}
    </div>
    {image && <div className="mt-4 flex flex-wrap items-center gap-5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt={`QR code boutique du jeu ${game.title}`} width={240} height={240} className="h-60 w-60 bg-white" />
      <div className="flex flex-wrap gap-3">
        <a className="rounded-lg bg-[#639922] px-4 py-3 font-medium text-white" href={image} download={`proxiplay-qr-${game.id}.png`}>Télécharger le QR code</a>
        <button type="button" disabled={busy} className="rounded-lg border border-[#639922] bg-white px-4 py-3 font-medium" onClick={async () => {
          setBusy(true); setError(undefined);
          try { await openGamePosterPrintWindow(game); }
          catch (cause) { setError(cause instanceof Error ? cause.message : "Impression impossible."); }
          finally { setBusy(false); }
        }}>Imprimer l’affiche</button>
      </div>
    </div>}
    {needsGeneration && !created && <button type="button" disabled={busy} onClick={() => void generate()} className="mt-4 rounded-lg border px-4 py-3">Générer le QR sécurisé pour réimpression</button>}
    {error && !needsGeneration && <button type="button" disabled={busy} onClick={() => setRetry(value => value + 1)} className="mt-3 underline">Réessayer</button>}
    {error && created && needsGeneration && <button type="button" disabled={busy} onClick={() => setRetry(value => value + 1)} className="mt-3 underline">Réessayer la génération</button>}
    {!created && image && <p className="mt-3 text-sm text-[#666666]">Les affiches comportant ce jeton restent utilisables jusqu’à son expiration. Les anciens QR sans jeton doivent être remplacés.</p>}
  </section>;
}
