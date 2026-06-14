"use client";

import type {
  PosterOverlayState,
  PosterVisualFormat,
} from "@/lib/admin/posterVisualGenerator";

type PosterOverlayEditorProps = {
  format: PosterVisualFormat;
  overlay: PosterOverlayState;
  onFormatChange: (format: PosterVisualFormat) => void;
  onOverlayChange: (patch: Partial<PosterOverlayState>) => void;
  onGenerate: () => void;
  onDownloadPng: () => void;
  onDownloadPdf: () => void;
  loading: boolean;
  hasBackground: boolean;
};

const formatOptions: Array<{ id: PosterVisualFormat; label: string }> = [
  { id: "a4-portrait", label: "A4 portrait" },
  { id: "facebook-square", label: "Facebook 1080" },
  { id: "instagram-story", label: "Story 1080x1920" },
];

const inputClassName =
  "w-full rounded-[10px] border border-[#E8E8E4] bg-[#F7F7F5] px-3 py-[10px] text-[13px] text-[#1A1A1A] outline-none placeholder:text-[#999999]";

export function PosterOverlayEditor({
  format,
  overlay,
  onFormatChange,
  onOverlayChange,
  onGenerate,
  onDownloadPng,
  onDownloadPdf,
  loading,
  hasBackground,
}: PosterOverlayEditorProps) {
  return (
    <section className="rounded-[16px] border border-[#E8E8E4] bg-white p-5">
      <div className="flex flex-col gap-2">
        <h2 className="text-[16px] font-medium text-[#1A1A1A]">Edition des textes et formats</h2>
        <p className="text-[12px] text-[#7B7B7B]">
          Le fond vient de l IA, tous les textes finaux et informations legales restent maitrises ici.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {formatOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onFormatChange(option.id)}
            className={`rounded-full px-3 py-[8px] text-[12px] font-medium transition ${
              format === option.id
                ? "border border-[#A0134D] bg-[#FFF5FA] text-[#A0134D]"
                : "border border-[#E8E8E4] bg-white text-[#666666] hover:bg-[#F7F7F5]"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-[#666666]">Titre principal</span>
          <input
            className={inputClassName}
            value={overlay.headline}
            onChange={(event) => onOverlayChange({ headline: event.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-[#666666]">Accent</span>
          <input
            className={inputClassName}
            value={overlay.headlineAccent}
            onChange={(event) => onOverlayChange({ headlineAccent: event.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1.5 md:col-span-2">
          <span className="text-[12px] font-medium text-[#666666]">Sous-texte</span>
          <input
            className={inputClassName}
            value={overlay.subline}
            onChange={(event) => onOverlayChange({ subline: event.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-[#666666]">Titre carte QR</span>
          <input
            className={inputClassName}
            value={overlay.ctaTitle}
            onChange={(event) => onOverlayChange({ ctaTitle: event.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-[#666666]">Bouton date</span>
          <input
            className={inputClassName}
            value={overlay.ctaButton}
            onChange={(event) => onOverlayChange({ ctaButton: event.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-[#666666]">Badge</span>
          <input
            className={inputClassName}
            value={overlay.badgeText}
            onChange={(event) => onOverlayChange({ badgeText: event.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-[#666666]">Direction artistique</span>
          <input
            className={inputClassName}
            value={overlay.promptMood}
            onChange={(event) => onOverlayChange({ promptMood: event.target.value })}
          />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-[10px] border border-[#639922] bg-[#639922] px-4 py-[10px] text-[12px] font-medium text-white transition hover:bg-[#57881D] disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onGenerate}
          disabled={loading}
          aria-busy={loading}
        >
          {loading ? "Generation du fond IA..." : hasBackground ? "Regenerer le fond IA" : "Generer un visuel IA"}
        </button>
        <button
          type="button"
          className="rounded-[10px] border border-[#185FA5] bg-white px-4 py-[10px] text-[12px] font-medium text-[#185FA5] transition hover:bg-[#F5FAFE] disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onDownloadPng}
          disabled={!hasBackground || loading}
        >
          Telecharger PNG
        </button>
        <button
          type="button"
          className="rounded-[10px] border border-[#A0134D] bg-white px-4 py-[10px] text-[12px] font-medium text-[#A0134D] transition hover:bg-[#FFF5FA] disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onDownloadPdf}
          disabled={!hasBackground || loading}
        >
          Telecharger PDF
        </button>
      </div>
    </section>
  );
}
