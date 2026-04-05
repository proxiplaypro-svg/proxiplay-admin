import type { DashboardKpi } from "@/types/dashboard";

const toneClasses: Record<DashboardKpi["tone"], string> = {
  neutral: "text-neutral-100",
  success: "text-[#7AAE39]",
  warning: "text-[#E0A33A]",
  danger: "text-[#E75858]",
};

export function KpiCard({ kpi }: { kpi: DashboardKpi }) {
  return (
    <article
      className={[
        "rounded-[22px] border border-white/12 bg-[#30302d] px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        kpi.id === "iosRetention"
          ? "border-l-2 border-l-red-500"
          : kpi.accentBorder
            ? "border-l-2 border-l-[#77AE36]"
            : "",
      ].join(" ")}
    >
      <p className="text-[15px] leading-6 text-[#b7b5b0]">{kpi.label}</p>
      <div className={`mt-2 text-[28px] font-semibold leading-none ${toneClasses[kpi.tone]}`}>
        {kpi.value}
      </div>
      <p className={`mt-3 text-[14px] leading-5 ${toneClasses[kpi.tone]}`}>{kpi.helper}</p>
    </article>
  );
}
