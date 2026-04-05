import Link from "next/link";
import type { DashboardAlert } from "@/types/dashboard";

export function AlertBanner({ alerts }: { alerts: DashboardAlert[] }) {
  if (alerts.length === 0) {
    return null;
  }

  const primaryAlert = alerts[0];

  return (
    <section className="flex items-center justify-between gap-4 rounded-[22px] border border-[#e0bb72] bg-[#FAEEDA] px-6 py-5 text-[#7d5621]">
      <div className="flex items-start gap-4">
        <div className="pt-1 text-xl">⚠️</div>
        <div>
          <p className="text-[15px] font-semibold">{primaryAlert.title}</p>
          <p className="mt-1 text-[15px] leading-6">{primaryAlert.description}</p>
        </div>
      </div>
      {primaryAlert.href ? (
        <Link
          href={primaryAlert.href}
          className="shrink-0 rounded-full border border-[#efd8ae] bg-white/30 px-5 py-2 text-sm text-[#aa8552] transition hover:bg-white/50"
        >
          {primaryAlert.ctaLabel ?? "Voir detail"}
        </Link>
      ) : null}
    </section>
  );
}
