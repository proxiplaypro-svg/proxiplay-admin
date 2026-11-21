"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { PushNotification } from "@/types/dashboard";
import {
  formatPushNotificationDelivery,
  cancelScheduledPushNotification,
  getLatestPushNotifications,
  getNotificationsErrorMessage,
} from "@/lib/firebase/notificationsQueries";

function getStatusBadge(status: string) {
  switch (status) {
    case "scheduled":
      return "bg-[#FAEEDA] text-[#633806]";
    case "sent":
    case "succeeded":
      return "bg-[#EAF3DE] text-[#3B6D11]";
    case "failed":
    case "partial_failed":
      return "bg-[#FCE8E6] text-[#A32D2D]";
    case "cancelled":
      return "bg-[#F1EFE8] text-[#5F5E5A]";
    default:
      return "bg-[#E6F1FB] text-[#185FA5]";
  }
}

const statusLabels: Record<string, string> = {
  started: "En attente", scheduled: "Programmée", pending: "En attente",
  sending: "En cours", succeeded: "Terminé", sent: "Terminé",
  partial_failed: "Partiellement échoué", failed: "Échoué",
  cancelled: "Annulée",
};

export default function NotificationsPage() {
  const [items, setItems] = useState<PushNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
      setLoading(true);
      setError(null);

      try {
        const notifications = await getLatestPushNotifications();
        setItems(notifications);
      } catch (fetchError) {
        console.error(fetchError);
        setError(getNotificationsErrorMessage(fetchError));
      } finally {
        setLoading(false);
      }
  }, []);

  useEffect(() => { void loadNotifications(); }, [loadNotifications]);

  const cancelNotification = async (item: PushNotification) => {
    if (!window.confirm(`Annuler la notification programmée pour le ${item.scheduledTimeLabel} ?`)) return;
    setCancellingId(item.id);
    setError(null);
    try {
      await cancelScheduledPushNotification(item.id);
      await loadNotifications();
    } catch (cancelError) {
      await loadNotifications();
      setError(getNotificationsErrorMessage(cancelError));
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <section className="space-y-5 bg-[#F7F7F5] text-[#1A1A1A]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-[22px] font-medium tracking-[-0.02em] text-[#1A1A1A]">
            Notifications
          </h1>
          <p className="mt-2 text-[13px] text-[#666666]">
            Historique recent des envois FlutterFlow.
          </p>
        </div>
        <Link
          href="/admin/notifications/nouvelle"
          className="inline-flex items-center justify-center rounded-[10px] bg-[#639922] px-4 py-[10px] text-[12px] font-medium text-white transition hover:bg-[#57881D]"
        >
          Nouvelle notification
        </Link>
      </div>

      <section className="rounded-[12px] border border-[#E8E8E4] bg-white">
        <div className="flex items-center justify-between border-b border-[#F0F0EC] px-5 py-4">
          <div>
            <h2 className="text-[18px] font-medium text-[#1A1A1A]">Dernieres notifications</h2>
            <p className="mt-1 text-[12px] text-[#999999]">20 dernières notifications et toutes celles encore programmées</p>
          </div>
          <span className="text-[12px] text-[#999999]">{items.length} notifications</span>
        </div>

        {loading ? <div className="px-5 py-10 text-[12.5px] text-[#999999]">Chargement...</div> : null}
        {!loading && error ? <div className="px-5 py-6 text-[12.5px] text-[#A32D2D]">{error}</div> : null}

        {!loading && !error ? (
          items.length === 0 ? (
            <div className="px-5 py-10 text-[12.5px] text-[#999999]">
              Aucun document ff_push_notifications a afficher.
            </div>
          ) : (
            <div className="divide-y divide-[#F0F0EC]">
              {items.map((item) => (
                <article key={item.id} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1.5fr)_180px_180px_140px] md:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-[#1A1A1A]">{item.title}</p>
                    <p className="mt-1 truncate text-[12px] text-[#666666]">{item.message || "Message non renseigne"}</p>
                  </div>
                  <div className="text-[12px] text-[#666666]">
                    <p className="font-medium text-[#1A1A1A]">{item.sentAtLabel ? `Envoi : ${item.sentAtLabel}` : `Prévu : ${item.scheduledTimeLabel}`}</p>
                    <p className="mt-1 text-[#999999]">Creation : {item.createdAtLabel}</p>
                  </div>
                  <div className="text-[12px] text-[#666666]">
                    <p className="font-medium text-[#1A1A1A]">{item.targetAudience || "All"}</p>
                    <p className="mt-1 text-[#999999]">Ciblés : {item.targetedPlayers ?? "—"} · Avec token : {item.playersWithToken ?? "—"}</p>
                    <p className="mt-1 text-[#999999]">
                      {formatPushNotificationDelivery(
                        item.deliveryCount,
                        item.deliveryFailureCount,
                        item.deliveryAttemptCount,
                      ) ?? "Count indisponible"}
                    </p>
                  </div>
                  <div className="flex flex-col items-start gap-2 md:items-end">
                    <span className={`inline-flex rounded-full px-3 py-[4px] text-[11px] font-medium ${getStatusBadge(item.status)}`}>
                      {item.legacyBlocked ? "Bloquée (ancien format)" : statusLabels[item.status] ?? item.status}
                    </span>
                    {item.status === "scheduled" && item.scheduledTimeValue > Date.now() ? (
                      <button type="button" onClick={() => void cancelNotification(item)} disabled={cancellingId !== null} className="text-[11px] font-medium text-[#A32D2D] underline disabled:opacity-50">
                        {cancellingId === item.id ? "Annulation..." : "Annuler"}
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )
        ) : null}
      </section>
    </section>
  );
}
