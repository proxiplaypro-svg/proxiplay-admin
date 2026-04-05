"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getMerchantsTechnicalList,
  type AdminMerchantTechnicalListItem,
  type AdminMerchantTechnicalState,
} from "@/lib/firebase/adminQueries";
import {
  getResyncMerchantCountersErrorMessage,
  resyncMerchantCountersAction,
} from "@/lib/firebase/adminActions";

function formatCount(value: number) {
  return new Intl.NumberFormat("fr-FR").format(value);
}

function getTechnicalStateLabel(state: AdminMerchantTechnicalState) {
  switch (state) {
    case "ok":
      return "OK";
    case "a_resynchroniser":
      return "A resynchroniser";
    case "owner_manquant":
      return "Owner manquant";
    case "user_introuvable":
      return "User introuvable";
    default:
      return "Technique";
  }
}

export default function AdminTechnicalMerchantsPage() {
  const [merchants, setMerchants] = useState<AdminMerchantTechnicalListItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resyncingMerchantId, setResyncingMerchantId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const fetchMerchants = async () => {
    setLoading(true);
    setError(null);

    try {
      const items = await getMerchantsTechnicalList();
      setMerchants(items);
    } catch (fetchError) {
      console.error(fetchError);
      setError("Impossible de charger l audit technique des commercants.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isCancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);

      try {
        const items = await getMerchantsTechnicalList();
        if (!isCancelled) {
          setMerchants(items);
        }
      } catch (fetchError) {
        console.error(fetchError);
        if (!isCancelled) {
          setError("Impossible de charger l audit technique des commercants.");
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, []);

  const handleResyncMerchant = async (merchant: AdminMerchantTechnicalListItem) => {
    if (resyncingMerchantId) {
      return;
    }

    setActionFeedback(null);
    setResyncingMerchantId(merchant.id);

    try {
      await resyncMerchantCountersAction({ merchantId: merchant.id });
      setActionFeedback(`Compteurs resynchronises pour ${merchant.name}.`);
      await fetchMerchants();
    } catch (actionError) {
      console.error(actionError);
      setActionFeedback(getResyncMerchantCountersErrorMessage(actionError));
    } finally {
      setResyncingMerchantId(null);
    }
  };

  const filteredMerchants = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return merchants.filter((merchant) => {
      return (
        normalizedSearch.length === 0 ||
        merchant.name.toLowerCase().includes(normalizedSearch) ||
        merchant.ownerSummary.toLowerCase().includes(normalizedSearch) ||
        (merchant.ownerUserId ?? "").toLowerCase().includes(normalizedSearch)
      );
    });
  }, [merchants, search]);

  return (
    <section className="content-grid">
      <div className="panel panel-wide">
        <div className="panel-heading technical-panel-heading">
          <div>
            <span className="eyebrow">Vue Technique</span>
            <h2>Commercants Technique</h2>
            <p>
              Verite Firestore des enseignes, rattachements owner et compteurs reels par
              sous-collections.
            </p>
          </div>
          <div className="technical-header-actions">
            <Link className="row-link-button secondary" href="/admin/commercants">
              Vue commerciale
            </Link>
          </div>
        </div>

        <div className="overview-card technical-cost-note">
          <strong>Audit technique</strong>
          <span>
            Cette page relit les jeux, les participants et les prizes pour chaque enseigne.
            Les requetes sont plus couteuses que la vue commerciale et doivent rester un outil
            d audit ponctuel.
          </span>
        </div>

        <div className="games-toolbar">
          <label className="search-field">
            <span className="search-label">Recherche technique</span>
            <input
              className="search-input"
              type="search"
              placeholder="Rechercher par enseigne, owner ou user"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>

        {loading ? (
          <div className="games-loader">
            <div className="loader" aria-hidden="true" />
            <p>Chargement de la verite Firestore des commercants...</p>
          </div>
        ) : null}

        {!loading && error ? <p className="feedback error">{error}</p> : null}
        {!loading && !error && actionFeedback ? <p className="feedback">{actionFeedback}</p> : null}

        {!loading && !error && filteredMerchants.length === 0 ? (
          <div className="empty-state">
            <strong>Aucun commercant technique a afficher</strong>
            <p>Aucune enseigne ne correspond a la recherche technique.</p>
          </div>
        ) : null}

        {!loading && !error && filteredMerchants.length > 0 ? (
          <div className="games-admin-table">
            <div className="technical-merchants-header">
              <span>Enseigne</span>
              <span>Owner / User</span>
              <span>Jeux reels</span>
              <span>Participants reels</span>
              <span>Gagnants reels</span>
              <span>Derniere activite reelle</span>
              <span>Etat technique</span>
              <span>Action</span>
            </div>

            <div className="games-table-body">
              {filteredMerchants.map((merchant) => (
                <article key={merchant.id} className="technical-merchants-row">
                  <div className="games-cell" data-label="Enseigne">
                    <strong>{merchant.name}</strong>
                    <span>{merchant.id}</span>
                  </div>
                  <div className="games-cell" data-label="Owner / User">
                    <strong>{merchant.ownerUserId ?? "Aucun user exploitable"}</strong>
                    <small className="merchant-counter-hint">{merchant.ownerSummary}</small>
                  </div>
                  <div className="games-cell" data-label="Jeux reels">
                    <strong>{formatCount(merchant.gamesRealCount)}</strong>
                    <span>games where enseigne_id == enseigneRef</span>
                  </div>
                  <div className="games-cell" data-label="Participants reels">
                    <strong>{formatCount(merchant.participantsRealCount)}</strong>
                    <span>somme des docs participants</span>
                  </div>
                  <div className="games-cell" data-label="Gagnants reels">
                    <strong>{formatCount(merchant.winnersRealCount)}</strong>
                    <span>prizes lies a ces jeux</span>
                  </div>
                  <div className="games-cell" data-label="Derniere activite reelle">
                    <strong>{merchant.lastActivityRealLabel}</strong>
                    <span>participation_date puis created_time</span>
                  </div>
                  <div className="games-cell" data-label="Etat technique">
                    <span className={`technical-state-pill ${merchant.technicalState}`}>
                      {getTechnicalStateLabel(merchant.technicalState)}
                    </span>
                    {merchant.technicalNotes.length > 0 ? (
                      <small className="merchant-counter-hint">
                        {merchant.technicalNotes.join(" ")}
                      </small>
                    ) : null}
                  </div>
                  <div className="games-cell" data-label="Action">
                    <button
                      className="row-link-button secondary"
                      type="button"
                      disabled={resyncingMerchantId === merchant.id}
                      onClick={() => void handleResyncMerchant(merchant)}
                    >
                      {resyncingMerchantId === merchant.id ? "Resynchronisation..." : "Resynchroniser"}
                    </button>
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
