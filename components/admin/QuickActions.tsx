"use client";

import Link from "next/link";

type QuickActionsProps = {
  onBulkReminder: () => Promise<void>;
  isBulkReminderPending: boolean;
};

const cardClassName =
  "flex min-h-[132px] flex-col justify-between rounded-[20px] border border-white/10 bg-[#2e2d29] p-4 text-left text-[#eceae6] transition hover:border-white/20 hover:bg-[#34322e]";

export function QuickActions({
  onBulkReminder,
  isBulkReminderPending,
}: QuickActionsProps) {
  return (
    <section className="rounded-[24px] border border-white/10 bg-[#2f2e2a]">
      <div className="border-b border-white/10 px-5 py-4">
        <h3 className="text-[18px] text-[#f3f1ed]">Actions rapides</h3>
      </div>
      <div className="grid grid-cols-2 gap-4 p-5">
        <Link href="/admin/notifications/nouvelle" className={cardClassName}>
          <span className="text-2xl">📣</span>
          <span className="text-[17px]">Notif push</span>
        </Link>
        <Link href="/admin/jeux/nouveau" className={cardClassName}>
          <span className="text-2xl">🎮</span>
          <span className="text-[17px]">Creer jeu</span>
        </Link>
        <Link href="/admin/marchands/nouveau" className={cardClassName}>
          <span className="text-2xl">🏬</span>
          <span className="text-[17px]">Ajouter marchand</span>
        </Link>
        <button
          type="button"
          onClick={() => void onBulkReminder()}
          disabled={isBulkReminderPending}
          className={`${cardClassName} disabled:cursor-not-allowed disabled:opacity-60`}
        >
          <span className="text-2xl">🔁</span>
          <span className="text-[17px]">
            {isBulkReminderPending ? "Relance..." : "Relancer marchands"}
          </span>
        </button>
      </div>
    </section>
  );
}
