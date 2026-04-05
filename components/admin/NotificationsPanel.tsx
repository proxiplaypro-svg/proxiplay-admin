"use client";

import { useMemo, useState } from "react";
import type { NotificationItem, NotificationSegment } from "@/types/dashboard";

const toneClasses: Record<NotificationItem["progressTone"], string> = {
  green: "bg-[#72b127]",
  amber: "bg-[#d69021]",
  red: "bg-[#de5959]",
};

const segmentClasses: Record<NotificationSegment, string> = {
  "Joueurs actifs": "bg-[#e3f0cf] text-[#557d1d]",
  "iOS inactifs J7": "bg-[#dfeafb] text-[#356eb1]",
  Ambassadeurs: "bg-[#ebe6fb] text-[#6351cc]",
};

const segments: NotificationSegment[] = [
  "Joueurs actifs",
  "iOS inactifs J7",
  "Ambassadeurs",
];

export function NotificationsPanel({
  notifications,
}: {
  notifications: NotificationItem[];
}) {
  const [selectedSegment, setSelectedSegment] = useState<NotificationSegment | null>(null);

  const filteredNotifications = useMemo(() => {
    if (!selectedSegment) {
      return notifications;
    }

    return notifications.filter((notification) => notification.segment === selectedSegment);
  }, [notifications, selectedSegment]);

  return (
    <section className="rounded-[24px] border border-white/10 bg-[#2f2e2a]">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <h3 className="max-w-[240px] text-[18px] leading-6 text-[#f3f1ed]">
          Notifications push - derniers envois
        </h3>
        <button
          type="button"
          className="rounded-[16px] border border-white/20 px-4 py-2 text-sm text-[#edeae6]"
        >
          Nouvelle notif
        </button>
      </div>

      <div className="space-y-5 p-5">
        {filteredNotifications.map((notification) => (
          <article key={notification.id} className="border-b border-white/10 pb-5 last:border-b-0 last:pb-0">
            <p className="text-[16px] leading-6 text-[#f0ede9]">{notification.title}</p>
            <div className="mt-2 flex items-end justify-between gap-4">
              <p className="text-sm leading-5 text-[#9d9992]">{notification.sentAtLabel}</p>
              <span className="text-sm text-[#9d9992]">{notification.openRate}% ouverts</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/25">
              <div
                className={`h-full rounded-full ${toneClasses[notification.progressTone]}`}
                style={{ width: `${notification.openRate}%` }}
              />
            </div>
          </article>
        ))}

        <div className="border-t border-white/10 pt-5">
          <p className="mb-4 text-sm text-[#918e88]">Segments disponibles pour le prochain envoi</p>
          <div className="flex flex-wrap gap-3">
            {segments.map((segment) => (
              <button
                key={segment}
                type="button"
                onClick={() => setSelectedSegment((current) => (current === segment ? null : segment))}
                className={`rounded-full px-4 py-2 text-sm transition ${segmentClasses[segment]} ${
                  selectedSegment === segment ? "ring-2 ring-white/30" : ""
                }`}
              >
                {segment}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
