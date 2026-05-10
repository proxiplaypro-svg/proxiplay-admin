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
    <section className="space-y-4 bg-[#F7F7F5] text-[#1A1A1A]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-center gap-4">
          {merchant.imageUrl ? (
            <img
              src={merchant.imageUrl}
              alt={merchant.name}
              className="h-16 w-16 rounded-[10px] border border-[#E8E8E4] object-cover"
            />
          ) : null}
          <div>
            <h1 className="text-[22px] font-medium tracking-[-0.02em] text-[#1A1A1A]">{merchant.name}</h1>
            <p className="mt-1 text-[13px] text-[#666666]">Fiche commercant · {merchant.city}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/commercants" className="rounded-[8px] border border-[#E0E0DA] bg-white px-4 py-[10px] text-[12px] text-[#1A1A1A] transition hover:bg-[#FAFAF8]">
            ← Retour liste
          </Link>
          {relaunchLink ? (
            <button type="button" disabled={relaunching} onClick={() => void handleMerchantRelaunch()} className="rounded-[8px] border border-[#639922] bg-[#639922] px-4 py-[10px] text-[12px] font-medium text-white transition hover:bg-[#57881D]">
              {relaunching ? "Mise à jour..." : "Contacter"}
            </button>
          ) : null}
        </div>
      </div>

      {feedback ? (
        <div className="rounded-[10px] border border-[#C0DD97] bg-[#EAF3DE] px-4 py-3 text-[12px] text-[#3B6D11]">{feedback}</div>
      ) : null}

      <div className="rounded-[12px] border border-[#E8E8E4] bg-white p-5">
        <h2 className="mb-4 text-[15px] font-medium text-[#1A1A1A]">Informations boutique</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Ville", value: merchant.city || "Non renseignée" },
            { label: "Email", value: merchant.email || "Non renseigné" },
            { label: "Téléphone", value: merchant.phone || "Non renseigné" },
            { label: "Gérant", value: merchant.ownerUserFullName || "Non renseigné" },
            { label: "Jeux créés", value: String(merchant.gamesCount) },
            { label: "Participations", value: formatCount(merchant.participationsCount) },
            { label: "Followers", value: formatCount(merchant.followersCount) },
            { label: "Statut", value: getStatusLabel(merchant.status) },
          ].map((item) => (
            <article key={item.label} className="rounded-[10px] border border-[#E8E8E4] bg-[#F7F7F5] px-4 py-3">
              <p className="text-[11px] text-[#999999]">{item.label}</p>
              <strong className="mt-1 block text-[13px] font-medium text-[#1A1A1A]">{item.value}</strong>
            </article>
          ))}
        </div>
      </div>

      {merchant.games.length > 0 && (
        <div className="rounded-[12px] border border-[#E8E8E4] bg-white p-5">
          <h2 className="mb-4 text-[15px] font-medium text-[#1A1A1A]">Jeux liés</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {merchant.games.map((game) => (
              <Link key={game.id} href={`/admin/games/${game.id}`} className="flex items-center justify-between rounded-[10px] border border-[#E8E8E4] bg-[#F7F7F5] px-4 py-3 transition hover:border-[#C0DD97] hover:bg-[#EAF3DE]">
                <div>
                  <p className="text-[13px] font-medium text-[#1A1A1A]">{game.name}</p>
                  <p className="mt-1 text-[11px] text-[#999999]">Fin : {game.endDateLabel} · {formatCount(game.participationsCount)} participations</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-[11px] font-medium ${game.status === "actif" ? "bg-[#EAF3DE] text-[#3B6D11]" : "bg-[#F7F7F5] text-[#666666]"}`}>
                  {game.status === "actif" ? "Actif" : game.status === "termine" ? "Terminé" : "À venir"}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-[12px] border border-[#E8E8E4] bg-white p-5">
        <h2 className="mb-4 text-[15px] font-medium text-[#1A1A1A]">Suivi de contact</h2>
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          {[
            { label: "Dernière relance", value: merchant.followUp.lastContactAtLabel },
            { label: "Canal", value: getFollowUpChannelLabel(merchant.followUp.lastContactChannel) },
            { label: "Statut", value: getFollowUpStatusLabel(merchant.followUp.followUpStatus) },
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
          <textarea rows={3} maxLength={280} value={followUpForm.followUpNote} onChange={(e) => handleFollowUpFormChange("followUpNote", e.target.value)} placeholder="Ex: email envoyé, rappel lundi, préfère email." className="resize-none rounded-[8px] border border-[#E8E8E4] bg-[#F7F7F5] px-3 py-2 text-[12.5px] text-[#1A1A1A] outline-none" />
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
  );
}
