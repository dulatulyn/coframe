"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";

import { BANNERS, viewInfo, type ViewMode } from "./modes";

export function ViewBanner({ mode, hint, onExit, children }: { mode: ViewMode; hint?: string; onExit: () => void; children?: ReactNode }) {
  const info = viewInfo(mode);
  const Icon = info.icon;
  return (
    <div className="absolute left-1/2 top-[76px] z-30 flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-2 rounded-full border border-hairline bg-paper py-1.5 pl-4 pr-1.5 shadow-pop sm:top-20">
      <Icon className="size-4 shrink-0 text-cobalt" />
      <div className="min-w-0">
        <p className="truncate text-[14px] font-medium leading-5">{info.label}</p>
        <p className="truncate text-[12px] leading-4 text-slate">{hint ?? BANNERS[mode] ?? info.hint}</p>
      </div>
      {children}
      <button
        type="button"
        onClick={onExit}
        title="Back to editing (Esc)"
        className="ml-2 flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-fog px-3 text-[13px] font-medium hover:bg-fog-strong"
      >
        <X className="size-3.5" /> Exit
      </button>
    </div>
  );
}
