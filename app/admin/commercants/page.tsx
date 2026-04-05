"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getAdminFollowUpErrorMessage,
  markMerchantAsContactedAction,
  markMerchantsAsContactedAction,
} from "@/lib/firebase/adminActions";
import { getMerchantsList, type AdminMerchantListItem } from "@/lib/firebase/adminQueries";

const LOW_PARTICIPATIONS_THRESHOLD = 10;
type MerchantStatusFilter = "tous" | "actif" | "a_relancer";
type FollowUpFilter = "tous" | "a_faire" | "relance" | "sans_reponse" | "ok";
type LastContactSort = "recent_first" | "oldest_first" | "never_first";
const RECENT_GAME_START_WINDOW_IN_MS = 7 * 24 * 60 * 60 * 1000;

function formatCount(value: number) {
  return new Intl.NumberFormat("fr-FR").format(value);
}

function getMerchantFollowUpState(merchant: AdminMerchantListItem) {
  const hasRecentlyStartedGame =
    merchant.latestGameStartValue > 0 &&
    Date.now() - merchant.latestGameStartValue <= RECENT_GAME_START_WINDOW_IN_MS;

  if (merchant.activeGamesCount > 0 || hasRecentlyStartedGame) {
    return "actif";
  }

  return merchant.participationsCount < LOW_PARTICIPATIONS_THRESHOLD || merchant.followersCount === 0
    ? "a_relancer"
    : "actif";
}

function getMerchantFollowUpLabel(merchant: AdminMerchantListItem) {
  return getMerchantFollowUpState(merchant) === "a_relancer" ? "A relancer" : "Actif";
}

function getFollowUpStatusLabel(status: AdminMerchantListItem["followUp"]["followUpStatus"]) {
  switch (status) {
    case "relance":
      return "Relance";
    case "sans_reponse":
      return "Sans reponse";
    case "ok":
      return "OK";
    default:
      return "A faire";
  }
}

function getFollowUpChannelLabel(channel: AdminMerchantListItem["followUp"]["lastContactChannel"]) {
  switch (channel) {
    case "email":
      return "email";
    case "phone":
      return "telephone";
    case "manual":
      return "manuel";
    default:
      return "inconnu";
  }
}

function getMerchantRelaunchLink(merchant: AdminMerchantListItem) {
  const normalizedEmail = merchant.email.trim();
  const normalizedPhone = merchant.phone.trim();

  if (normalizedEmail.length > 0) {
    const subject = encodeURIComponent("ProxiPlay - point sur vos jeux");
    const body = encodeURIComponent(
      `Bonjour ${merchant.name},\n\nJe reviens vers vous pour faire un point rapide sur vos jeux ProxiPlay et vos resultats recents.\n\nDites-moi si vous souhaitez que nous regardions cela ensemble.\n\nBien a vous,\nL equipe ProxiPlay`,
    );

    return {
      href: `mailto:${normalizedEmail}?subject=${subject}&body=${body}`,
      label: "Relancer",
    };
  }

  if (normalizedPhone.length > 0) {
    return {
      href: `tel:${normalizedPhone}`,
      label: "Relancer",
    };
  }

  return null;
}

export default function AdminMerchantsPage() {
  const [merchants, setMerchants] = useState<AdminMerchantListItem[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<MerchantStatusFilter>("tous");
  const [followUpFilter, setFollowUpFilter] = useState<FollowUpFilter>("tous");
  const [lastContactSort, setLastContactSort] = useState<LastContactSort>("recent_first");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [bulkEmailLoading, setBulkEmailLoading] = useState(false);
  const [pendingRelaunchId, setPendingRelaunchId] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const fetchMerchants = async () => {
      setLoading(true);
      setError(null);

      try {
        const items = await getMerchantsList();
        if (!isCancelled) {
          setMerchants(items);
        }
      } catch (fetchError) {
        console.error(fetchError);
        if (!isCancelled) {
          setError("Impossible de charger la liste des commercants depuis Firestore.");
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    void fetchMerchants();

    return () => {
      isCancelled = true;
    };
  }, []);

  const filteredMerchants = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const filteredItems = merchants.filter((merchant) => {
      const merchantStatus = getMerchantFollowUpState(merchant);
      const matchesStatus = statusFilter === "tous" || merchantStatus === statusFilter;
      const matchesFollowUp =
        followUpFilter === "tous" || merchant.followUp.followUpStatus === followUpFilter;

      return (
        matchesStatus &&
        matchesFollowUp &&
        (
          normalizedSearch.length === 0 ||
          merchant.name.toLowerCase().includes(normalizedSearch) ||
          merchant.city.toLowerCase().includes(normalizedSearch)
        )
      );
    });

    return [...filteredItems].sort((left, right) => {
      if (lastContactSort === "never_first") {
        if (left.followUp.hasLastContact !== right.followUp.hasLastContact) {
          return left.followUp.hasLastContact ? 1 : -1;
        }
      }

      const leftValue = left.followUp.lastContactAtValue;
      const rightValue = right.followUp.lastContactAtValue;

      if (leftValue === rightValue) {
        return left.name.localeCompare(right.name, "fr");
      }

      if (lastContactSort === "oldest_first") {
        return leftValue - rightValue;
      }

      return rightValue - leftValue;
    });
  }, [followUpFilter, lastContactSort, merchants, search, statusFilter]);

  const activeCount = filteredMerchants.filter(
    (merchant) => getMerchantFollowUpState(merchant) === "actif",
  ).length;
  const followUpCount = filteredMerchants.length - activeCount;
  const visibleMerchantIds = useMemo(
    () => filteredMerchants.map((merchant) => merchant.id),
    [filteredMerchants],
  );
  const selectedVisibleIds = useMemo(
    () => selection.filter((id) => visibleMerchantIds.includes(id)),
    [selection, visibleMerchantIds],
  );
  const selectedVisibleMerchants = useMemo(
    () => filteredMerchants.filter((merchant) => selectedVisibleIds.includes(merchant.id)),
    [filteredMerchants, selectedVisibleIds],
  );
  const allVisibleSelected =
    visibleMerchantIds.length > 0 && selectedVisibleIds.length === visibleMerchantIds.length;

  useEffect(() => {
    setSelection((current) => {
      const nextSelection = current.filter((id) => visibleMerchantIds.includes(id));

      if (nextSelection.length === current.length) {
        return current;
      }

      return nextSelection;
    });
  }, [visibleMerchantIds]);

  const toggleMerchantSelection = (merchantId: string) => {
    setSelection((current) =>
      current.includes(merchantId)
        ? current.filter((id) => id !== merchantId)
        : [...current, merchantId],
    );
  };

  const toggleAllVisibleMerchants = () => {
    setSelection(allVisibleSelected ? [] : visibleMerchantIds);
  };

  const handleStatusCardClick = (nextFilter: MerchantStatusFilter) => {
    setStatusFilter(nextFilter);

    if (nextFilter === "a_relancer") {
      const relaunchMerchantIds = merchants
        .filter((merchant) => {
          const normalizedSearch = search.trim().toLowerCase();
          const matchesSearch =
            normalizedSearch.length === 0 ||
            merchant.name.toLowerCase().includes(normalizedSearch) ||
            merchant.city.toLowerCase().includes(normalizedSearch);

          return matchesSearch && getMerchantFollowUpState(merchant) === "a_relancer";
        })
        .map((merchant) => merchant.id);

      setSelection(relaunchMerchantIds);
      return;
    }

    setSelection([]);
  };

  const handleBulkMerchantEmail = () => {
    void (async () => {
      const contactableMerchants = selectedVisibleMerchants.filter(
        (merchant) => merchant.email.trim().length > 0,
      );
      const emails = [...new Set(contactableMerchants.map((merchant) => merchant.email.trim()))];

      if (emails.length === 0) {
        setActionFeedback("Aucun email exploitable dans la selection visible.");
        return;
      }

      setBulkEmailLoading(true);
      setActionFeedback(null);

      try {
        await markMerchantsAsContactedAction({
          merchantIds: contactableMerchants.map((merchant) => merchant.id),
          lastContactChannel: "email",
        });

        const now = Date.now();
        const nowLabel = new Intl.DateTimeFormat("fr-FR", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(now));

        setMerchants((current) =>
          current.map((merchant) =>
            contactableMerchants.some((item) => item.id === merchant.id)
              ? {
                  ...merchant,
                  followUp: {
                    ...merchant.followUp,
                    lastContactAtLabel: nowLabel,
                    lastContactAtValue: now,
                    lastContactChannel: "email",
                    followUpStatus: "relance",
                    hasLastContact: true,
                  },
                }
              : merchant,
          ),
        );

        const subject = encodeURIComponent("ProxiPlay - point sur vos jeux");
        const body = encodeURIComponent(
          "Bonjour,\n\nJe reviens vers vous pour faire un point rapide sur vos jeux ProxiPlay et vos resultats recents.\n\nBien a vous,\nL equipe ProxiPlay",
        );

        window.location.href = `mailto:?bcc=${encodeURIComponent(emails.join(","))}&subject=${subject}&body=${body}`;
        setActionFeedback(`${emails.length} adresse(s) email preparee(s) et marquee(s) comme relancees.`);
      } catch (actionError) {
        console.error(actionError);
        setActionFeedback(getAdminFollowUpErrorMessage(actionError));
      } finally {
        setBulkEmailLoading(false);
      }
    })();
  };

  const handleMerchantRelaunch = (merchant: AdminMerchantListItem) => {
    const normalizedEmail = merchant.email.trim();
    const normalizedPhone = merchant.phone.trim();

    let href: string | null = null;
    let channel: "email" | "phone" | null = null;

    if (normalizedEmail.length > 0) {
      const subject = encodeURIComponent("ProxiPlay - point sur vos jeux");
      const body = encodeURIComponent(
        `Bonjour ${merchant.name},\n\nJe reviens vers vous pour faire un point rapide sur vos jeux ProxiPlay et vos resultats recents.\n\nDites-moi si vous souhaitez que nous regardions cela ensemble.\n\nBien a vous,\nL equipe ProxiPlay`,
      );
      href = `mailto:${normalizedEmail}?subject=${subject}&body=${body}`;
      channel = "email";
    } else if (normalizedPhone.length > 0) {
      href = `tel:${normalizedPhone}`;
      channel = "phone";
    }

    if (!href || !channel) {
      setActionFeedback("Aucun canal de relance exploitable pour ce commercant.");
      return;
    }

    void (async () => {
      setPendingRelaunchId(merchant.id);
      setActionFeedback(null);

      try {
        await markMerchantAsContactedAction({
          merchantId: merchant.id,
          lastContactChannel: channel,
        });

        const now = Date.now();
        const nowLabel = new Intl.DateTimeFormat("fr-FR", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(now));

        setMerchants((current) =>
          current.map((currentMerchant) =>
            currentMerchant.id === merchant.id
              ? {
                  ...currentMerchant,
                  followUp: {
                    ...currentMerchant.followUp,
                    lastContactAtLabel: nowLabel,
                    lastContactAtValue: now,
                    lastContactChannel: channel,
                    followUpStatus: "relance",
                    hasLastContact: true,
                  },
                }
              : currentMerchant,
          ),
        );

        window.location.href = href;
        setActionFeedback(`Relance commercant preparee et suivi mis a jour via ${channel === "email" ? "email" : "telephone"}.`);
      } catch (actionError) {
        console.error(actionError);
        setActionFeedback(getAdminFollowUpErrorMessage(actionError));
      } finally {
        setPendingRelaunchId(null);
      }
    })();
  };

  const handleCopyMerchantPhones = async () => {
    const phones = selectedVisibleMerchants
      .map((merchant) => ({
        name: merchant.name,
        phone: merchant.phone.trim(),
      }))
      .filter((item) => item.phone.length > 0);

    if (phones.length === 0) {
      setActionFeedback("Aucun telephone exploitable dans la selection visible.");
      return;
    }

    const payload = phones.map((item) => `${item.name} - ${item.phone}`).join("\n");

    try {
      await navigator.clipboard.writeText(payload);
      setActionFeedback(`${phones.length} telephone(s) copie(s) dans le presse-papiers.`);
    } catch (copyError) {
      console.error(copyError);
      setActionFeedback("Impossible de copier les telephones pour le moment.");
    }
  };

  return (
    <section className="content-grid">
      <div className="panel panel-wide merchants-panel">
        <div className="panel-heading">
          <h2>Commercants</h2>
          <p>Suivi commercial des enseignes, de leur activite et des relances a prioriser.</p>
        </div>

        <div className="merchants-toolbar">
          <div className="merchants-summary-grid">
            <button
              className={`merchant-summary-card merchant-summary-button ${statusFilter === "tous" ? "active" : ""}`}
              type="button"
              onClick={() => handleStatusCardClick("tous")}
            >
              <span>Enseignes</span>
              <strong>{formatCount(filteredMerchants.length)}</strong>
            </button>
            <button
              className={`merchant-summary-card merchant-summary-button ${statusFilter === "actif" ? "active" : ""}`}
              type="button"
              onClick={() => handleStatusCardClick("actif")}
            >
              <span>Actifs</span>
              <strong>{formatCount(activeCount)}</strong>
            </button>
            <button
              className={`merchant-summary-card merchant-summary-button warning ${statusFilter === "a_relancer" ? "active" : ""}`}
              type="button"
              onClick={() => handleStatusCardClick("a_relancer")}
            >
              <span>A relancer</span>
              <strong>{formatCount(followUpCount)}</strong>
            </button>
          </div>

          <label className="search-field">
            <span className="search-label">Recherche</span>
            <input
              className="search-input merchants-search-input"
              type="search"
              placeholder="Rechercher par enseigne ou ville"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <label className="search-field">
            <span className="search-label">Suivi</span>
            <select
              className="search-input"
              value={followUpFilter}
              onChange={(event) => setFollowUpFilter(event.target.value as FollowUpFilter)}
            >
              <option value="tous">Tous</option>
              <option value="a_faire">A faire</option>
              <option value="relance">Relance</option>
              <option value="sans_reponse">Sans reponse</option>
              <option value="ok">OK</option>
            </select>
          </label>

          <label className="search-field">
            <span className="search-label">Derniere relance</span>
            <select
              className="search-input"
              value={lastContactSort}
              onChange={(event) => setLastContactSort(event.target.value as LastContactSort)}
            >
              <option value="recent_first">Plus recente</option>
              <option value="oldest_first">Plus ancienne</option>
              <option value="never_first">Jamais relance d abord</option>
            </select>
          </label>
        </div>

        {loading ? (
          <div className="games-loader">
            <div className="loader" aria-hidden="true" />
            <p>Chargement des commercants Firestore...</p>
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
                disabled={bulkEmailLoading || pendingRelaunchId !== null}
                onClick={handleBulkMerchantEmail}
              >
                {bulkEmailLoading ? "Mise a jour..." : "Relancer par email"}
              </button>
              <button className="secondary-button inline-secondary-button bulk-action-button" type="button" onClick={() => void handleCopyMerchantPhones()}>
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

        {!loading && !error && filteredMerchants.length === 0 ? (
          <div className="empty-state">
            <strong>Aucun commercant a afficher</strong>
            <p>
              Aucun document `enseignes` ne correspond a la recherche ou au filtre selectionne.
            </p>
          </div>
        ) : null}

        {!loading && !error && filteredMerchants.length > 0 ? (
          <div className="games-admin-table merchants-table-shell">
            <div className="merchants-table-header">
              <label className="table-checkbox">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisibleMerchants}
                  aria-label="Tout selectionner"
                />
              </label>
              <span>Enseigne</span>
              <span>Ville</span>
              <span>Contact</span>
              <span>Relance</span>
              <span>Clics</span>
              <span>Participations</span>
              <span>Followers</span>
              <span>Actions</span>
            </div>

            <div className="games-table-body">
              {filteredMerchants.map((merchant) => {
                const followUpState = getMerchantFollowUpState(merchant);
                const relaunchLink = getMerchantRelaunchLink(merchant);
                return (
                  <article
                    key={merchant.id}
                    className={`merchants-table-row ${selectedVisibleIds.includes(merchant.id) ? "row-selected" : ""}`}
                  >
                    <div className="games-cell checkbox-cell" data-label="Selection">
                      <label className="table-checkbox">
                        <input
                          type="checkbox"
                          checked={selectedVisibleIds.includes(merchant.id)}
                          onChange={() => toggleMerchantSelection(merchant.id)}
                          aria-label={`Selectionner ${merchant.name}`}
                        />
                      </label>
                    </div>
                    <div className="games-cell merchant-name-cell" data-label="Enseigne">
                      <strong>{merchant.name}</strong>
                    </div>
                    <div className="games-cell" data-label="Ville">
                      <span>{merchant.city || "Non renseignee"}</span>
                    </div>
                    <div className="games-cell merchant-contact-cell" data-label="Contact">
                      <strong className="merchant-contact-link">{merchant.email || "Aucun email"}</strong>
                      <span className="merchant-phone">{merchant.phone || "Aucun telephone"}</span>
                      {!merchant.hasOwnerUserRef ? (
                        <small className="merchant-counter-hint">User commercant non rattache.</small>
                      ) : null}
                    </div>
                    <div className="games-cell merchant-status-cell" data-label="Statut">
                      <span className={`merchant-badge ${followUpState}`}>
                        {getMerchantFollowUpLabel(merchant)}
                      </span>
                      <span className={`follow-up-badge ${merchant.followUp.followUpStatus}`}>
                        {getFollowUpStatusLabel(merchant.followUp.followUpStatus)}
                      </span>
                      <small className="follow-up-meta">
                        {merchant.followUp.hasLastContact
                          ? `${merchant.followUp.lastContactAtLabel} via ${getFollowUpChannelLabel(merchant.followUp.lastContactChannel)}`
                          : "Aucune relance renseignee"}
                      </small>
                    </div>
                    <div className="games-cell merchant-metric-cell" data-label="Clics">
                      <strong>{formatCount(merchant.clicksCount)}</strong>
                    </div>
                    <div className="games-cell merchant-metric-cell" data-label="Participations">
                      <strong>{formatCount(merchant.participationsCount)}</strong>
                    </div>
                    <div className="games-cell merchant-metric-cell" data-label="Followers">
                      <strong>{formatCount(merchant.followersCount)}</strong>
                    </div>
                    <div className="games-cell merchant-actions-cell" data-label="Actions">
                      <div className="games-row-actions merchants-row-actions">
                        {relaunchLink ? (
                          <button
                            className="row-link-button secondary"
                            type="button"
                            disabled={bulkEmailLoading || pendingRelaunchId === merchant.id}
                            onClick={() => handleMerchantRelaunch(merchant)}
                          >
                            {pendingRelaunchId === merchant.id ? "Mise a jour..." : "Relancer"}
                          </button>
                        ) : (
                          <button
                            className="row-link-button secondary row-link-button-disabled"
                            type="button"
                            disabled
                          >
                            Relancer
                          </button>
                        )}
                        <Link className="row-link-button" href={`/admin/commercants/${merchant.id}`}>
                          Voir
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
