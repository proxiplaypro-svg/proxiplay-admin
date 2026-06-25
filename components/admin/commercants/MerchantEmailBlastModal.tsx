"use client";

import { httpsCallable } from "firebase/functions";
import { useEffect, useRef, useState } from "react";
import { functionsClient } from "@/lib/firebase/functions";
import type { MerchantPilotageFilter, MerchantPilotageItem } from "@/types/dashboard";

type BlastFilter = MerchantPilotageFilter;

interface EmailResult {
  merchantId: string;
  name: string;
  email: string;
  status: "ok" | "error";
  error?: string;
}

interface Props {
  open: boolean;
  merchants: MerchantPilotageItem[];
  onClose: () => void;
}

const FILTER_LABELS: Record<BlastFilter, string> = {
  tous: "Tous les commerçants",
  actifs: "Actifs (jeu en cours)",
  a_relancer: "À relancer",
  sans_jeu_actif: "Sans jeu actif",
};

function filterMerchants(merchants: MerchantPilotageItem[], filter: BlastFilter): MerchantPilotageItem[] {
  switch (filter) {
    case "actifs":
      return merchants.filter((m) => m.gamesActiveCount > 0);
    case "a_relancer":
      return merchants.filter((m) => m.status === "a_relancer");
    case "sans_jeu_actif":
      return merchants.filter((m) => m.gamesActiveCount === 0);
    default:
      return merchants;
  }
}

export function MerchantEmailBlastModal({ open, merchants, onClose }: Props) {
  const [blastFilter, setBlastFilter] = useState<BlastFilter>("tous");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<EmailResult[]>([]);
  const [done, setDone] = useState(false);
  const cancelledRef = useRef(false);

  const targets = filterMerchants(merchants, blastFilter);

  useEffect(() => {
    if (!open) {
      setSending(false);
      setResults([]);
      setDone(false);
      cancelledRef.current = false;
    }
  }, [open]);

  if (!open) return null;

  const sent = results.filter((r) => r.status === "ok").length;
  const errors = results.filter((r) => r.status === "error").length;
  const progress = targets.length > 0 ? results.length / targets.length : 0;

  const handleSend = async () => {
    if (!subject.trim() || !message.trim() || targets.length === 0) return;

    setSending(true);
    setResults([]);
    setDone(false);
    cancelledRef.current = false;

    const sendEmail = httpsCallable<{ email: string; subject: string; message: string }, { success: boolean }>(
      functionsClient,
      "sendMerchantEmail",
    );

    for (const merchant of targets) {
      if (cancelledRef.current) break;

      if (!merchant.email) {
        setResults((prev) => [
          ...prev,
          { merchantId: merchant.id, name: merchant.name, email: "", status: "error", error: "Email manquant" },
        ]);
        continue;
      }

      try {
        await sendEmail({ email: merchant.email, subject: subject.trim(), message: message.trim() });
        setResults((prev) => [
          ...prev,
          { merchantId: merchant.id, name: merchant.name, email: merchant.email, status: "ok" },
        ]);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        setResults((prev) => [
          ...prev,
          { merchantId: merchant.id, name: merchant.name, email: merchant.email, status: "error", error: errMsg },
        ]);
      }
    }

    setSending(false);
    setDone(true);
  };

  const handleCancel = () => {
    cancelledRef.current = true;
  };

  const canSend = subject.trim().length > 0 && message.trim().length > 0 && targets.length > 0 && !sending;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 px-4 py-8">
      <div className="w-full max-w-2xl rounded-[12px] border border-[#E8E8E4] bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-[#E8E8E4] px-6 py-4">
          <h2 className="text-[16px] font-medium text-[#1a1a1a]">Envoyer un email groupé</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="text-[#999] hover:text-[#1a1a1a] disabled:opacity-40"
          >
            ✕
          </button>
        </div>

        <div className="space-y-5 p-6">
          {/* Filtre */}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-[#1a1a1a]">Destinataires</label>
            <select
              value={blastFilter}
              onChange={(e) => setBlastFilter(e.target.value as BlastFilter)}
              disabled={sending}
              className="w-full rounded-[8px] border border-[#E0E0DA] bg-white px-3 py-2 text-[14px] text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#639922] disabled:opacity-50"
            >
              {(Object.entries(FILTER_LABELS) as [BlastFilter, string][]).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[12px] text-[#666]">
              {targets.length} commerçant{targets.length !== 1 ? "s" : ""} sélectionné{targets.length !== 1 ? "s" : ""}
            </p>
          </div>

          {/* Sujet */}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-[#1a1a1a]">Sujet</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={sending}
              placeholder="Objet de l'email"
              className="w-full rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[14px] text-[#1a1a1a] placeholder-[#aaa] focus:outline-none focus:ring-2 focus:ring-[#639922] disabled:opacity-50"
            />
          </div>

          {/* Message */}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-[#1a1a1a]">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={sending}
              rows={7}
              placeholder="Corps de l'email…"
              className="w-full resize-y rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[14px] text-[#1a1a1a] placeholder-[#aaa] focus:outline-none focus:ring-2 focus:ring-[#639922] disabled:opacity-50"
            />
          </div>

          {/* Barre de progression */}
          {(sending || results.length > 0) && (
            <div>
              <div className="mb-1 flex justify-between text-[12px] text-[#666]">
                <span>
                  {results.length} / {targets.length} traités
                </span>
                <span>
                  {sent} OK · {errors} erreur{errors !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#E8E8E4]">
                <div
                  className="h-full rounded-full bg-[#639922] transition-all"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Log des résultats */}
          {results.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-[8px] border border-[#E8E8E4] bg-[#F7F7F5] p-3 text-[12px]">
              {results.map((r) => (
                <div key={r.merchantId} className="flex items-start gap-2 py-0.5">
                  <span className={r.status === "ok" ? "text-[#639922]" : "text-[#E24B4A]"}>
                    {r.status === "ok" ? "✓" : "✗"}
                  </span>
                  <span className="flex-1 text-[#1a1a1a]">{r.name}</span>
                  {r.status === "error" && <span className="text-[#E24B4A]">{r.error}</span>}
                </div>
              ))}
            </div>
          )}

          {/* Récapitulatif final */}
          {done && (
            <p className="text-[13px] font-medium text-[#1a1a1a]">
              Envoi terminé — {sent} email{sent !== 1 ? "s" : ""} envoyé{sent !== 1 ? "s" : ""}
              {errors > 0 ? `, ${errors} erreur${errors !== 1 ? "s" : ""}` : ""}.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-[#E8E8E4] px-6 py-4">
          {sending ? (
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-[8px] border border-[#E8E8E4] bg-white px-4 py-2 text-[13px] text-[#666] hover:bg-[#FAFAF8]"
            >
              Annuler l'envoi
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="rounded-[8px] border border-[#E8E8E4] bg-white px-4 py-2 text-[13px] text-[#666] hover:bg-[#FAFAF8]"
            >
              Fermer
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!canSend}
            className="rounded-[8px] bg-[#639922] px-5 py-2 text-[13px] font-medium text-white hover:bg-[#5a8b1f] disabled:opacity-40"
          >
            {sending ? "Envoi en cours…" : `Envoyer à ${targets.length} commerçant${targets.length !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
