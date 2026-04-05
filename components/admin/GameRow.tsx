import Link from "next/link";
import type { ActiveGameRow } from "@/types/dashboard";

const badgeStyles: Record<ActiveGameRow["status"], string> = {
  actif: "bg-[#e4f1cf] text-[#537e18]",
  expire_bientot: "bg-[#f8e7e7] text-[#be5757]",
  prive: "bg-[#dfeaf9] text-[#3271b8]",
  a_corriger: "bg-[#f8e7e7] text-[#be5757]",
};

const badgeLabels: Record<ActiveGameRow["status"], string> = {
  actif: "actif",
  expire_bientot: "expire bientot",
  prive: "prive",
  a_corriger: "a corriger",
};

const progressStyles: Record<ActiveGameRow["progressTone"], string> = {
  green: "bg-[#73b225]",
  amber: "bg-[#d3901f]",
  red: "bg-[#e45454]",
};

export function GameRow({ game }: { game: ActiveGameRow }) {
  return (
    <Link
      href={game.href}
      className="block rounded-[18px] border border-transparent px-4 py-4 transition hover:border-white/10 hover:bg-white/[0.03]"
    >
      <div className="flex items-center gap-4">
        <div className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-[#252523] text-xl">
          {game.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-medium text-[#f2f1ee]">
            {game.merchantName} - {game.name}
          </p>
          <p className="mt-1 text-[14px] text-[#a8a6a1]">
            {game.expiresLabel} · {game.sessionsLabel}
          </p>
        </div>
        <span className={`rounded-full px-4 py-2 text-sm ${badgeStyles[game.status]}`}>
          {badgeLabels[game.status]}
        </span>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/25">
        <div
          className={`h-full rounded-full ${progressStyles[game.progressTone]}`}
          style={{ width: `${game.progressPercent}%` }}
        />
      </div>
    </Link>
  );
}
