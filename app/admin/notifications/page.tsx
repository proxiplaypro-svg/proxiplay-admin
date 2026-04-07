"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PushNotification } from "@/types/dashboard";
import {
  getLatestPushNotifications,
  getNotificationsErrorMessage,
} from "@/lib/firebase/notificationsQueries";

function getStatusBadge(status: string) {
  switch (status) {
    case "scheduled":
      return "bg-[#FAEEDA] text-[#633806]";
    case "sent":
      return "bg-[#EAF3DE] text-[#3B6D11]";
    default:
      return "bg-[#E6F1FB] text-[#185FA5]";
  }
}

export default function NotificationsPage() {
  const [items, setItems] = useState<PushNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);

      try {
        const notifications = await getLatestPushNotifications();
        if (!cancelled) {
          setItems(notifications);
        }
      } catch (fetchError) {
        if (!cancelled) {
          console.error(fetchError);
          setError(getNotificationsErrorMessage(fetchError));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

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
            <p className="mt-1 text-[12px] text-[#999999]">20 derniers documents ff_push_notifications</p>
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
                    <p className="font-medium text-[#1A1A1A]">{item.scheduledTimeLabel}</p>
                    <p className="mt-1 text-[#999999]">Creation : {item.createdAtLabel}</p>
                  </div>
                  <div className="text-[12px] text-[#666666]">
                    <p className="font-medium text-[#1A1A1A]">{item.targetAudience || "All"}</p>
                    <p className="mt-1 text-[#999999]">
                      {item.deliveryCount !== null ? `${item.deliveryCount} livraisons` : "Count indisponible"}
                    </p>
                  </div>
                  <div className="flex items-center justify-start md:justify-end">
                    <span className={`inline-flex rounded-full px-3 py-[4px] text-[11px] font-medium ${getStatusBadge(item.status)}`}>
                      {item.status}
                    </span>
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
