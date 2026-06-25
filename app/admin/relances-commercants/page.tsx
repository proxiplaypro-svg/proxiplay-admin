"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ensureMerchantsAuthenticated,
  getMerchantsPilotageData,
  getMerchantsPilotageErrorMessage,
} from "@/lib/firebase/merchantsQueries";
import { duplicateGameDocument } from "@/lib/firebase/gamesQueries";
import {
  addFollowup,
  getFollowups,
  updateFollowupNote,
  type MerchantFollowup,
} from "@/lib/firebase/relancesQueries";
import type { MerchantPilotageItem } from "@/types/dashboard";
import { auth } from "@/lib/firebase/auth";

// ─── Constants ───────────────────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const GAME_CREATION_URL = "https://app.proxiplay.fr";

const NOTE_PRESETS = [
  "Pas le temps",
  "Plus d'idée de lot",
  "Vacances",
  "Résultats insuffisants",
  "Souhaite être rappelé",
  "Autre",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysWithoutGame(merchant: MerchantPilotageItem): number | null {
  if (merchant.gamesActiveCount > 0) return 0;
  if (merchant.lastGameEndDateValue > 0) {
    return Math.floor((Date.now() - merchant.lastGameEndDateValue) / MS_PER_DAY);
  }
  return null;
}

type StatusTier = "actif" | "7j" | "15j" | "30j" | "jamais_publie";

function statusTier(merchant: MerchantPilotageItem, days: number | null): StatusTier {
  if (merchant.totalGamesCount === 0) return "jamais_publie";
  if (days === null || days === 0) return "actif";
  if (days < 15) return "7j";
  if (days < 30) return "15j";
  return "30j";
}

function tierLabel(tier: StatusTier): string {
  switch (tier) {
    case "actif":         return "Jeu actif";
    case "7j":            return "7 j sans jeu";
    case "15j":           return "15 j sans jeu";
    case "30j":           return "30 j+ sans jeu";
    case "jamais_publie": return "Jamais publié";
  }
}

function tierDot(tier: StatusTier): string {
  switch (tier) {
    case "actif":         return "bg-[#639922]";
    case "7j":            return "bg-[#EF9F27]";
    case "15j":           return "bg-[#E24B4A]";
    case "30j":           return "bg-[#444]";
    case "jamais_publie": return "bg-[#7C5CBF]";
  }
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return "";
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.startsWith("0") && digits.length === 10) return `+33${digits.slice(1)}`;
  return digits;
}

function buildWhatsAppLink(rawPhone: string, message: string): string | null {
  const phone = normalizePhone(rawPhone);
  if (!phone) return null;
  return `https://wa.me/${phone.replace("+", "")}?text=${encodeURIComponent(message)}`;
}

function buildMessage(merchant: MerchantPilotageItem, days: number | null): string {
  const prenom = merchant.ownerFirstName || merchant.name;
  const lien = GAME_CREATION_URL;

  if (merchant.totalGamesCount === 0) {
    return `Bonjour ${prenom},\n\nVotre espace Proxiplay est prêt, mais aucun jeu n'a encore été publié.\n\nOn peut vous aider à lancer votre premier jeu en quelques minutes.\n\n${lien}`;
  }
  if (days !== null && days < 15) {
    return `Bonjour ${prenom},\n\nVotre dernier jeu est terminé.\n\nC'est peut-être le bon moment pour lancer le suivant !\n\nCréer un nouveau jeu prend moins de 2 minutes.\n\n${lien}`;
  }
  if (days !== null && days < 30) {
    return `Bonjour ${prenom},\n\nVotre commerce n'a plus de jeu actif depuis quelques jours.\n\nPublier régulièrement permet de rester visible auprès de vos clients locaux.\n\n${lien}`;
  }
  return `Bonjour ${prenom},\n\nNous avons remarqué que vous n'avez plus publié de jeu récemment.\n\nY a-t-il une raison particulière ?\n\nRépondez simplement à ce message, nous serons ravis de vous aider.`;
}

function formatDate(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

type Filter = "tous" | "actif" | "7j" | "15j" | "30j" | "jamais_publie" | "deja_relance" | "jamais_relance";

// ─── Note Modal ───────────────────────────────────────────────────────────────

function NoteModal({
  merchantName,
  followupId,
  currentNote,
  onSave,
  onClose,
}: {
  merchantName: string;
  followupId: string;
  currentNote: string;
  onSave: (id: string, note: string) => Promise<void>;
  onClose: () => void;
}) {
  const [note, setNote] = useState(currentNote);
  const [saving, setSaving] = useState(false);

  const handlePreset = (preset: string) => {
    setNote((prev) => prev ? `${prev}\n${preset}` : preset);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-md rounded-[12px] border border-[#E8E8E4] bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-[#E8E8E4] px-5 py-4">
          <h3 className="text-[15px] font-medium text-[#1a1a1a]">Note — {merchantName}</h3>
          <button type="button" onClick={onClose} className="text-[#999] hover:text-[#1a1a1a]">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex flex-wrap gap-2">
            {NOTE_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handlePreset(preset)}
                className="rounded-full border border-[#E0E0DA] bg-[#F7F7F5] px-3 py-1 text-[12px] text-[#1a1a1a] hover:bg-[#EAF3DE] hover:border-[#CFE5AF]"
              >
                {preset}
              </button>
            ))}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder="Saisir une note…"
            className="w-full resize-y rounded-[8px] border border-[#E0E0DA] px-3 py-2 text-[14px] text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#639922]"
          />
        </div>
        <div className="flex justify-end gap-3 border-t border-[#E8E8E4] px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-[8px] border border-[#E8E8E4] px-4 py-2 text-[13px] text-[#666] hover:bg-[#F7F7F5]">
            Annuler
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              await onSave(followupId, note).finally(() => setSaving(false));
              onClose();
            }}
            className="rounded-[8px] bg-[#639922] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#5a8b1f] disabled:opacity-40"
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <article className="rounded-[12px] border border-[#E8E8E4] bg-white p-5" style={{ boxShadow: `inset 0 3px 0 ${color}` }}>
      <span className="text-[11px] uppercase tracking-[0.05em] text-[#999]">{label}</span>
      <strong className="mt-3 block text-[28px] font-medium leading-none text-[#1a1a1a]">{value}</strong>
    </article>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RelancesCommercantsPage() {
  const router = useRouter();
  const [merchants, setMerchants] = useState<MerchantPilotageItem[]>([]);
  const [followups, setFollowups] = useState<MerchantFollowup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("tous");
  const [pendingWhatsApp, setPendingWhatsApp] = useState<Record<string, boolean>>({});
  const [pendingDuplicate, setPendingDuplicate] = useState<Record<string, boolean>>({});
  const [noteModal, setNoteModal] = useState<{ merchantName: string; followupId: string; currentNote: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        await ensureMerchantsAuthenticated();
        const [data, followupsData] = await Promise.all([
          getMerchantsPilotageData(),
          getFollowups().catch(() => [] as MerchantFollowup[]),
        ]);
        if (!cancelled) {
          setMerchants(data.merchants);
          setFollowups(followupsData);
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof Error && err.message.includes("Connexion requise")) {
            router.replace("/login");
            return;
          }
          setError(getMerchantsPilotageErrorMessage(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [router]);

  // ── derived data ─────────────────────────────────────────────────────────

  const followupsByMerchant = useMemo(() => {
    const map = new Map<string, MerchantFollowup[]>();
    for (const f of followups) {
      const list = map.get(f.merchantId) ?? [];
      list.push(f);
      map.set(f.merchantId, list);
    }
    return map;
  }, [followups]);

  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const weekStart = useMemo(() => todayStart - 6 * MS_PER_DAY, [todayStart]);

  const merchantRows = useMemo(() => {
    return merchants
      .map((m) => {
        const days = daysWithoutGame(m);
        const tier = statusTier(m, days);
        const phone = m.ownerPhone || m.phone;
        const message = buildMessage(m, days);
        const waLink = buildWhatsAppLink(phone, message);
        const history = followupsByMerchant.get(m.id) ?? [];
        const lastFollowup = history[0] ?? null;
        return { merchant: m, days, tier, waLink, message, phone, history, lastFollowup };
      })
      .sort((a, b) => {
        // Most inactive first: jamais_publie → 30j+ → 15j → 7j → actif
        const tierOrder: Record<StatusTier, number> = { jamais_publie: 0, "30j": 1, "15j": 2, "7j": 3, actif: 4 };
        const tDiff = tierOrder[a.tier] - tierOrder[b.tier];
        if (tDiff !== 0) return tDiff;
        // Within same tier, most days first
        return (b.days ?? 999) - (a.days ?? 999);
      });
  }, [merchants, followupsByMerchant]);

  const filteredRows = useMemo(() => {
    return merchantRows.filter(({ tier, history }) => {
      switch (filter) {
        case "actif":          return tier === "actif";
        case "7j":             return tier === "7j";
        case "15j":            return tier === "15j";
        case "30j":            return tier === "30j";
        case "jamais_publie":  return tier === "jamais_publie";
        case "deja_relance":   return history.length > 0;
        case "jamais_relance": return history.length === 0;
        default:               return true;
      }
    });
  }, [merchantRows, filter]);

  const stats = useMemo(() => {
    const total = merchants.length;
    const withGame = merchantRows.filter((r) => r.tier === "actif").length;
    const toRelance = merchantRows.filter((r) => r.tier !== "actif").length;
    const today = followups.filter((f) => f.dateValue >= todayStart).length;
    const week = followups.filter((f) => f.dateValue >= weekStart).length;
    return { total, withGame, toRelance, today, week };
  }, [merchants, merchantRows, followups, todayStart, weekStart]);

  // ── handlers ─────────────────────────────────────────────────────────────

  const handleWhatsApp = async (row: (typeof merchantRows)[number]) => {
    if (!row.waLink) return;
    const adminEmail = auth.currentUser?.email ?? "admin";
    setPendingWhatsApp((prev) => ({ ...prev, [row.merchant.id]: true }));
    try {
      const followupId = await addFollowup({
        merchantId: row.merchant.id,
        type: "whatsapp",
        message: row.message,
        envoyePar: adminEmail,
      });
      const newFollowup: MerchantFollowup = {
        id: followupId,
        merchantId: row.merchant.id,
        dateValue: Date.now(),
        type: "whatsapp",
        message: row.message,
        envoyePar: adminEmail,
        reponse: "",
        commentaire: "",
      };
      setFollowups((prev) => [newFollowup, ...prev]);
      window.open(row.waLink, "_blank", "noopener,noreferrer");
    } catch {
      window.open(row.waLink, "_blank", "noopener,noreferrer");
    } finally {
      setPendingWhatsApp((prev) => ({ ...prev, [row.merchant.id]: false }));
    }
  };

  const handleDuplicate = async (merchant: MerchantPilotageItem) => {
    if (!merchant.lastGameId || !merchant.lastGameCollectionName) return;
    setPendingDuplicate((prev) => ({ ...prev, [merchant.id]: true }));
    try {
      const { game } = await duplicateGameDocument(
        { gameId: merchant.lastGameId, collectionName: merchant.lastGameCollectionName },
        merchant.merchantCollectionName,
      );
      router.push(`/admin/games/${game.id}?duplicated=1`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur lors de la duplication.");
    } finally {
      setPendingDuplicate((prev) => ({ ...prev, [merchant.id]: false }));
    }
  };

  const handleSaveNote = async (followupId: string, note: string) => {
    await updateFollowupNote(followupId, note);
    setFollowups((prev) =>
      prev.map((f) => (f.id === followupId ? { ...f, commentaire: note } : f)),
    );
  };

  const FILTERS: { value: Filter; label: string }[] = [
    { value: "tous",          label: `Tous (${merchantRows.length})` },
    { value: "actif",         label: "Jeu actif" },
    { value: "7j",            label: "7 jours" },
    { value: "15j",           label: "15 jours" },
    { value: "30j",           label: "30 jours+" },
    { value: "jamais_publie", label: "Jamais publié" },
    { value: "deja_relance",  label: "Déjà relancé" },
    { value: "jamais_relance",label: "Jamais relancé" },
  ];

  return (
    <section className="min-h-full bg-[#F7F7F5]">
      <div className="mx-auto max-w-[1440px] grid gap-6">

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-[22px] font-medium tracking-[-0.02em] text-[#1a1a1a]">Relances commerçants</h1>
            <p className="mt-1 text-[14px] text-[#666]">Identifiez les commerçants sans jeu actif et relancez-les en un clic.</p>
          </div>
          <Link
            href="/admin/games/nouveau"
            className="inline-flex items-center justify-center rounded-[10px] bg-[#639922] px-5 py-3 text-[14px] font-medium text-white hover:bg-[#5a8b1f]"
          >
            + Créer un nouveau jeu
          </Link>
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-5">
          <StatCard label="Commerces" value={stats.total} color="rgba(159,177,199,0.7)" />
          <StatCard label="Jeu actif" value={stats.withGame} color="#639922" />
          <StatCard label="À relancer" value={stats.toRelance} color="#EF9F27" />
          <StatCard label="Relancés aujourd'hui" value={stats.today} color="#4F7CFF" />
          <StatCard label="Relancés cette semaine" value={stats.week} color="#4F7CFF" />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`rounded-full border px-4 py-1.5 text-[13px] font-medium transition ${
                filter === f.value
                  ? "border-[#639922] bg-[#639922] text-white"
                  : "border-[#E0E0DA] bg-white text-[#666] hover:bg-[#F7F7F5]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Loading / Error */}
        {loading && (
          <div className="rounded-[12px] border border-[#E8E8E4] bg-white px-5 py-8 text-center text-[#666]">
            <div className="loader" aria-hidden="true" />
            <p className="mt-3">Chargement…</p>
          </div>
        )}

        {!loading && error && <p className="feedback error">{error}</p>}

        {/* Table */}
        {!loading && !error && (
          <div className="overflow-x-auto rounded-[12px] border border-[#E8E8E4] bg-white">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[#E8E8E4] text-left text-[11px] uppercase tracking-[0.06em] text-[#999]">
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 font-medium">Commerce</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Téléphone</th>
                  <th className="px-4 py-3 font-medium">Dernier jeu</th>
                  <th className="px-4 py-3 font-medium text-center">Jours sans jeu</th>
                  <th className="px-4 py-3 font-medium text-center">Jeux créés</th>
                  <th className="px-4 py-3 font-medium">Dernière relance</th>
                  <th className="px-4 py-3 font-medium">Note</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-[#999]">
                      Aucun commerçant pour ce filtre.
                    </td>
                  </tr>
                )}
                {filteredRows.map(({ merchant, days, tier, waLink, lastFollowup, history }) => {
                  const contact = [merchant.ownerFirstName, merchant.ownerLastName].filter(Boolean).join(" ") || "—";
                  const phone = merchant.ownerPhone || merchant.phone || "—";
                  const lastRelanceDate = lastFollowup ? formatDate(lastFollowup.dateValue) : "—";
                  const lastNote = lastFollowup?.commentaire || "";

                  return (
                    <tr key={merchant.id} className="border-b border-[#F0F0EC] last:border-b-0 hover:bg-[#FCFCFB]">
                      {/* Statut */}
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${tierDot(tier)}`} />
                          <span className={`text-[12px] ${tier === "jamais_publie" ? "font-medium text-[#7C5CBF]" : "text-[#666]"}`}>
                            {tierLabel(tier)}
                          </span>
                        </span>
                      </td>

                      {/* Commerce */}
                      <td className="px-4 py-3">
                        <span className="font-medium text-[#1a1a1a]">{merchant.name}</span>
                        {merchant.city ? (
                          <span className="block text-[11px] text-[#999]">{merchant.city}</span>
                        ) : null}
                      </td>

                      {/* Contact */}
                      <td className="px-4 py-3 text-[#1a1a1a]">{contact}</td>

                      {/* Téléphone */}
                      <td className="px-4 py-3 text-[#666]">{phone}</td>

                      {/* Dernier jeu */}
                      <td className="px-4 py-3 text-[#666]">
                        {tier === "jamais_publie" ? (
                          <span className="text-[#7C5CBF] font-medium">Aucun</span>
                        ) : merchant.lastGameEndDateValue > 0 ? (
                          formatDate(merchant.lastGameEndDateValue)
                        ) : merchant.gamesActiveCount > 0 ? (
                          "En cours"
                        ) : "—"}
                      </td>

                      {/* Jours sans jeu */}
                      <td className="px-4 py-3 text-center">
                        {tier === "jamais_publie" ? (
                          <span className="text-[#ccc]">—</span>
                        ) : days === 0 ? (
                          <span className="text-[#639922] font-medium">actif</span>
                        ) : days !== null ? (
                          <span className={`font-medium ${days >= 30 ? "text-[#444]" : days >= 15 ? "text-[#E24B4A]" : "text-[#EF9F27]"}`}>
                            {days}j
                          </span>
                        ) : (
                          <span className="text-[#ccc]">—</span>
                        )}
                      </td>

                      {/* Jeux créés */}
                      <td className="px-4 py-3 text-center text-[#666]">{merchant.totalGamesCount}</td>

                      {/* Dernière relance */}
                      <td className="px-4 py-3">
                        <span className="text-[#666]">{lastRelanceDate}</span>
                        {history.length > 1 && (
                          <span className="ml-1 text-[11px] text-[#999]">({history.length}×)</span>
                        )}
                      </td>

                      {/* Note */}
                      <td className="px-4 py-3 max-w-[160px]">
                        {lastNote ? (
                          <span className="block truncate text-[12px] text-[#666]" title={lastNote}>{lastNote}</span>
                        ) : (
                          <span className="text-[#ccc] text-[12px]">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            {waLink ? (
                              <button
                                type="button"
                                disabled={pendingWhatsApp[merchant.id]}
                                onClick={() => void handleWhatsApp({ merchant, days, tier, waLink, message: buildMessage(merchant, days), phone, history, lastFollowup })}
                                className="inline-flex items-center gap-1.5 rounded-[7px] border px-3 py-1.5 text-[12px] font-medium text-white transition disabled:opacity-50"
                                style={{ backgroundColor: "#25D366", borderColor: "rgba(37,211,102,0.3)" }}
                              >
                                📲 WhatsApp
                              </button>
                            ) : (
                              <span className="text-[11px] text-[#ccc]">Pas de tél.</span>
                            )}
                            {lastFollowup && (
                              <button
                                type="button"
                                onClick={() => setNoteModal({ merchantName: merchant.name, followupId: lastFollowup.id, currentNote: lastFollowup.commentaire })}
                                className="rounded-[7px] border border-[#E0E0DA] bg-[#F7F7F5] px-3 py-1.5 text-[12px] text-[#666] hover:bg-[#EAF3DE] hover:border-[#CFE5AF] hover:text-[#3B6D11]"
                              >
                                Note
                              </button>
                            )}
                          </div>

                          {merchant.lastGameId ? (
                            <div className="flex flex-col gap-1">
                              {(days ?? 0) >= 30 && (
                                <p className="text-[11px] text-[#EF9F27]">
                                  💡 Pourquoi ne pas relancer avec un nouveau lot ?
                                </p>
                              )}
                              <button
                                type="button"
                                disabled={pendingDuplicate[merchant.id]}
                                onClick={() => void handleDuplicate(merchant)}
                                className="inline-flex items-center gap-1.5 rounded-[7px] border border-[#639922] bg-[#EAF3DE] px-3 py-1.5 text-[12px] font-medium text-[#3B6D11] transition hover:bg-[#D6ECC0] disabled:opacity-50"
                              >
                                {pendingDuplicate[merchant.id] ? "Duplication…" : "🔁 Dupliquer le dernier jeu"}
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-[#ccc]">Aucun jeu précédent</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Note Modal */}
      {noteModal && (
        <NoteModal
          merchantName={noteModal.merchantName}
          followupId={noteModal.followupId}
          currentNote={noteModal.currentNote}
          onSave={handleSaveNote}
          onClose={() => setNoteModal(null)}
        />
      )}
    </section>
  );
}
