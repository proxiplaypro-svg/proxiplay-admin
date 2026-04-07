"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client-app";
import {
  getAdminFollowUpErrorMessage,
  markPlayersAsContactedAction,
} from "@/lib/firebase/adminActions";
import { getWinnersList, type AdminWinnerListItem } from "@/lib/firebase/adminQueries";

type WinnerStatusFilter = "tous" | "a_retirer" | "retire" | "expire";
type WinnerRow = AdminWinnerListItem & {
  retiredAtLabel?: string | null;
};

function normalizeString(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function formatCount(value: number) {
  return new Intl.NumberFormat("fr-FR").format(value);
}

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function formatDateDay(value: number) {
  if (!value) {
    return "Date inconnue";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatTime(value: number) {
  if (!value) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getStatusBadgeClasses(statusKey: string) {
  switch (statusKey) {
    case "retire":
      return "bg-[#EAF3DE] text-[#3B6D11]";
    case "expire":
      return "bg-[#F1EFE8] text-[#5F5E5A]";
    default:
      return "bg-[#FAEEDA] text-[#633806]";
  }
}

function getStatusLabel(statusKey: string) {
  switch (statusKey) {
    case "retire":
      return "Retire";
    case "expire":
      return "Expire";
    default:
      return "A retirer";
  }
}

function isPendingPrize(winner: WinnerRow) {
  return winner.statusKey === "a_retirer" || winner.statusKey === "attribue";
}

function getPrizeTypeLabel(type: string) {
  const normalized = normalizeString(type);

  if (normalized.includes("principal")) {
    return "Lot principal";
  }

  if (normalized.includes("second")) {
    return "Lot secondaire";
  }

  return type;
}

function csvEscape(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export default function AdminWinnersPage() {
  const [winners, setWinners] = useState<WinnerRow[]>([]);
  const [search, setSearch] = useState("");
  const [merchantFilter, setMerchantFilter] = useState("tous");
  const [statusFilter, setStatusFilter] = useState<WinnerStatusFilter>("tous");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [bulkEmailLoading, setBulkEmailLoading] = useState(false);
  const [markingIds, setMarkingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let isCancelled = false;

    const fetchWinners = async () => {
      setLoading(true);
      setError(null);

      try {
        const items = await getWinnersList();

        if (!isCancelled) {
          setWinners(items);
        }
      } catch (fetchError) {
        console.error(fetchError);

        if (!isCancelled) {
          setError("Impossible de charger la liste des gains depuis Firestore.");
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    void fetchWinners();

    return () => {
      isCancelled = true;
    };
  }, []);

  const availableMerchants = useMemo(
    () =>
      [...new Set(winners.map((winner) => winner.merchantName).filter(Boolean))].sort((left, right) =>
        left.localeCompare(right, "fr"),
      ),
    [winners],
  );

  const filteredWinners = useMemo(() => {
    const normalizedSearch = normalizeString(search.trim());

    return winners.filter((winner) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        normalizeString(winner.winnerLabel).includes(normalizedSearch) ||
        normalizeString(winner.winnerEmail).includes(normalizedSearch) ||
        normalizeString(winner.gameName).includes(normalizedSearch) ||
        normalizeString(winner.merchantName).includes(normalizedSearch) ||
        normalizeString(winner.prizeLabel).includes(normalizedSearch);
      const matchesMerchant = merchantFilter === "tous" || winner.merchantName === merchantFilter;
      const matchesStatus =
        statusFilter === "tous" ||
        (statusFilter === "a_retirer" && isPendingPrize(winner)) ||
        winner.statusKey === statusFilter;

      return matchesSearch && matchesMerchant && matchesStatus;
    });
  }, [merchantFilter, search, statusFilter, winners]);

  const visibleWinnerIds = useMemo(() => filteredWinners.map((winner) => winner.id), [filteredWinners]);
  const selectedVisibleIds = useMemo(
    () => visibleWinnerIds.filter((id) => selection.has(id)),
    [selection, visibleWinnerIds],
  );
  const selectedVisibleWinners = useMemo(
    () => filteredWinners.filter((winner) => selection.has(winner.id)),
    [filteredWinners, selection],
  );
  const pendingVisibleWinners = useMemo(
    () => filteredWinners.filter((winner) => isPendingPrize(winner)),
    [filteredWinners],
  );
  const allVisibleSelected =
    visibleWinnerIds.length > 0 && selectedVisibleIds.length === visibleWinnerIds.length;

  useEffect(() => {
    setSelection((current) => {
      const next = new Set([...current].filter((id) => visibleWinnerIds.includes(id)));
      return next.size === current.size ? current : next;
    });
  }, [visibleWinnerIds]);

  const pendingCount = useMemo(
    () => winners.filter((winner) => isPendingPrize(winner)).length,
    [winners],
  );
  const retiredCount = useMemo(
    () => winners.filter((winner) => winner.statusKey === "retire").length,
    [winners],
  );
  const todayCount = useMemo(() => {
    const today = new Date();
    return winners.filter((winner) => {
      if (!winner.wonAtValue) {
        return false;
      }

      const wonAt = new Date(winner.wonAtValue);
      return (
        wonAt.getDate() === today.getDate() &&
        wonAt.getMonth() === today.getMonth() &&
        wonAt.getFullYear() === today.getFullYear()
      );
    }).length;
  }, [winners]);

  const merchantsToNotify = useMemo(
    () => [...new Set(filteredWinners.filter((winner) => isPendingPrize(winner)).map((winner) => winner.merchantName))].filter(Boolean),
    [filteredWinners],
  );

  const toggleWinnerSelection = (winnerId: string) => {
    setSelection((current) => {
      const next = new Set(current);

      if (next.has(winnerId)) {
        next.delete(winnerId);
      } else {
        next.add(winnerId);
      }

      return next;
    });
  };

  const toggleAllVisibleWinners = () => {
    setSelection((current) => {
      if (allVisibleSelected) {
        return new Set<string>();
      }

      return new Set(visibleWinnerIds);
    });
  };

  const exportRows = (rows: WinnerRow[], filename: string) => {
    const csv = [
      ["Gagnant", "Email", "Jeu", "Commercant", "Lot", "Type", "Valeur", "Date", "Statut"],
      ...rows.map((winner) => [
        winner.winnerLabel,
        winner.winnerEmail,
        winner.gameName,
        winner.merchantName,
        winner.prizeLabel,
        winner.prizeTypeLabel,
        winner.prizeValueLabel,
        winner.wonAtLabel,
        getStatusLabel(winner.statusKey),
      ]),
    ]
      .map((row) => row.map(csvEscape).join(","))
      .join("\n");

    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportAll = () => {
    exportRows(filteredWinners, "proxiplay-gagnants.csv");
  };

  const handleExportSelection = () => {
    exportRows(selectedVisibleWinners, "proxiplay-gagnants-selection.csv");
  };

  const markAsRetired = async (winnerIds: string[]) => {
    if (winnerIds.length === 0) {
      return;
    }

    const previousWinners = winners;
    const now = new Date();
    const retiredAtLabel = formatShortDate(now);

    setActionFeedback(null);
    setMarkingIds((current) => new Set([...current, ...winnerIds]));
    setWinners((current) =>
      current.map((winner) =>
        winnerIds.includes(winner.id)
          ? {
              ...winner,
              statusKey: "retire",
              statusLabel: "Retire",
              retiredAtLabel,
            }
          : winner,
      ),
    );

    try {
      await Promise.all(
        winnerIds.map((winnerId) =>
          updateDoc(doc(db, "prizes", winnerId), {
            status: "retiré",
            redeemed_at: serverTimestamp(),
            retiredAt: serverTimestamp(),
          }),
        ),
      );

      setSelection((current) => {
        const next = new Set(current);
        winnerIds.forEach((id) => next.delete(id));
        return next;
      });
      setActionFeedback(
        `${winnerIds.length} lot(s) marque(s) comme retires dans Firestore.`,
      );
    } catch (markError) {
      console.error(markError);
      setWinners(previousWinners);
      setActionFeedback("Impossible de marquer ce ou ces lots comme retires.");
    } finally {
      setMarkingIds((current) => {
        const next = new Set(current);
        winnerIds.forEach((id) => next.delete(id));
        return next;
      });
    }
  };

  const handleBulkEmail = (sourceWinners: WinnerRow[] = selectedVisibleWinners) => {
    void (async () => {
      const contactableWinners = sourceWinners.filter(
        (winner) =>
          winner.canRelaunch &&
          winner.winnerId &&
          winner.winnerEmail.trim().length > 0 &&
          winner.winnerEmail !== "Non renseigne",
      );
      const emails = [...new Set(contactableWinners.map((winner) => winner.winnerEmail.trim()))];
      const userIds = [
        ...new Set(
          contactableWinners
            .map((winner) => winner.winnerId)
            .filter((winnerId): winnerId is string => Boolean(winnerId)),
        ),
      ];

      if (emails.length === 0 || userIds.length === 0) {
        setActionFeedback("Aucun gagnant relancable par email dans la selection visible.");
        return;
      }

      setBulkEmailLoading(true);
      setActionFeedback(null);

      try {
        await markPlayersAsContactedAction({
          userIds,
          lastContactChannel: "email",
        });

        const subject = encodeURIComponent("ProxiPlay - retrait de votre lot");
        const body = encodeURIComponent(
          "Bonjour,\n\nNous revenons vers vous concernant votre lot ProxiPlay, qui semble toujours en attente de retrait.\n\nN hésitez pas a nous repondre pour finaliser cela.\n\nBien a vous,\nL equipe ProxiPlay",
        );

        window.location.href = `mailto:?bcc=${encodeURIComponent(
          emails.join(","),
        )}&subject=${subject}&body=${body}`;
        setActionFeedback(`${emails.length} gagnant(s) relancable(s) prepare(s) par email.`);
      } catch (actionError) {
        console.error(actionError);
        setActionFeedback(getAdminFollowUpErrorMessage(actionError));
      } finally {
        setBulkEmailLoading(false);
      }
    })();
  };

  return (
    <section className="space-y-4 bg-[#F7F7F5] text-[#1A1A1A]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-[22px] font-medium tracking-[-0.02em] text-[#1A1A1A]">Gagnants</h1>
          <p className="mt-2 text-[13px] text-[#666666]">
            Gains lies aux joueurs, jeux et enseignes — {formatCount(winners.length)} au total
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleExportAll}
            className="rounded-[10px] border border-[#E0E0DA] bg-white px-4 py-[10px] text-[12px] text-[#1A1A1A] transition hover:bg-[#FAFAF8]"
          >
            Exporter CSV
          </button>
          <button
            type="button"
            disabled={selectedVisibleIds.length === 0}
            onClick={() => void markAsRetired(selectedVisibleIds)}
            className="rounded-[10px] border border-[#639922] bg-[#639922] px-4 py-[10px] text-[12px] font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50 hover:bg-[#57881D]"
          >
            Marquer selection retiree
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Gains affiches",
            value: formatCount(filteredWinners.length),
            helper: "Total prizes",
            helperColor: "#999999",
            accent: "#E8E8E4",
            critical: false,
          },
          {
            label: "Lots a retirer",
            value: formatCount(pendingCount),
            helper: `${formatCount(
              winners.length > 0 ? Math.round((pendingCount / winners.length) * 100) : 0,
            )}% — action requise`,
            helperColor: "#A32D2D",
            accent: "#E24B4A",
            critical: true,
          },
          {
            label: "Deja retires",
            value: formatCount(retiredCount),
            helper: `${formatCount(
              winners.length > 0 ? Math.round((retiredCount / winners.length) * 100) : 0,
            )}% traites`,
            helperColor: "#3B6D11",
            accent: "#639922",
            critical: false,
          },
          {
            label: "Aujourd'hui",
            value: formatCount(todayCount),
            helper: "Nouveaux gains J0",
            helperColor: "#185FA5",
            accent: "#378ADD",
            critical: false,
          },
        ].map((card) => (
          <article key={card.label} className="overflow-hidden rounded-[10px] border border-[#E8E8E4] bg-white">
            <div className="h-[3px]" style={{ backgroundColor: card.accent }} />
            <div className="space-y-2 px-5 py-4">
              <p className="text-[11px] text-[#999999]">{card.label}</p>
              <strong
                className="block text-[26px] font-medium leading-none"
                style={{ color: card.critical ? "#A32D2D" : "#1A1A1A" }}
              >
                {card.value}
              </strong>
              <p className="text-[11px]" style={{ color: card.helperColor }}>
                {card.helper}
              </p>
            </div>
          </article>
        ))}
      </div>

      {pendingCount > 0 ? (
        <div className="flex flex-col gap-4 rounded-[12px] border border-[#FAC775] bg-[#FFFBF0] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-[10px] bg-[#FAEEDA] text-[22px] text-[#633806]">
              ⚠
            </div>
            <div>
              <h2 className="text-[14px] font-medium text-[#633806]">
                {formatCount(pendingCount)} lots en attente de retrait
              </h2>
              <p className="mt-1 text-[13px] leading-[1.45] text-[#854F0B]">
                Les gagnants ont ete notifies — assure-toi que les marchands sont informes pour remettre les lots en magasin.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={bulkEmailLoading || merchantsToNotify.length === 0}
            onClick={() => handleBulkEmail(pendingVisibleWinners)}
            className="rounded-[10px] border border-[#639922] bg-[#639922] px-4 py-[10px] text-[12px] font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50 hover:bg-[#57881D]"
          >
            {bulkEmailLoading ? "Preparation..." : "Notifier marchands"}
          </button>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 rounded-[10px] border border-[#E8E8E4] bg-white p-4 lg:flex-row lg:items-center">
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as WinnerStatusFilter)}
          className="h-[40px] rounded-[8px] border border-[#E8E8E4] bg-[#F7F7F5] px-3 text-[12.5px] text-[#1A1A1A] outline-none"
        >
          <option value="tous">Tous</option>
          <option value="a_retirer">A retirer</option>
          <option value="retire">Retire</option>
          <option value="expire">Expire</option>
        </select>

        <select
          value={merchantFilter}
          onChange={(event) => setMerchantFilter(event.target.value)}
          className="h-[40px] rounded-[8px] border border-[#E8E8E4] bg-[#F7F7F5] px-3 text-[12.5px] text-[#1A1A1A] outline-none"
        >
          <option value="tous">Tous les commercants</option>
          {availableMerchants.map((merchantName) => (
            <option key={merchantName} value={merchantName}>
              {merchantName}
            </option>
          ))}
        </select>

        <input
          type="search"
          placeholder="Gagnant, email, jeu, lot..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="h-[40px] flex-1 rounded-[8px] border border-[#E8E8E4] bg-[#F7F7F5] px-3 text-[12.5px] text-[#1A1A1A] outline-none placeholder:text-[#999999]"
        />

        <div className="text-[12px] text-[#999999]">{formatCount(filteredWinners.length)} gains affiches</div>
      </div>

      {error ? (
        <div className="rounded-[12px] border border-[#F2CACA] bg-[#FCEBEB] px-5 py-4 text-[12.5px] text-[#A32D2D]">
          {error}
        </div>
      ) : null}

      {actionFeedback ? (
        <div className="rounded-[12px] border border-[#E8E8E4] bg-white px-5 py-4 text-[12.5px] text-[#666666]">
          {actionFeedback}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-[12px] border border-[#E8E8E4] bg-white">
        <div className="flex flex-col gap-3 border-b border-[#F0F0EC] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-[15px] font-medium text-[#1A1A1A]">Liste des gagnants</h2>

          {selectedVisibleIds.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] text-[#999999]">
                {selectedVisibleIds.length} selectionnes
              </span>
              <button
                type="button"
                onClick={() => void markAsRetired(selectedVisibleIds)}
                            className="rounded-[8px] bg-[#EAF3DE] px-3 py-[9px] text-[12px] font-medium text-[#3B6D11] transition hover:bg-[#DDEAC7]"
              >
                Marquer retires
              </button>
              <button
                type="button"
                onClick={handleExportSelection}
                className="rounded-[8px] bg-[#F7F7F5] px-3 py-[9px] text-[12px] text-[#666666] transition hover:bg-[#EFEDE6]"
              >
                Exporter selection
              </button>
            </div>
          ) : null}
        </div>

        {loading ? (
          <div className="px-5 py-10 text-[12.5px] text-[#999999]">Chargement des gains Firestore...</div>
        ) : filteredWinners.length === 0 ? (
          <div className="px-5 py-10 text-[12.5px] text-[#999999]">
            Aucun document prizes ne correspond a la recherche ou aux filtres selectionnes.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-[#F0F0EC]">
                  {["", "Gagnant", "Jeu", "Gain", "Date", "Statut", "Actions"].map((label) => (
                    <th
                      key={label}
                      className="px-[14px] py-[10px] text-left text-[10.5px] uppercase tracking-[0.05em] text-[#999999]"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredWinners.map((winner) => (
                  <tr key={winner.id} className="border-b border-[#F0F0EC] hover:bg-[#FAFAF8] last:border-b-0">
                    <td className="px-[14px] py-[10px]">
                      <button
                        type="button"
                        onClick={() => toggleWinnerSelection(winner.id)}
                        aria-label={`Selectionner ${winner.prizeLabel}`}
                        className={`flex h-[14px] w-[14px] items-center justify-center rounded-[3px] border ${
                          selection.has(winner.id)
                            ? "border-[#639922] bg-[#EAF3DE]"
                            : "border-[#D3D1C7] bg-white"
                        }`}
                      >
                        {selection.has(winner.id) ? (
                          <span className="h-[6px] w-[6px] rounded-[1px] bg-[#639922]" />
                        ) : null}
                      </button>
                    </td>

                    <td className="px-[14px] py-[10px] text-[12.5px] text-[#1A1A1A]">
                      <p className="font-medium">{winner.winnerLabel}</p>
                      <p className="mt-1 text-[11px] text-[#999999]">{winner.winnerEmail}</p>
                    </td>

                    <td className="px-[14px] py-[10px] text-[12.5px] text-[#1A1A1A]">
                      <p className="font-medium">{winner.gameName}</p>
                      <p className="mt-1 text-[11px] text-[#999999]">{winner.merchantName}</p>
                    </td>

                    <td className="px-[14px] py-[10px] text-[12.5px] text-[#1A1A1A]">
                      <p className="font-medium">{winner.prizeLabel}</p>
                      <p className="mt-1 text-[10.5px] text-[#999999]">
                        {getPrizeTypeLabel(winner.prizeTypeLabel)}
                      </p>
                      <p className="mt-1 text-[11px] font-medium text-[#639922]">{winner.prizeValueLabel}</p>
                    </td>

                    <td className="px-[14px] py-[10px] text-[12.5px] text-[#1A1A1A]">
                      <p>{formatDateDay(winner.wonAtValue)}</p>
                      <p className="mt-1 text-[10.5px] text-[#BBBBBB]">{formatTime(winner.wonAtValue)}</p>
                    </td>

                    <td className="px-[14px] py-[10px] text-[12.5px]">
                      <span className={`inline-flex rounded-full px-3 py-[4px] text-[11px] font-medium ${getStatusBadgeClasses(winner.statusKey)}`}>
                        {getStatusLabel(winner.statusKey)}
                      </span>
                    </td>

                    <td className="px-[14px] py-[10px] text-[12.5px]">
                      <div className="flex flex-col items-start gap-1">
                        {isPendingPrize(winner) ? (
                          <button
                            type="button"
                            disabled={markingIds.has(winner.id)}
                            onClick={() => void markAsRetired([winner.id])}
                            className="rounded-[6px] bg-[#EAF3DE] px-2 py-[6px] text-[11px] font-medium text-[#3B6D11] transition hover:bg-[#DDEAC7] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {markingIds.has(winner.id) ? "Mise a jour..." : "Marquer retire"}
                          </button>
                        ) : winner.retiredAtLabel ? (
                          <p className="text-[11px] text-[#999999]">Retire le {winner.retiredAtLabel}</p>
                        ) : (
                          <p className="text-[11px] text-[#999999]">Retire</p>
                        )}

                        {winner.winnerId ? (
                          <Link href={`/admin/joueurs/${winner.winnerId}`} className="text-[11px] text-[#639922]">
                            Voir joueur →
                          </Link>
                        ) : null}

                        {winner.gameId ? (
                          <Link href={`/admin/games/${winner.gameId}`} className="text-[11px] text-[#639922]">
                            Voir jeu →
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
