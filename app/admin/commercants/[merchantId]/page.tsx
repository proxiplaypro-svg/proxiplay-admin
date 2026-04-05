"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getAdminFollowUpErrorMessage,
  markMerchantAsContactedAction,
  updateMerchantFollowUpAction,
} from "@/lib/firebase/adminActions";
import {
  getMerchantDetails,
  type AdminFollowUpChannel,
  type AdminFollowUpStatus,
  type AdminMerchantDetails,
} from "@/lib/firebase/adminQueries";

type MerchantDetailsPageProps = {
  params: Promise<{
    merchantId: string;
  }>;
};

type FollowUpFormState = {
  lastContactChannel: AdminFollowUpChannel;
  followUpStatus: AdminFollowUpStatus;
  followUpNote: string;
  lastContactAt: string;
};

function formatCount(value: number) {
  return new Intl.NumberFormat("fr-FR").format(value);
}

function getStatusLabel(status: AdminMerchantDetails["status"]) {
  switch (status) {
    case "actif":
      return "Actif";
    case "a_relancer":
      return "A relancer";
    default:
      return "Inactif";
  }
}

function getMerchantRelaunchLink(merchant: AdminMerchantDetails) {
  const normalizedEmail = merchant.email.trim();
  const normalizedPhone = merchant.phone.trim();

  if (normalizedEmail.length === 0) {
    if (normalizedPhone.length === 0) {
      return null;
    }

    return `tel:${normalizedPhone}`;
  }

  const subject = encodeURIComponent("ProxiPlay - point sur vos jeux");
  const body = encodeURIComponent(
    `Bonjour ${merchant.name},\n\nJe reviens vers vous pour faire un point rapide sur vos jeux ProxiPlay et vos resultats recents.\n\nDites-moi si vous souhaitez que nous regardions cela ensemble.\n\nBien a vous,\nL equipe ProxiPlay`,
  );

  return `mailto:${normalizedEmail}?subject=${subject}&body=${body}`;
}

function getFollowUpStatusLabel(status: AdminFollowUpStatus) {
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

function getFollowUpChannelLabel(channel: AdminFollowUpChannel) {
  switch (channel) {
    case "email":
      return "Email";
    case "phone":
      return "Telephone";
    case "manual":
      return "Manuel";
    default:
      return "Inconnu";
  }
}

function toDateTimeLocalValue(timestampValue: number) {
  if (timestampValue <= 0) {
    return "";
  }

  const date = new Date(timestampValue);
  const timezoneOffset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

function getDefaultChannel(merchant: AdminMerchantDetails) {
  if (merchant.followUp.lastContactChannel !== "unknown") {
    return merchant.followUp.lastContactChannel;
  }

  if (merchant.email.trim().length > 0) {
    return "email";
  }

  if (merchant.phone.trim().length > 0) {
    return "phone";
  }

  return "manual";
}

function buildFollowUpFormState(merchant: AdminMerchantDetails): FollowUpFormState {
  return {
    lastContactChannel: getDefaultChannel(merchant),
    followUpStatus: merchant.followUp.followUpStatus,
    followUpNote: merchant.followUp.followUpNote,
    lastContactAt: toDateTimeLocalValue(merchant.followUp.lastContactAtValue),
  };
}

function formatFollowUpLabel(lastContactAt: string) {
  if (!lastContactAt) {
    return "Jamais relance";
  }

  const parsedDate = new Date(lastContactAt);

  if (Number.isNaN(parsedDate.getTime())) {
    return "Jamais relance";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsedDate);
}

function applyFollowUpToMerchant(
  merchant: AdminMerchantDetails,
  formState: FollowUpFormState,
  lastContactAt: string,
  followUpStatus: AdminFollowUpStatus,
) {
  const parsedDate = lastContactAt ? new Date(lastContactAt) : null;

  return {
    ...merchant,
    followUp: {
      lastContactAtLabel: formatFollowUpLabel(lastContactAt),
      lastContactAtValue: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.getTime() : 0,
      lastContactChannel: formState.lastContactChannel,
      followUpStatus,
      followUpNote: formState.followUpNote.trim(),
      hasLastContact: Boolean(lastContactAt),
    },
  };
}

export default function MerchantDetailsPage({ params }: MerchantDetailsPageProps) {
  const [merchant, setMerchant] = useState<AdminMerchantDetails | null>(null);
  const [followUpForm, setFollowUpForm] = useState<FollowUpFormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [marking, setMarking] = useState(false);
  const [relaunching, setRelaunching] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    const loadMerchant = async () => {
      setLoading(true);
      setError(null);

      try {
        const resolvedParams = await params;
        const details = await getMerchantDetails(resolvedParams.merchantId);

        if (!isCancelled) {
          if (!details) {
            setError("Commercant introuvable.");
            setMerchant(null);
            setFollowUpForm(null);
          } else {
            setMerchant(details);
            setFollowUpForm(buildFollowUpFormState(details));
          }
        }
      } catch (loadError) {
        console.error(loadError);
        if (!isCancelled) {
          setError("Impossible de charger la fiche commercant.");
          setMerchant(null);
          setFollowUpForm(null);
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    void loadMerchant();

    return () => {
      isCancelled = true;
    };
  }, [params]);

  const relaunchLink = useMemo(
    () => (merchant ? getMerchantRelaunchLink(merchant) : null),
    [merchant],
  );

  const handleFollowUpFormChange = <K extends keyof FollowUpFormState>(
    key: K,
    value: FollowUpFormState[K],
  ) => {
    setFollowUpForm((current) => (current ? { ...current, [key]: value } : current));
  };

  const handleFollowUpSave = async () => {
    if (!merchant || !followUpForm) {
      return;
    }

    setSaving(true);
    setFeedback(null);

    try {
      await updateMerchantFollowUpAction({
        merchantId: merchant.id,
        lastContactChannel: followUpForm.lastContactChannel,
        followUpStatus: followUpForm.followUpStatus,
        followUpNote: followUpForm.followUpNote,
        lastContactAt: followUpForm.lastContactAt || null,
      });

      setMerchant((current) =>
        current
          ? applyFollowUpToMerchant(
              current,
              followUpForm,
              followUpForm.lastContactAt,
              followUpForm.followUpStatus,
            )
          : current,
      );
      setFeedback("Suivi de relance commercant enregistre.");
    } catch (actionError) {
      console.error(actionError);
      setFeedback(getAdminFollowUpErrorMessage(actionError));
    } finally {
      setSaving(false);
    }
  };

  const handleMarkAsContacted = async () => {
    if (!merchant || !followUpForm) {
      return;
    }

    setMarking(true);
    setFeedback(null);

    const nowValue = toDateTimeLocalValue(Date.now());

    try {
      await markMerchantAsContactedAction({
        merchantId: merchant.id,
        lastContactChannel: followUpForm.lastContactChannel,
        followUpNote: followUpForm.followUpNote,
      });

      const nextFormState = {
        ...followUpForm,
        followUpStatus: "relance" as const,
        lastContactAt: nowValue,
      };

      setFollowUpForm(nextFormState);
      setMerchant((current) =>
        current
          ? applyFollowUpToMerchant(current, nextFormState, nowValue, "relance")
          : current,
      );
      setFeedback("Commercant marque comme relance.");
    } catch (actionError) {
      console.error(actionError);
      setFeedback(getAdminFollowUpErrorMessage(actionError));
    } finally {
      setMarking(false);
    }
  };

  const handleMerchantRelaunch = async () => {
    if (!merchant || !followUpForm || !relaunchLink) {
      return;
    }

    const channel = relaunchLink.startsWith("mailto:") ? "email" : "phone";

    setRelaunching(true);
    setFeedback(null);

    try {
      await markMerchantAsContactedAction({
        merchantId: merchant.id,
        lastContactChannel: channel,
        followUpNote: followUpForm.followUpNote,
      });

    const nowValue = toDateTimeLocalValue(Date.now());
      const nextFormState: FollowUpFormState = {
        ...followUpForm,
        lastContactChannel: channel,
        followUpStatus: "relance" as const,
        lastContactAt: nowValue,
      };

      setFollowUpForm(nextFormState);
      setMerchant((current) =>
        current
          ? applyFollowUpToMerchant(current, nextFormState, nowValue, "relance")
          : current,
      );

      window.location.href = relaunchLink;
      setFeedback(`Relance commercant preparee et suivi mis a jour via ${channel === "email" ? "email" : "telephone"}.`);
    } catch (actionError) {
      console.error(actionError);
      setFeedback(getAdminFollowUpErrorMessage(actionError));
    } finally {
      setRelaunching(false);
    }
  };

  if (loading) {
    return (
      <section className="content-grid">
        <div className="panel panel-wide">
          <div className="game-details-skeleton">
            <span className="skeleton-line skeleton-label" />
            <strong className="skeleton-line skeleton-value" />
            <div className="dashboard-kpi-grid">
              {Array.from({ length: 4 }).map((_, index) => (
                <article key={index} className="dashboard-kpi-card skeleton-card">
                  <span className="skeleton-line skeleton-label" />
                  <strong className="skeleton-line skeleton-value" />
                  <small className="skeleton-line skeleton-helper" />
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (error || !merchant || !followUpForm) {
    return (
      <section className="content-grid">
        <div className="panel panel-wide">
          <div className="empty-state">
            <strong>{error ?? "Commercant introuvable"}</strong>
            <p>Retourne a la liste pour selectionner une enseigne valide.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="content-grid">
      <div className="panel panel-wide merchant-commercial-panel">
        <div className="panel-heading merchant-commercial-heading">
          <div>
            <h2>{merchant.name}</h2>
            <p>Fiche de suivi commercial de l enseigne et de ses relances prioritaires.</p>
          </div>
          <div className="merchant-crm-status">
            <span className={`merchant-badge ${merchant.status}`}>{getStatusLabel(merchant.status)}</span>
            <span className={`follow-up-badge ${merchant.followUp.followUpStatus}`}>
              {getFollowUpStatusLabel(merchant.followUp.followUpStatus)}
            </span>
            <span className="status-pill neutral">{merchant.city || "Ville non renseignee"}</span>
          </div>
        </div>

        <div className="merchant-details-grid merchant-commercial-summary-grid">
          <article className="overview-card">
            <span>Ville</span>
            <strong>{merchant.city || "Non renseignee"}</strong>
          </article>
          <article className="overview-card">
            <span>Prenom / Nom</span>
            <strong>{merchant.hasOwnerUserRef ? merchant.ownerUserFullName : "Aucun user rattache"}</strong>
          </article>
          <article className="overview-card merchant-contact-summary-card merchant-contact-summary-card-wide">
            <span>Email prioritaire</span>
            <strong>{merchant.email || "Aucun email"}</strong>
          </article>
          <article className="overview-card merchant-contact-summary-card">
            <span>Telephone</span>
            <strong>{merchant.phone || "Aucun telephone"}</strong>
          </article>
          <article className="overview-card">
            <span>User correspondant</span>
            <strong>{merchant.ownerUserId ?? "Aucun user rattache"}</strong>
          </article>
        </div>
      </div>

      <div className="panel panel-wide merchant-commercial-panel">
        <div className="panel-heading">
          <h2>Suivi de relance</h2>
          <p>V1 minimaliste du suivi commercial, sans historique ni CRM lourd.</p>
        </div>

        <div className="follow-up-summary-grid">
          <article className="overview-card">
            <span>Derniere relance</span>
            <strong>{merchant.followUp.lastContactAtLabel}</strong>
          </article>
          <article className="overview-card">
            <span>Canal</span>
            <strong>{getFollowUpChannelLabel(merchant.followUp.lastContactChannel)}</strong>
          </article>
          <article className="overview-card">
            <span>Statut de suivi</span>
            <strong>{getFollowUpStatusLabel(merchant.followUp.followUpStatus)}</strong>
          </article>
        </div>

        <div className="follow-up-form-grid">
          <label className="search-field">
            <span className="search-label">Canal</span>
            <select
              className="search-input"
              value={followUpForm.lastContactChannel}
              onChange={(event) =>
                handleFollowUpFormChange(
                  "lastContactChannel",
                  event.target.value as AdminFollowUpChannel,
                )
              }
            >
              <option value="email">Email</option>
              <option value="phone">Telephone</option>
              <option value="manual">Manual</option>
              <option value="unknown">Unknown</option>
            </select>
          </label>

          <label className="search-field">
            <span className="search-label">Statut</span>
            <select
              className="search-input"
              value={followUpForm.followUpStatus}
              onChange={(event) =>
                handleFollowUpFormChange("followUpStatus", event.target.value as AdminFollowUpStatus)
              }
            >
              <option value="a_faire">A faire</option>
              <option value="relance">Relance</option>
              <option value="sans_reponse">Sans reponse</option>
              <option value="ok">OK</option>
            </select>
          </label>

          <label className="search-field">
            <span className="search-label">Date de relance</span>
            <input
              className="search-input"
              type="datetime-local"
              value={followUpForm.lastContactAt}
              onChange={(event) => handleFollowUpFormChange("lastContactAt", event.target.value)}
            />
          </label>

          <label className="search-field follow-up-note-field">
            <span className="search-label">Note courte</span>
            <textarea
              className="follow-up-textarea"
              rows={3}
              maxLength={280}
              value={followUpForm.followUpNote}
              onChange={(event) => handleFollowUpFormChange("followUpNote", event.target.value)}
              placeholder="Ex: relance envoyee, rappel lundi, prefere email."
            />
          </label>
        </div>

        <div className="follow-up-actions">
          <button
            className="primary-button"
            type="button"
            disabled={saving || marking}
            onClick={() => void handleMarkAsContacted()}
          >
            {marking ? "Mise a jour..." : "Marquer comme relance"}
          </button>
          <button
            className="secondary-button inline-secondary-button"
            type="button"
            disabled={saving || marking}
            onClick={() => void handleFollowUpSave()}
          >
            {saving ? "Enregistrement..." : "Enregistrer le suivi"}
          </button>
        </div>

        {feedback ? <p className="feedback">{feedback}</p> : null}
      </div>

      <div className="panel panel-wide merchant-commercial-panel">
        <div className="panel-heading">
          <h2>Performance</h2>
          <p>Lecture commerciale simple des indicateurs deja visibles dans la liste commercants.</p>
        </div>

        <div className="dashboard-kpi-grid merchant-commercial-kpis">
          <article className="dashboard-kpi-card featured">
            <span>Clics</span>
            <strong>{formatCount(merchant.clicksCount)}</strong>
            <small>Interet mesure sur les jeux lies</small>
          </article>
          <article className="dashboard-kpi-card neutral">
            <span>Participations</span>
            <strong>{formatCount(merchant.participationsCount)}</strong>
            <small>Volume actuel des interactions</small>
          </article>
          <article className="dashboard-kpi-card neutral">
            <span>Followers</span>
            <strong>{formatCount(merchant.followersCount)}</strong>
            <small>Audience disponible</small>
          </article>
          <article className="dashboard-kpi-card neutral">
            <span>Jeux lies</span>
            <strong>{formatCount(merchant.gamesCount)}</strong>
            <small>{merchant.lastGameLabel}</small>
          </article>
        </div>
      </div>

      <div className="panel panel-wide merchant-commercial-panel">
        <div className="panel-heading">
          <h2>Actions</h2>
          <p>Actions commerciales rapides et navigation utile sans basculer vers une vue technique.</p>
        </div>

        <div className="merchant-commercial-actions-shell">
          <div className="merchant-actions merchant-commercial-actions">
            {relaunchLink ? (
              <button
                className="primary-button"
                type="button"
                disabled={saving || marking || relaunching}
                onClick={() => void handleMerchantRelaunch()}
              >
                {relaunching ? "Mise a jour..." : "Relancer"}
              </button>
            ) : (
              <button className="primary-button" type="button" disabled>
                Relancer
              </button>
            )}
            {merchant.games.length > 0 ? (
              <a className="secondary-button inline-secondary-button" href="#merchant-games">
                Voir les jeux lies
              </a>
            ) : (
              <button className="secondary-button inline-secondary-button" type="button" disabled>
                Aucun jeu lie
              </button>
            )}
            <Link className="row-link-button secondary" href="/admin/commercants">
              Retour a la liste
            </Link>
          </div>
        </div>

        <div className="merchant-commercial-games-block" id="merchant-games">
          <div className="merchant-commercial-games-header">
            <div>
              <h3>Jeux lies</h3>
              <p>Jeux rattaches a l enseigne avec date de fin et indicateurs utiles.</p>
            </div>
          </div>

          {merchant.games.length > 0 ? (
            <div className="merchant-commercial-games-preview">
              {merchant.games.slice(0, 4).map((game) => (
                <Link
                  key={game.id}
                  className="action-item merchant-commercial-game-link"
                  href={`/admin/games/${game.id}`}
                >
                  <div className="merchant-commercial-game-copy">
                    <strong>{game.name}</strong>
                    <p>Fin : {game.endDateLabel}</p>
                    <small>
                      {formatCount(game.clicksCount)} clics | {formatCount(game.participationsCount)} participations
                    </small>
                  </div>
                  <span className={`game-badge ${game.status}`}>
                    {game.status === "actif" ? "Actif" : game.status === "termine" ? "Termine" : "A venir"}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty-state compact-empty-state">
              <strong>Aucun jeu lie</strong>
              <p>Cette enseigne n a pas encore de jeu rattache a afficher.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
