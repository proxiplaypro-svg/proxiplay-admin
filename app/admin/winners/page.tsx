"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getAdminFollowUpErrorMessage,
  markPlayersAsContactedAction,
} from "@/lib/firebase/adminActions";
import { getWinnersList, type AdminWinnerListItem } from "@/lib/firebase/adminQueries";

function normalizeString(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getStatusLabel(statusKey: AdminWinnerListItem["statusKey"]) {
  switch (statusKey) {
    case "non_attribue":
      return "Non attribues";
    case "attribue":
      return "Attribues";
    case "a_retirer":
      return "A retirer";
    case "retire":
      return "Retires";
    default:
      return "Autres";
  }
}

export default function AdminWinnersPage() {
  const [winners, setWinners] = useState<AdminWinnerListItem[]>([]);
  const [search, setSearch] = useState("");
  const [merchantFilter, setMerchantFilter] = useState("tous");
  const [statusFilter, setStatusFilter] = useState("tous");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [bulkEmailLoading, setBulkEmailLoading] = useState(false);

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

  const availableMerchants = useMemo(() => {
    return [...new Set(winners.map((winner) => winner.merchantName).filter(Boolean))].sort(
      (left, right) => left.localeCompare(right, "fr"),
    );
  }, [winners]);

  const availableStatuses = useMemo(() => {
    const preferredOrder = ["non_attribue", "attribue", "a_retirer", "retire"];
    const presentStatuses = [...new Set(winners.map((winner) => winner.statusKey).filter(Boolean))];

    return preferredOrder
      .filter((statusKey) => presentStatuses.includes(statusKey))
      .map((statusKey) => ({ value: statusKey, label: getStatusLabel(statusKey) }));
  }, [winners]);

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
      const matchesMerchant =
        merchantFilter === "tous" || winner.merchantName === merchantFilter;
      const matchesStatus =
        statusFilter === "tous" || winner.statusKey === statusFilter;

      return matchesSearch && matchesMerchant && matchesStatus;
    });
  }, [merchantFilter, search, statusFilter, winners]);

  const visibleWinnerIds = useMemo(
    () => filteredWinners.map((winner) => winner.id),
    [filteredWinners],
  );
  const selectedVisibleIds = useMemo(
    () => selection.filter((id) => visibleWinnerIds.includes(id)),
    [selection, visibleWinnerIds],
  );
  const selectedVisibleWinners = useMemo(
    () => filteredWinners.filter((winner) => selectedVisibleIds.includes(winner.id)),
    [filteredWinners, selectedVisibleIds],
  );
  const allVisibleSelected =
    visibleWinnerIds.length > 0 && selectedVisibleIds.length === visibleWinnerIds.length;

  useEffect(() => {
    setSelection((current) => {
      const nextSelection = current.filter((id) => visibleWinnerIds.includes(id));

      if (nextSelection.length === current.length) {
        return current;
      }

      return nextSelection;
    });
  }, [visibleWinnerIds]);

  const toggleWinnerSelection = (winnerId: string) => {
    setSelection((current) =>
      current.includes(winnerId)
        ? current.filter((id) => id !== winnerId)
        : [...current, winnerId],
    );
  };

  const toggleAllVisibleWinners = () => {
    setSelection(allVisibleSelected ? [] : visibleWinnerIds);
  };

  const handleBulkEmail = () => {
    void (async () => {
      const contactableWinners = selectedVisibleWinners.filter(
        (winner) =>
          winner.canRelaunch &&
          winner.winnerId &&
          winner.winnerEmail.trim().length > 0 &&
          winner.winnerEmail !== "Non renseigne",
      );
      const emails = [...new Set(contactableWinners.map((winner) => winner.winnerEmail.trim()))];
      const userIds = [...new Set(
        contactableWinners
          .map((winner) => winner.winnerId)
          .filter((winnerId): winnerId is string => Boolean(winnerId)),
      )];

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

        window.location.href = `mailto:?bcc=${encodeURIComponent(emails.join(","))}&subject=${subject}&body=${body}`;
        setActionFeedback(`${emails.length} gagnant(s) relancable(s) prepare(s) par email.`);
      } catch (actionError) {
        console.error(actionError);
        setActionFeedback(getAdminFollowUpErrorMessage(actionError));
      } finally {
        setBulkEmailLoading(false);
      }
    })();
  };

  const handleCopyPhones = async () => {
    const phoneLines = selectedVisibleWinners
      .filter(
        (winner) =>
          winner.canRelaunch &&
          winner.statusKey !== "non_attribue" &&
          winner.winnerPhone.trim().length > 0 &&
          winner.winnerPhone !== "Non renseigne",
      )
      .map((winner) => `${winner.winnerLabel} - ${winner.winnerPhone} - ${winner.prizeLabel}`);

    if (phoneLines.length === 0) {
      setActionFeedback("Aucun telephone exploitable dans la selection visible.");
      return;
    }

    try {
      await navigator.clipboard.writeText(phoneLines.join("\n"));
      setActionFeedback(`${phoneLines.length} telephone(s) copie(s) dans le presse-papiers.`);
    } catch (copyError) {
      console.error(copyError);
      setActionFeedback("Impossible de copier les telephones pour le moment.");
    }
  };

  return (
    <section className="content-grid">
      <div className="panel panel-wide">
        <div className="panel-heading">
          <h2>Gagnants</h2>
          <p>Vue admin V1 des documents `prizes`, reliee aux joueurs, jeux et enseignes quand les references existent.</p>
        </div>

        <div className="overview-grid winners-overview-grid">
          <article className="overview-card">
            <span>Gains affiches</span>
            <strong>{filteredWinners.length}</strong>
          </article>
          <article className="overview-card">
            <span>Total `prizes`</span>
            <strong>{winners.length}</strong>
          </article>
          <article className="overview-card">
            <span>Lots a retirer</span>
            <strong>{filteredWinners.filter((winner) => winner.statusKey === "a_retirer").length}</strong>
          </article>
        </div>

        <div className="games-toolbar winners-toolbar">
          <label className="search-field">
            <span className="search-label">Recherche</span>
            <input
              className="search-input"
              type="search"
              placeholder="Gagnant, email, jeu, enseigne ou lot"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <div className="filter-group">
            <label className="search-field">
              <span className="search-label">Commercant</span>
              <select
                className="search-input"
                value={merchantFilter}
                onChange={(event) => setMerchantFilter(event.target.value)}
              >
                <option value="tous">Tous</option>
                {availableMerchants.map((merchantName) => (
                  <option key={merchantName} value={merchantName}>
                    {merchantName}
                  </option>
                ))}
              </select>
            </label>

            <label className="search-field">
              <span className="search-label">Statut</span>
              <select
                className="search-input"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="tous">Tous</option>
                {availableStatuses.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {!loading && !error ? (
          <div className="panel-heading" style={{ paddingTop: 0 }}>
            <p>
              {search.trim().length > 0 || merchantFilter !== "tous" || statusFilter !== "tous"
                ? `${filteredWinners.length} gains affiches sur ${winners.length}`
                : `${winners.length} gains affiches`}
            </p>
          </div>
        ) : null}

        {loading ? (
          <div className="games-loader">
            <div className="loader" aria-hidden="true" />
            <p>Chargement des gains Firestore...</p>
          </div>
        ) : null}

        {!loading && error ? <p className="feedback error">{error}</p> : null}
        {!loading && !error && actionFeedback ? <p className="feedback">{actionFeedback}</p> : null}

        {!loading && !error && selectedVisibleIds.length > 0 ? (
          <div className="bulk-actions-bar">
            <strong>{selectedVisibleIds.length} selectionne(s)</strong>
            <div className="bulk-actions-group">
              <button
                className="primary-button bulk-action-button"
                type="button"
                disabled={bulkEmailLoading}
                onClick={handleBulkEmail}
              >
                {bulkEmailLoading ? "Mise a jour..." : "Relancer par email"}
              </button>
              <button
                className="secondary-button inline-secondary-button bulk-action-button"
                type="button"
                disabled={bulkEmailLoading}
                onClick={() => void handleCopyPhones()}
              >
                Copier les telephones
              </button>
              <button
                className="secondary-button inline-secondary-button bulk-action-button"
                type="button"
                onClick={() => setSelection([])}
              >
                Tout deselectionner
              </button>
            </div>
          </div>
        ) : null}

        {!loading && !error && filteredWinners.length === 0 ? (
          <div className="empty-state">
            <strong>Aucun gain a afficher</strong>
            <p>Aucun document `prizes` ne correspond a la recherche ou aux filtres selectionnes.</p>
          </div>
        ) : null}

        {!loading && !error && filteredWinners.length > 0 ? (
          <div className="games-admin-table">
            <div className="winners-table-header">
              <label className="table-checkbox">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisibleWinners}
                  aria-label="Tout selectionner"
                />
              </label>
              <span>Gagnant</span>
              <span>Jeu</span>
              <span>Gain</span>
              <span>Date</span>
              <span>Statut</span>
              <span>Actions</span>
            </div>

            <div className="games-table-body">
              {filteredWinners.map((winner) => (
                <article key={winner.id} className="winners-table-row">
                  <div className="games-cell checkbox-cell" data-label="Selection">
                    <label className="table-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedVisibleIds.includes(winner.id)}
                        onChange={() => toggleWinnerSelection(winner.id)}
                        aria-label={`Selectionner ${winner.prizeLabel}`}
                      />
                    </label>
                  </div>

                  <div className="games-cell winners-cell winners-person-cell" data-label="Gagnant">
                    <strong>{winner.winnerLabel}</strong>
                    <span>{winner.winnerEmail}</span>
                  </div>

                  <div className="games-cell winners-cell" data-label="Jeu">
                    <strong>{winner.gameName}</strong>
                    <span>{winner.merchantName}</span>
                  </div>

                  <div className="games-cell winners-cell" data-label="Gain">
                    <strong>{winner.prizeLabel}</strong>
                    <span>{winner.prizeTypeLabel}</span>
                    <small className="winners-value">{winner.prizeValueLabel}</small>
                  </div>

                  <div className="games-cell winners-cell" data-label="Date">
                    <strong>{winner.wonAtLabel}</strong>
                  </div>

                  <div className="games-cell winners-cell" data-label="Statut">
                    <span className={`winners-status-badge ${winner.statusKey}`}>{winner.statusLabel}</span>
                  </div>

                  <div className="games-cell winners-cell winners-actions-cell" data-label="Actions">
                    <div className="games-row-actions winners-row-actions">
                      {winner.winnerId ? (
                        <Link className="row-link-button secondary" href={`/admin/joueurs/${winner.winnerId}`}>
                          Voir le joueur
                        </Link>
                      ) : (
                        <button className="row-link-button secondary" type="button" disabled>
                          Voir le joueur
                        </button>
                      )}

                      {winner.merchantId ? (
                        <Link className="row-link-button secondary" href={`/admin/commercants/${winner.merchantId}`}>
                          Voir le commercant
                        </Link>
                      ) : (
                        <button className="row-link-button secondary" type="button" disabled>
                          Voir le commercant
                        </button>
                      )}

                      {winner.gameId ? (
                        <Link className="row-link-button" href={`/admin/games/${winner.gameId}`}>
                          Voir le jeu
                        </Link>
                      ) : (
                        <button className="row-link-button" type="button" disabled>
                          Voir le jeu
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
