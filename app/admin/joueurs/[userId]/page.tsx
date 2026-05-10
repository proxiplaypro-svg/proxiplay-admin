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

type EditFormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  accountStatus: string;
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
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditFormState>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    city: "",
    accountStatus: "",
  });
  const [editSaving, setEditSaving] = useState(false);

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
        setEditForm({
          firstName: details.fullName.split(" ")[0] ?? "",
          lastName: details.fullName.split(" ").slice(1).join(" ") ?? "",
          email: details.email === "Non renseigne" ? "" : details.email,
          phone: details.phone === "Non renseigne" ? "" : details.phone,
          city: details.city === "Non renseignee" ? "" : details.city,
          accountStatus: details.accountStatus === "Non renseigne" ? "" : details.accountStatus,
        });
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

  const handleDelete = async () => {
    if (!player) return;
    setDeleting(true);
    try {
      const { doc, deleteDoc } = await import("firebase/firestore");
      const { db } = await import("@/lib/firebase/client-app");
      await deleteDoc(doc(db, "users", player.id));
      window.location.href = "/admin/joueurs";
    } catch (err) {
      console.error(err);
      setFeedback("Impossible de supprimer ce joueur.");
      setDeleting(false);
      setDeleteConfirm(false);
    }
  };

  const handleEditSave = async () => {
    if (!player) return;
    setEditSaving(true);
    try {
      const { doc, updateDoc } = await import("firebase/firestore");
      const { db } = await import("@/lib/firebase/client-app");
      await updateDoc(doc(db, "users", player.id), {
        first_name: editForm.firstName.trim() || null,
        last_name: editForm.lastName.trim() || null,
        email: editForm.email.trim() || null,
        phone_number: editForm.phone.trim() || null,
        city: editForm.city.trim() || null,
        account_status: editForm.accountStatus.trim() || null,
      });
      const nextFullName = [editForm.firstName.trim(), editForm.lastName.trim()]
        .filter(Boolean)
        .join(" ");
      setPlayer((current) =>
        current
          ? {
              ...current,
              fullName: nextFullName || "Non renseigne",
              email: editForm.email.trim() || "Non renseigne",
              phone: editForm.phone.trim() || "Non renseigne",
              city: editForm.city.trim() || "Non renseignee",
              accountStatus: editForm.accountStatus.trim() || "Non renseigne",
            }
          : current,
      );
      setFeedback("Profil joueur mis a jour.");
      setEditOpen(false);
    } catch (err) {
      console.error(err);
      setFeedback("Impossible de modifier ce joueur.");
    } finally {
      setEditSaving(false);
    }
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
    <>
      <section className="space-y-4 bg-[#F7F7F5] text-[#1A1A1A]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-[22px] font-medium tracking-[-0.02em] text-[#1A1A1A]">{getPlayerLabel(player)}</h1>
            <p className="mt-1 text-[13px] text-[#666666]">Fiche joueur · suivi, contact et actions support</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/admin/joueurs" className="rounded-[8px] border border-[#E0E0DA] bg-white px-4 py-[10px] text-[12px] text-[#1A1A1A] transition hover:bg-[#FAFAF8]">
              ← Retour liste
            </Link>
            <button type="button" onClick={() => { setEditOpen(true); }} className="rounded-[8px] border border-[#E0E0DA] bg-white px-4 py-[10px] text-[12px] text-[#1A1A1A] transition hover:bg-[#FAFAF8]">
              Modifier
            </button>
            {!relaunchAction.disabled && relaunchAction.href ? (
              <button type="button" disabled={saving || marking || relaunching} onClick={() => void handlePlayerRelaunch()} className="rounded-[8px] border border-[#639922] bg-[#639922] px-4 py-[10px] text-[12px] font-medium text-white transition hover:bg-[#57881D]">
                {relaunching ? "Mise à jour..." : "Contacter"}
              </button>
            ) : null}
            {!deleteConfirm ? (
              <button type="button" onClick={() => setDeleteConfirm(true)} className="rounded-[8px] border border-[#F09595] bg-white px-4 py-[10px] text-[12px] font-medium text-[#A32D2D] transition hover:bg-[#FCEBEB]">
                Supprimer
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-[#A32D2D]">Confirmer ?</span>
                <button type="button" disabled={deleting} onClick={() => void handleDelete()} className="rounded-[8px] bg-[#E24B4A] px-4 py-[10px] text-[12px] font-medium text-white">
                  {deleting ? "Suppression..." : "Oui, supprimer"}
                </button>
                <button type="button" onClick={() => setDeleteConfirm(false)} className="rounded-[8px] border border-[#E8E8E4] bg-white px-4 py-[10px] text-[12px] text-[#666666]">
                  Annuler
                </button>
              </div>
            )}
          </div>
        </div>

        {feedback ? (
          <div className="rounded-[10px] border border-[#C0DD97] bg-[#EAF3DE] px-4 py-3 text-[12px] text-[#3B6D11]">{feedback}</div>
        ) : null}

        <div className="grid gap-3 rounded-[12px] border border-[#E8E8E4] bg-white p-5 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Pseudo", value: player.pseudo },
            { label: "Email", value: player.email },
            { label: "Téléphone", value: player.phone },
            { label: "Ville", value: player.city },
            { label: "Push", value: player.pushStatus === "actif" ? "✓ Push actif" : "✗ Push inconnu" },
            { label: "Statut compte", value: player.accountStatus },
            { label: "Rôle", value: player.userRole },
            { label: "Créé le", value: player.createdAtLabel },
            { label: "Dernière activité", value: player.lastRealActivityLabel },
          ].map((item) => (
            <article key={item.label} className="rounded-[10px] border border-[#E8E8E4] bg-[#F7F7F5] px-4 py-3">
              <p className="text-[11px] text-[#999999]">{item.label}</p>
              <strong className={`mt-1 block text-[13px] font-medium ${item.label === "Push" ? (player.pushStatus === "actif" ? "text-[#3B6D11]" : "text-[#999999]") : "text-[#1A1A1A]"}`}>
                {item.value}
              </strong>
            </article>
          ))}
        </div>

        <div className="rounded-[12px] border border-[#E8E8E4] bg-white p-5">
          <h2 className="mb-4 text-[15px] font-medium text-[#1A1A1A]">Performance</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Assiduité", value: player.assiduityLabel, accent: "#639922" },
              { label: "Parties jouées", value: player.gamesPlayedCount !== null ? String(player.gamesPlayedCount) : "Non renseigné", accent: "#378ADD" },
              { label: "Gains", value: player.winsCount !== null ? String(player.winsCount) : "Non renseigné", accent: "#639922" },
            ].map((item) => (
              <article key={item.label} className="overflow-hidden rounded-[10px] border border-[#E8E8E4] bg-white">
                <div className="h-[3px]" style={{ backgroundColor: item.accent }} />
                <div className="px-4 py-3">
                  <p className="text-[11px] text-[#999999]">{item.label}</p>
                  <strong className="mt-1 block text-[18px] font-medium text-[#1A1A1A]">{item.value}</strong>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="rounded-[12px] border border-[#E8E8E4] bg-white p-5">
          <h2 className="mb-4 text-[15px] font-medium text-[#1A1A1A]">Suivi de contact</h2>
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            {[
              { label: "Dernière relance", value: player.followUp.lastContactAtLabel },
              { label: "Canal", value: getFollowUpChannelLabel(player.followUp.lastContactChannel) },
              { label: "Statut", value: getFollowUpStatusLabel(player.followUp.followUpStatus) },
            ].map((item) => (
              <article key={item.label} className="rounded-[10px] border border-[#E8E8E4] bg-[#F7F7F5] px-4 py-3">
                <p className="text-[11px] text-[#999999]">{item.label}</p>
                <strong className="mt-1 block text-[13px] font-medium text-[#1A1A1A]">{item.value}</strong>
              </article>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-[#666666]">Canal</span>
              <select value={followUpForm.lastContactChannel} onChange={(e) => handleFollowUpFormChange("lastContactChannel", e.target.value as AdminFollowUpChannel)} className="h-[40px] rounded-[8px] border border-[#E8E8E4] bg-[#F7F7F5] px-3 text-[12.5px] text-[#1A1A1A] outline-none">
                <option value="email">Email</option>
                <option value="phone">Téléphone</option>
                <option value="manual">Manuel</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-[#666666]">Statut</span>
              <select value={followUpForm.followUpStatus} onChange={(e) => handleFollowUpFormChange("followUpStatus", e.target.value as AdminFollowUpStatus)} className="h-[40px] rounded-[8px] border border-[#E8E8E4] bg-[#F7F7F5] px-3 text-[12.5px] text-[#1A1A1A] outline-none">
                <option value="a_faire">À faire</option>
                <option value="relance">Relancé</option>
                <option value="sans_reponse">Sans réponse</option>
                <option value="ok">OK</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-[#666666]">Date de contact</span>
              <input type="datetime-local" value={followUpForm.lastContactAt} onChange={(e) => handleFollowUpFormChange("lastContactAt", e.target.value)} className="h-[40px] rounded-[8px] border border-[#E8E8E4] bg-[#F7F7F5] px-3 text-[12.5px] text-[#1A1A1A] outline-none" />
            </label>
          </div>
          <label className="mt-3 flex flex-col gap-1">
            <span className="text-[11px] font-medium text-[#666666]">Note</span>
            <textarea rows={3} maxLength={280} value={followUpForm.followUpNote} onChange={(e) => handleFollowUpFormChange("followUpNote", e.target.value)} placeholder="Ex: email envoyé, rappel demain, préfère téléphone." className="resize-none rounded-[8px] border border-[#E8E8E4] bg-[#F7F7F5] px-3 py-2 text-[12.5px] text-[#1A1A1A] outline-none" />
          </label>
          <div className="mt-4 flex gap-2">
            <button type="button" disabled={saving || marking} onClick={() => void handleMarkAsContacted()} className="rounded-[8px] bg-[#639922] px-4 py-[10px] text-[12px] font-medium text-white transition hover:bg-[#57881D] disabled:opacity-50">
              {marking ? "Mise à jour..." : "Marquer comme contacté"}
            </button>
            <button type="button" disabled={saving || marking} onClick={() => void handleFollowUpSave()} className="rounded-[8px] border border-[#E8E8E4] bg-white px-4 py-[10px] text-[12px] text-[#666666] transition hover:bg-[#FAFAF8] disabled:opacity-50">
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </div>
      </section>

      {editOpen ? (
        <div className="game-edit-modal-overlay" role="presentation" onClick={() => !editSaving && setEditOpen(false)}>
          <div
            className="game-edit-modal max-w-[640px] bg-[linear-gradient(180deg,rgba(12,21,37,0.98),rgba(9,17,29,0.96))] text-[var(--foreground)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="player-edit-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="game-edit-modal-header border-b border-[rgba(159,177,199,0.1)]">
              <div>
                <h2 id="player-edit-title" className="text-[1.55rem] text-[var(--foreground)]">
                  Modifier le joueur
                </h2>
                <p className="mt-2 text-[0.95rem] text-[var(--muted)]">
                  Mets a jour les informations de contact et de compte.
                </p>
              </div>
              <button
                type="button"
                className="game-edit-modal-close text-[var(--muted)] hover:text-[var(--foreground)]"
                onClick={() => !editSaving && setEditOpen(false)}
                aria-label="Fermer la modale"
              >
                x
              </button>
            </div>

            <div className="game-edit-modal-body grid gap-6">
              <section className="rounded-[10px] border border-[rgba(159,177,199,0.12)] p-4">
                <h3 className="mb-4 text-[0.95rem] font-medium text-[var(--foreground)]">Informations joueur</h3>
                <div className="grid gap-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <label className="text-[0.9rem] font-medium text-[var(--muted)]">Prenom</label>
                      <input
                        className="w-full rounded-[14px] border border-[rgba(159,177,199,0.12)] bg-[rgba(255,255,255,0.04)] px-4 py-3 text-[0.96rem] text-[var(--foreground)] outline-none transition focus:border-[rgba(99,153,34,0.32)]"
                        value={editForm.firstName}
                        onChange={(event) => setEditForm((current) => ({ ...current, firstName: event.target.value }))}
                      />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-[0.9rem] font-medium text-[var(--muted)]">Nom</label>
                      <input
                        className="w-full rounded-[14px] border border-[rgba(159,177,199,0.12)] bg-[rgba(255,255,255,0.04)] px-4 py-3 text-[0.96rem] text-[var(--foreground)] outline-none transition focus:border-[rgba(99,153,34,0.32)]"
                        value={editForm.lastName}
                        onChange={(event) => setEditForm((current) => ({ ...current, lastName: event.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <label className="text-[0.9rem] font-medium text-[var(--muted)]">Email</label>
                      <input
                        className="w-full rounded-[14px] border border-[rgba(159,177,199,0.12)] bg-[rgba(255,255,255,0.04)] px-4 py-3 text-[0.96rem] text-[var(--foreground)] outline-none transition focus:border-[rgba(99,153,34,0.32)]"
                        type="email"
                        value={editForm.email}
                        onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))}
                      />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-[0.9rem] font-medium text-[var(--muted)]">Telephone</label>
                      <input
                        className="w-full rounded-[14px] border border-[rgba(159,177,199,0.12)] bg-[rgba(255,255,255,0.04)] px-4 py-3 text-[0.96rem] text-[var(--foreground)] outline-none transition focus:border-[rgba(99,153,34,0.32)]"
                        value={editForm.phone}
                        onChange={(event) => setEditForm((current) => ({ ...current, phone: event.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <label className="text-[0.9rem] font-medium text-[var(--muted)]">Ville</label>
                      <input
                        className="w-full rounded-[14px] border border-[rgba(159,177,199,0.12)] bg-[rgba(255,255,255,0.04)] px-4 py-3 text-[0.96rem] text-[var(--foreground)] outline-none transition focus:border-[rgba(99,153,34,0.32)]"
                        value={editForm.city}
                        onChange={(event) => setEditForm((current) => ({ ...current, city: event.target.value }))}
                      />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-[0.9rem] font-medium text-[var(--muted)]">Statut compte</label>
                      <input
                        className="w-full rounded-[14px] border border-[rgba(159,177,199,0.12)] bg-[rgba(255,255,255,0.04)] px-4 py-3 text-[0.96rem] text-[var(--foreground)] outline-none transition focus:border-[rgba(99,153,34,0.32)]"
                        value={editForm.accountStatus}
                        onChange={(event) => setEditForm((current) => ({ ...current, accountStatus: event.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <div className="game-edit-modal-footer border-t border-[rgba(159,177,199,0.1)]">
              <button
                type="button"
                className="secondary-button inline-secondary-button w-auto min-w-[140px]"
                onClick={() => setEditOpen(false)}
                disabled={editSaving}
              >
                Annuler
              </button>
              <button
                type="button"
                className="primary-button min-w-[160px]"
                disabled={editSaving}
                onClick={() => void handleEditSave()}
                style={{ background: "linear-gradient(135deg, #639922 0%, #7CB32B 100%)", boxShadow: "0 16px 32px rgba(99,153,34,0.28)" }}
              >
                {editSaving ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
