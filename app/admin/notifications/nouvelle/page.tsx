"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  type NotificationRecipientUser,
  type NotificationSegmentId,
  createPushNotification,
  getNotificationsAudienceSnapshot,
  getNotificationsErrorMessage,
  searchNotificationUsers,
} from "@/lib/firebase/notificationsQueries";

const SEGMENT_OPTIONS: Array<{ id: NotificationSegmentId; label: string; description: string }> = [
  { id: "ios_inactifs_j7", label: "iOS inactifs J7", description: "users iOS sans activite J7" },
  { id: "inactifs_j30", label: "Inactifs J30", description: "users sans activite 30j" },
  { id: "nouveaux_j7", label: "Nouveaux J7", description: "users crees cette semaine" },
  { id: "ambassadeurs", label: "Ambassadeurs", description: "users avec 5+ referrals" },
];

function formatCount(value: number) {
  return new Intl.NumberFormat("fr-FR").format(value);
}

function formatSendDate(value: Date | null) {
  if (!value) {
    return "Maintenant";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function initialsColor(platform: string) {
  if (platform.includes("ios")) {
    return "bg-[#E6F1FB] text-[#185FA5]";
  }

  if (platform.includes("android")) {
    return "bg-[#EAF3DE] text-[#3B6D11]";
  }

  return "bg-[#F7F7F5] text-[#666666]";
}

export default function NewNotificationPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [initialPageName, setInitialPageName] = useState("");
  const [audienceMode, setAudienceMode] = useState<"all" | "segment" | "single">("all");
  const [segmentId, setSegmentId] = useState<NotificationSegmentId>("ios_inactifs_j7");
  const [selectedUser, setSelectedUser] = useState<NotificationRecipientUser | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [searchResults, setSearchResults] = useState<NotificationRecipientUser[]>([]);
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [allUsersCount, setAllUsersCount] = useState(0);
  const [segmentCounts, setSegmentCounts] = useState<Record<NotificationSegmentId, number>>({
    ios_inactifs_j7: 0,
    inactifs_j30: 0,
    nouveaux_j7: 0,
    ambassadeurs: 0,
  });
  const [loadingAudience, setLoadingAudience] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoadingAudience(true);

      try {
        const snapshot = await getNotificationsAudienceSnapshot();
        if (!cancelled) {
          setAllUsersCount(snapshot.allUsersCount);
          setSegmentCounts(snapshot.segments);
        }
      } catch (fetchError) {
        if (!cancelled) {
          console.error(fetchError);
          setFeedback({ tone: "error", text: getNotificationsErrorMessage(fetchError) });
        }
      } finally {
        if (!cancelled) {
          setLoadingAudience(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (audienceMode !== "single" || userSearch.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        const results = await searchNotificationUsers(userSearch);
        if (!cancelled) {
          setSearchResults(results);
        }
      } catch (searchError) {
        if (!cancelled) {
          console.error(searchError);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [audienceMode, userSearch]);

  const scheduledAt = useMemo(() => {
    if (scheduleMode !== "later" || !scheduledDate || !scheduledTime) {
      return null;
    }

    return new Date(`${scheduledDate}T${scheduledTime}:00`);
  }, [scheduleMode, scheduledDate, scheduledTime]);

  const recipientsCount = useMemo(() => {
    if (audienceMode === "segment") {
      return segmentCounts[segmentId] ?? 0;
    }

    if (audienceMode === "single") {
      return selectedUser ? 1 : 0;
    }

    return allUsersCount;
  }, [allUsersCount, audienceMode, segmentCounts, segmentId, selectedUser]);

  const selectedSegment = SEGMENT_OPTIONS.find((option) => option.id === segmentId);
  const titleCount = `${title.length}/50`;
  const messageCount = `${message.length}/150`;

  const handleSubmit = async () => {
    if (!title.trim() || !message.trim()) {
      setFeedback({ tone: "error", text: "Titre et message sont obligatoires." });
      return;
    }

    if (audienceMode === "single" && !selectedUser) {
      setFeedback({ tone: "error", text: "Selectionne un joueur avant l envoi cible." });
      return;
    }

    if (scheduleMode === "later" && !scheduledAt) {
      setFeedback({ tone: "error", text: "Choisis une date et une heure de programmation." });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      await createPushNotification({
        title,
        message,
        imageUrl,
        initialPageName,
        parameterData: "",
        audienceMode,
        segmentId: selectedSegment?.label ?? "All",
        userUid: selectedUser?.id ?? "",
        scheduledAt,
      });

      setFeedback({ tone: "success", text: "Notification creee dans ff_push_notifications." });
      window.setTimeout(() => {
        router.push("/admin/notifications");
      }, 2000);
    } catch (submitError) {
      console.error(submitError);
      setFeedback({ tone: "error", text: getNotificationsErrorMessage(submitError) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="space-y-5 bg-[#F7F7F5] text-[#1A1A1A]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-[22px] font-medium tracking-[-0.02em] text-[#1A1A1A]">
            Nouvelle notification
          </h1>
          <p className="mt-2 text-[13px] text-[#666666]">Composeur push — envoi via FlutterFlow</p>
        </div>
        <Link
          href="/admin/notifications"
          className="inline-flex items-center justify-center rounded-[10px] border border-[#E0E0DA] bg-white px-4 py-[10px] text-[12px] text-[#1A1A1A] transition hover:bg-[#FAFAF8]"
        >
          Annuler
        </Link>
      </div>

      {feedback ? (
        <div className={`rounded-[10px] border px-4 py-3 text-[12.5px] ${
          feedback.tone === "success"
            ? "border-[#CFE5AF] bg-[#EAF3DE] text-[#3B6D11]"
            : "border-[#F1D1D1] bg-[#FCEBEB] text-[#A32D2D]"
        }`}>
          {feedback.text}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <div className="space-y-5">
          <section className="rounded-[12px] border border-[#E8E8E4] bg-white p-5">
            <h2 className="text-[16px] font-medium text-[#1A1A1A]">Contenu</h2>
            <div className="mt-4 grid gap-4">
              <label className="grid gap-2">
                <div className="flex items-center justify-between text-[12px] text-[#666666]">
                  <span>Titre</span>
                  <span className="text-[#999999]">{titleCount}</span>
                </div>
                <input
                  value={title}
                  maxLength={50}
                  onChange={(event) => setTitle(event.target.value)}
                  className="min-h-[44px] rounded-[8px] border border-[#E8E8E4] bg-[#F7F7F5] px-3 text-[13px] text-[#1A1A1A] outline-none transition focus:border-[#C0DD97] focus:bg-white"
                />
              </label>

              <label className="grid gap-2">
                <div className="flex items-center justify-between text-[12px] text-[#666666]">
                  <span>Message</span>
                  <span className="text-[#999999]">{messageCount}</span>
                </div>
                <textarea
                  value={message}
                  maxLength={150}
                  onChange={(event) => setMessage(event.target.value)}
                  className="min-h-[120px] rounded-[8px] border border-[#E8E8E4] bg-[#F7F7F5] px-3 py-3 text-[13px] text-[#1A1A1A] outline-none transition focus:border-[#C0DD97] focus:bg-white"
                />
              </label>

              <label className="grid gap-2 text-[12px] text-[#666666]">
                <span>URL image</span>
                <input
                  value={imageUrl}
                  onChange={(event) => setImageUrl(event.target.value)}
                  placeholder="https://..."
                  className="min-h-[44px] rounded-[8px] border border-[#E8E8E4] bg-[#F7F7F5] px-3 text-[13px] text-[#1A1A1A] outline-none transition placeholder:text-[#999999] focus:border-[#C0DD97] focus:bg-white"
                />
              </label>

              <label className="grid gap-2 text-[12px] text-[#666666]">
                <span>Page de destination</span>
                <input
                  value={initialPageName}
                  onChange={(event) => setInitialPageName(event.target.value)}
                  placeholder="ex: HomePage, GamePage"
                  className="min-h-[44px] rounded-[8px] border border-[#E8E8E4] bg-[#F7F7F5] px-3 text-[13px] text-[#1A1A1A] outline-none transition placeholder:text-[#999999] focus:border-[#C0DD97] focus:bg-white"
                />
              </label>
            </div>
          </section>

          <section className="rounded-[12px] border border-[#E8E8E4] bg-white p-5">
            <h2 className="text-[16px] font-medium text-[#1A1A1A]">Destinataires</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                { value: "all", label: "Tous" },
                { value: "segment", label: "Segment" },
                { value: "single", label: "Joueur specifique" },
              ].map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setAudienceMode(tab.value as "all" | "segment" | "single")}
                  className={`rounded-[8px] px-4 py-2 text-[12px] transition ${
                    audienceMode === tab.value
                      ? "bg-[#EAF3DE] font-medium text-[#3B6D11]"
                      : "bg-[#F7F7F5] text-[#666666]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {audienceMode === "all" ? (
              <div className="mt-4 rounded-[10px] border border-[#F0F0EC] bg-[#FCFCFB] p-4 text-[13px] text-[#666666]">
                {loadingAudience ? "Chargement des joueurs..." : `${formatCount(allUsersCount)} joueurs dans la base users.`}
              </div>
            ) : null}

            {audienceMode === "segment" ? (
              <div className="mt-4 grid gap-4">
                <label className="grid gap-2 text-[12px] text-[#666666]">
                  <span>Segment</span>
                  <select
                    value={segmentId}
                    onChange={(event) => setSegmentId(event.target.value as NotificationSegmentId)}
                    className="min-h-[44px] rounded-[8px] border border-[#E8E8E4] bg-[#F7F7F5] px-3 text-[13px] text-[#1A1A1A] outline-none transition focus:border-[#C0DD97] focus:bg-white"
                  >
                    {SEGMENT_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="rounded-[10px] border border-[#F0F0EC] bg-[#FCFCFB] p-4 text-[13px] text-[#666666]">
                  <p className="font-medium text-[#1A1A1A]">{selectedSegment?.label}</p>
                  <p className="mt-1">{selectedSegment?.description}</p>
                  <p className="mt-2 text-[#999999]">
                    {loadingAudience ? "Estimation en cours..." : `${formatCount(segmentCounts[segmentId] ?? 0)} joueurs estimes`}
                  </p>
                </div>
              </div>
            ) : null}

            {audienceMode === "single" ? (
              <div className="mt-4 grid gap-4">
                <label className="grid gap-2 text-[12px] text-[#666666]">
                  <span>Recherche joueur</span>
                  <input
                    value={userSearch}
                    onChange={(event) => {
                      setUserSearch(event.target.value);
                      setSelectedUser(null);
                    }}
                    placeholder="Nom ou email"
                    className="min-h-[44px] rounded-[8px] border border-[#E8E8E4] bg-[#F7F7F5] px-3 text-[13px] text-[#1A1A1A] outline-none transition placeholder:text-[#999999] focus:border-[#C0DD97] focus:bg-white"
                  />
                </label>

                {searchResults.length > 0 ? (
                  <div className="rounded-[10px] border border-[#F0F0EC] bg-[#FCFCFB]">
                    {searchResults.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => {
                          setSelectedUser(user);
                          setUserSearch(`${user.displayName} ${user.email}`);
                          setSearchResults([]);
                        }}
                        className="flex w-full items-center gap-3 border-b border-[#F0F0EC] px-4 py-3 text-left last:border-b-0 hover:bg-[#FAFAF8]"
                      >
                        <span className={`flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-medium ${initialsColor(user.platform)}`}>
                          {user.initials}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[12.5px] font-medium text-[#1A1A1A]">{user.displayName}</span>
                          <span className="block truncate text-[11px] text-[#999999]">{user.email}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}

                {selectedUser ? (
                  <div className="flex items-center gap-3 rounded-[10px] border border-[#E8E8E4] bg-[#FCFCFB] p-4">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-full text-[12px] font-medium ${initialsColor(selectedUser.platform)}`}>
                      {selectedUser.initials}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-medium text-[#1A1A1A]">{selectedUser.displayName}</p>
                      <p className="truncate text-[11px] text-[#999999]">{selectedUser.email}</p>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="rounded-[12px] border border-[#E8E8E4] bg-white p-5">
            <h2 className="text-[16px] font-medium text-[#1A1A1A]">Programmation</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                { value: "now", label: "Envoyer maintenant" },
                { value: "later", label: "Programmer" },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setScheduleMode(option.value as "now" | "later")}
                  className={`rounded-[8px] px-4 py-2 text-[12px] transition ${
                    scheduleMode === option.value
                      ? "bg-[#EAF3DE] font-medium text-[#3B6D11]"
                      : "bg-[#F7F7F5] text-[#666666]"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {scheduleMode === "later" ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-[12px] text-[#666666]">
                  <span>Date</span>
                  <input
                    type="date"
                    value={scheduledDate}
                    onChange={(event) => setScheduledDate(event.target.value)}
                    className="min-h-[44px] rounded-[8px] border border-[#E8E8E4] bg-[#F7F7F5] px-3 text-[13px] text-[#1A1A1A] outline-none transition focus:border-[#C0DD97] focus:bg-white"
                  />
                </label>
                <label className="grid gap-2 text-[12px] text-[#666666]">
                  <span>Heure</span>
                  <input
                    type="time"
                    value={scheduledTime}
                    onChange={(event) => setScheduledTime(event.target.value)}
                    className="min-h-[44px] rounded-[8px] border border-[#E8E8E4] bg-[#F7F7F5] px-3 text-[13px] text-[#1A1A1A] outline-none transition focus:border-[#C0DD97] focus:bg-white"
                  />
                </label>
              </div>
            ) : null}

            <p className="mt-4 text-[12px] text-[#999999]">
              {scheduleMode === "later" && scheduledAt
                ? `Sera envoyee le ${formatSendDate(scheduledAt)}`
                : "scheduled_time utilisera serverTimestamp() pour un envoi immediat."}
            </p>
          </section>
        </div>

        <div className="space-y-5">
          <section className="sticky top-6 space-y-5">
            <div className="overflow-hidden rounded-[12px] border border-[#E8E8E4] bg-white">
              <div className="border-b border-[#F0F0EC] px-5 py-4">
                <h2 className="text-[16px] font-medium text-[#1A1A1A]">Apercu notification</h2>
              </div>
              <div className="p-5">
                <div className="rounded-[20px] bg-[#1A1A2E] p-4 text-white">
                  <div className="flex items-center justify-between text-[11px] text-[#C9CAE7]">
                    <span className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-[#639922] text-[10px] font-medium text-white">PP</span>
                      <span>ProxiPlay</span>
                    </span>
                    <span>{new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date())}</span>
                  </div>
                  <p className="mt-4 text-[14px] font-medium">{title || "Titre de notification"}</p>
                  <p className="mt-2 text-[12px] leading-[1.5] text-[#C9CAE7]">
                    {message || "Ton message apparaitra ici dans l apercu mobile."}
                  </p>
                  {imageUrl.trim() ? (
                    <div className="mt-4 overflow-hidden rounded-[12px] border border-[rgba(255,255,255,0.12)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imageUrl.trim()} alt="Apercu notification" className="h-[140px] w-full object-cover" />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="rounded-[12px] border border-[#E8E8E4] bg-white p-5">
              <h2 className="text-[16px] font-medium text-[#1A1A1A]">Resume envoi</h2>
              <div className="mt-4 grid gap-3 text-[12.5px] text-[#666666]">
                <div className="flex items-center justify-between gap-4">
                  <span>Destinataires</span>
                  <strong className="text-[#1A1A1A]">{formatCount(recipientsCount)} joueurs</strong>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>Envoi</span>
                  <strong className="text-[#1A1A1A]">{formatSendDate(scheduledAt)}</strong>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>Cible</span>
                  <strong className="text-[#1A1A1A]">
                    {audienceMode === "segment"
                      ? selectedSegment?.label
                      : audienceMode === "single"
                        ? selectedUser?.displayName ?? "Aucun joueur"
                        : "Tous"}
                  </strong>
                </div>
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleSubmit()}
                className="mt-5 w-full rounded-[10px] bg-[#639922] px-4 py-[12px] text-[12px] font-medium text-white transition hover:bg-[#57881D] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Creation..." : "Envoyer la notification"}
              </button>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
