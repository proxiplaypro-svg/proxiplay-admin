"use client";

import type { PosterVisualFormat } from "@/lib/admin/posterVisualGenerator";

type PosterPreviewProps = {
  format: PosterVisualFormat;
  previewUrl: string | null;
  loading?: boolean;
};

const formatFrameClassName: Record<PosterVisualFormat, string> = {
  "a4-portrait": "aspect-[1240/1754] max-w-[360px]",
  "facebook-square": "aspect-square max-w-[420px]",
  "instagram-story": "aspect-[1080/1920] max-w-[300px]",
};

export function PosterPreview({ format, previewUrl, loading = false }: PosterPreviewProps) {
  return (
    <section className="rounded-[16px] border border-[#E8E8E4] bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-medium text-[#1A1A1A]">Apercu du visuel</h2>
          <p className="mt-1 text-[12px] text-[#7B7B7B]">
            Le fond IA reste editable, les informations critiques viennent du systeme.
          </p>
        </div>
        {loading ? (
          <span className="rounded-full bg-[#FFF5DA] px-3 py-1 text-[11px] font-medium text-[#8A5A00]">
            Generation...
          </span>
        ) : null}
      </div>

      <div className="mt-5 flex justify-center rounded-[18px] bg-[linear-gradient(180deg,#f8f3ea_0%,#f2f0fb_100%)] p-4">
        <div
          className={`w-full overflow-hidden rounded-[24px] border border-[#E8E8E4] bg-white shadow-[0_24px_60px_rgba(41,40,106,0.12)] ${formatFrameClassName[format]}`}
        >
          {previewUrl ? (
            <div className="relative h-full w-full">
              {/* Preview images are generated data URLs, so Next Image optimization does not add value here. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="Apercu du visuel ProxiPlay" className="h-full w-full object-cover" />
              {loading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-[rgba(255,255,255,0.68)] text-[12px] font-medium text-[#29286A]">
                  Generation du fond IA...
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex h-full min-h-[320px] items-center justify-center px-6 text-center text-[12px] text-[#7B7B7B]">
              Genere un fond IA pour voir l affiche composee.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
