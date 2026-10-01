"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function ViewPanel({ title, subtitle, children, className }: { title: string; subtitle?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <aside
      className={cn(
        "absolute z-30 flex flex-col overflow-hidden rounded-[24px] border border-hairline bg-paper shadow-float",
        "inset-x-3 bottom-3 max-h-[55dvh] md:inset-x-auto md:bottom-24 md:right-4 md:top-[140px] md:max-h-none md:w-[340px]",
        className,
      )}
    >
      <header className="px-4 pb-2 pt-4">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[12px] leading-4 text-slate">{subtitle}</p>}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">{children}</div>
    </aside>
  );
}
