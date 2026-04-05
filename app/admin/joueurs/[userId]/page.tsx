"use client";

import { FirebaseError } from "firebase/app";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getAdminFollowUpErrorMessage,
  markPlayerAsContactedAction,
  updatePlayerFollowUpAction,
} from "@/lib/firebase/adminActions";
import {
  getPlayerDetails,
  type AdminFollowUpChannel,
  type AdminFollowUpStatus,
  type AdminPlayerDetails,
} from "@/lib/firebase/adminQueries";

type PlayerDetailsPageProps = {
  params: Promise<{
    userId: string;
  }>;
};

type FollowUpFormState = {
  lastContactChannel: AdminFollowUpChannel;
  followUpStatus: AdminFollowUpStatus;
  followUpNote: string;
  lastContactAt: string;
};

function getPlayerDetailsErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "permission-denied":
        return "Acces admin requis pour lire la fiche joueur.";
      case "unavailable":
        return "Firestore est temporairement indisponible. Reessaie dans un instant.";
      default:
        return "Impossible de charger la fiche joueur pour le moment.";
    }
  }

  return "Impossible de charger la fiche joueur pour le moment.";
}

function getPlayerLabel(player: AdminPlayerDetails) {
  if (player.fullName !== "Non renseigne") {
    return player.fullName;
  }

  if (player.email !== "Non renseigne") {
    return player.email;
  }

  if (player.pseudo !== "Non renseigne") {
    return player.pseudo;
  }

  return "Joueur";
}

function getPlayerRelaunchAction(player: AdminPlayerDetails) {
  if (player.email !== "Non renseigne") {
    return {
      href: `mailto:${encodeURIComponent(player.email)}?subject=${encodeURIComponent(`Relance ProxiPlay - ${getPlayerLabel(player)}`)}`,
      label: "Relancer par email",
      disabled: false,
    };
  }

  if (player.phone !== "Non renseigne") {
    return {
      href: `tel:${player.phone}`,
      label: "Relancer par telephone",
      disabled: false,
    };
  }

  return {
    href: null,
    label: "Aucun contact disponible",
    disabled: true,
  };
}

function getPushStatusLabel(pushStatus: AdminPlayerDetails["pushStatus"]) {
  return pushStatus === "actif" ? "Push actif" : "Push inconnu";
}

function formatOptionalCount(value: number | null) {
  if (value === null) {
    return "Non renseigne";
  }

  return new Intl.NumberFormat("fr-FR").format(value);
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

function getDefaultChannel(player: AdminPlayerDetails) {
  if (player.followUp.lastContactChannel !== "unknown") {
    return player.followUp.lastContactChannel;
  }

  if (player.email !== "Non renseigne") {
    return "email";
  }

  if (player.phone !== "Non renseigne") {
    return "phone";
  }

  return "manual";
}

function buildFollowUpFormState(player: AdminPlayerDetails): FollowUpFormState {
  return {
    lastContactChannel: getDefaultChannel(player),
    followUpStatus: player.followUp.followUpStatus,
    followUpNote: player.followUp.followUpNote,
    lastContactAt: toDateTimeLocalValue(player.followUp.lastContactAtValue),
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

function applyFollowUpToPlayer(
  player: AdminPlayerDetails,
  formState: FollowUpFormState,
  lastContactAt: string,
  followUpStatus: AdminFollowUpStatus,
) {
  const parsedDate = lastContactAt ? new Date(lastContactAt) : null;

  return {
    ...player,
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

export default function PlayerDetailsPage({ params }: PlayerDetailsPageProps) {
  const [player, setPlayer] = useState<AdminPlayerDetails | null>(null);
  const [followUpForm, setFollowUpForm] = useState<FollowUpFormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [marking, setMarking] = useState(false);
  const [relaunching, setRelaunching] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    const loadPlayer = async () => {
      setLoading(true);
      setError(null);

      try {
        const resolvedParams = await params;
        const details = await getPlayerDetails(resolvedParams.userId);

        if (isCancelled) {
          return;
        }

        if (!details) {
          setPlayer(null);
          setFollowUpForm(null);
          setError("Joueur introuvable.");
          return;
        }

        setPlayer(details);
        setFollowUpForm(buildFollowUpFormState(details));
      } catch (loadError) {
        console.error(loadError);
        if (!isCancelled) {
          setPlayer(null);
          setFollowUpForm(null);
          setError(getPlayerDetailsErrorMessage(loadError));
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    void loadPlayer();

    return () => {
      isCancelled = true;
    };
  }, [params]);

  const handleFollowUpFormChange = <K extends keyof FollowUpFormState>(
    key: K,
    value: FollowUpFormState[K],
  ) => {
    setFollowUpForm((current) => (current ? { ...current, [key]: value } : current));
  };

  const handleFollowUpSave = async () => {
    if (!player || !followUpForm) {
      return;
    }

    setSaving(true);
    setFeedback(null);

    try {
      await updatePlayerFollowUpAction({
        userId: player.id,
        lastContactChannel: followUpForm.lastContactChannel,
        followUpStatus: followUpForm.followUpStatus,
        followUpNote: followUpForm.followUpNote,
        lastContactAt: followUpForm.lastContactAt || null,
      });

      setPlayer((current) =>
        current
          ? applyFollowUpToPlayer(
              current,
              followUpForm,
              followUpForm.lastContactAt,
              followUpForm.followUpStatus,
            )
          : current,
      );
      setFeedback("Suivi de relance joueur enregistre.");
    } catch (actionError) {
      console.error(actionError);
      setFeedback(getAdminFollowUpErrorMessage(actionError));
    } finally {
      setSaving(false);
    }
  };

  const handleMarkAsContacted = async () => {
    if (!player || !followUpForm) {
      return;
    }

    setMarking(true);
    setFeedback(null);

    const nowValue = toDateTimeLocalValue(Date.now());

    try {
      await markPlayerAsContactedAction({
        userId: player.id,
        lastContactChannel: followUpForm.lastContactChannel,
        followUpNote: followUpForm.followUpNote,
      });

      const nextFormState = {
        ...followUpForm,
        followUpStatus: "relance" as const,
        lastContactAt: nowValue,
      };

      setFollowUpForm(nextFormState);
      setPlayer((current) =>
        current
          ? applyFollowUpToPlayer(current, nextFormState, nowValue, "relance")
          : current,
      );
      setFeedback("Joueur marque comme relance.");
    } catch (actionError) {
      console.error(actionError);
      setFeedback(getAdminFollowUpErrorMessage(actionError));
    } finally {
      setMarking(false);
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

  if (error || !player || !followUpForm) {
    return (
      <section className="content-grid">
        <div className="panel panel-wide">
          <div className="empty-state">
            <strong>{error ?? "Joueur introuvable"}</strong>
            <p>Retourne a la liste des joueurs pour selectionner un joueur valide.</p>
          </div>
        </div>
      </section>
    );
  }

  const relaunchAction = getPlayerRelaunchAction(player);

  const handlePlayerRelaunch = async () => {
    if (!player || !followUpForm || relaunchAction.disabled || !relaunchAction.href) {
      return;
    }

    const channel = relaunchAction.href.startsWith("mailto:") ? "email" : "phone";

    setRelaunching(true);
    setFeedback(null);

    try {
      await markPlayerAsContactedAction({
        userId: player.id,
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
      setPlayer((current) =>
        current
          ? applyFollowUpToPlayer(current, nextFormState, nowValue, "relance")
          : current,
      );

      window.location.href = relaunchAction.href;
      setFeedback(`Relance joueur preparee et suivi mis a jour via ${channel === "email" ? "email" : "telephone"}.`);
    } catch (actionError) {
      console.error(actionError);
      setFeedback(getAdminFollowUpErrorMessage(actionError));
    } finally {
      setRelaunching(false);
    }
  };

  return (
    <section className="content-grid">
      <div className="panel panel-wide">
        <div className="panel-heading game-details-header">
          <div>
            <h2>{getPlayerLabel(player)}</h2>
            <p>Fiche admin joueur pour le suivi de l activite, des gains et des canaux de relance.</p>
          </div>

          <div className="game-details-header-actions">
            <span className={`follow-up-badge ${player.followUp.followUpStatus}`}>
              {getFollowUpStatusLabel(player.followUp.followUpStatus)}
            </span>
            <Link className="row-link-button secondary" href="/admin/joueurs">
              Retour liste
            </Link>
            {!relaunchAction.disabled && relaunchAction.href ? (
              <button
                className="row-link-button"
                type="button"
                disabled={saving || marking || relaunching}
                onClick={() => void handlePlayerRelaunch()}
              >
                {relaunching ? "Mise a jour..." : "Relancer"}
              </button>
            ) : (
              <button className="row-link-button secondary" type="button" disabled>
                {relaunchAction.label}
              </button>
            )}
          </div>
        </div>

        <div className="game-details-meta-grid">
          <article className="overview-card">
            <span>Pseudo</span>
            <strong>{player.pseudo}</strong>
          </article>
          <article className="overview-card">
            <span>Email</span>
            <strong>{player.email}</strong>
          </article>
          <article className="overview-card">
            <span>Telephone</span>
            <strong>{player.phone}</strong>
          </article>
          <article className="overview-card">
            <span>Ville</span>
            <strong>{player.city}</strong>
          </article>
          <article className="overview-card">
            <span>Push</span>
            <strong>{getPushStatusLabel(player.pushStatus)}</strong>
          </article>
        </div>
      </div>

      <div className="panel panel-wide">
        <div className="panel-heading">
          <h2>Suivi de relance</h2>
          <p>Bloc V1 simple pour suivre la derniere relance et la prochaine action utile.</p>
        </div>

        <div className="follow-up-summary-grid">
          <article className="overview-card">
            <span>Derniere relance</span>
            <strong>{player.followUp.lastContactAtLabel}</strong>
          </article>
          <article className="overview-card">
            <span>Canal</span>
            <strong>{getFollowUpChannelLabel(player.followUp.lastContactChannel)}</strong>
          </article>
          <article className="overview-card">
            <span>Statut de suivi</span>
            <strong>{getFollowUpStatusLabel(player.followUp.followUpStatus)}</strong>
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
              placeholder="Ex: relance email envoyee, rappel demain, prefere telephone."
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

      <div className="panel panel-wide">
        <div className="panel-heading">
          <h2>Performance</h2>
          <p>Lecture rapide des compteurs et de l assiduite deja disponibles sur le profil joueur.</p>
        </div>

        <div className="game-details-performance-grid">
          <article className="dashboard-kpi-card featured">
            <span>Assiduite</span>
            <strong>{player.assiduityLabel}</strong>
            <small>Derniere activite: {player.lastRealActivityLabel}</small>
          </article>
          <article className="dashboard-kpi-card neutral">
            <span>Parties realisees</span>
            <strong>{formatOptionalCount(player.gamesPlayedCount)}</strong>
            <small>Source: users.games_played_count</small>
          </article>
          <article className="dashboard-kpi-card neutral">
            <span>Gains</span>
            <strong>{formatOptionalCount(player.winsCount)}</strong>
            <small>Source: prizes.winner_id</small>
          </article>
          <article className="dashboard-kpi-card neutral">
            <span>Derniere fois jouee</span>
            <strong>{player.lastRealActivityLabel}</strong>
            <small>Source: users.last_real_activity_at</small>
          </article>
        </div>
      </div>

      <div className="panel panel-wide">
        <div className="panel-heading">
          <h2>Profil</h2>
          <p>Informations secondaires utiles en support admin sans surcharger la liste principale.</p>
        </div>

        <div className="overview-grid">
          <article className="overview-card">
            <span>Prenom / Nom</span>
            <strong>{player.fullName}</strong>
          </article>
          <article className="overview-card">
            <span>Role</span>
            <strong>{player.userRole}</strong>
          </article>
          <article className="overview-card">
            <span>Account status</span>
            <strong>{player.accountStatus}</strong>
          </article>
          <article className="overview-card">
            <span>Statut joueur cache</span>
            <strong>{player.playerStatusCached}</strong>
          </article>
          <article className="overview-card">
            <span>Creation du compte</span>
            <strong>{player.createdAtLabel}</strong>
          </article>
        </div>
      </div>
    </section>
  );
}
