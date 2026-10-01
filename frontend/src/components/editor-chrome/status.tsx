import { Check, CloudOff, Loader2, Minus, Plus, ScanSearch } from "lucide-react";

import { cn } from "@/lib/utils";

export function formatJamCode(code: string): string {
  const clean = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return clean.length === 6 ? `${clean.slice(0, 3)}-${clean.slice(3)}` : clean;
}

export function JamChip({ code, className }: { code: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-full bg-beacon/10 pl-2.5 pr-3 text-[13px] font-medium text-ink",
        className,
      )}
    >
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-beacon opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-beacon" />
      </span>
      Live
      <span className="font-mono text-[12px] tracking-wide text-ink/70">{formatJamCode(code)}</span>
    </span>
  );
}

export type SaveState = "saved" | "saving" | "offline" | "local";

export function SaveStatus({ state }: { state: SaveState }) {
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] text-slate">
        <Loader2 className="size-3.5 animate-spin" /> Saving…
      </span>
    );
  }
  if (state === "offline") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] text-slate">
        <CloudOff className="size-3.5" /> Offline — changes will sync
      </span>
    );
  }
  if (state === "local") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] text-slate" title="Changes are kept on this device and sync when the connection is back">
        <CloudOff className="size-3.5" /> Offline · saved on this device
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-slate">
      <Check className="size-3.5" /> Saved
    </span>
  );
}

export function ZoomControl({
  zoom,
  onZoomIn,
  onZoomOut,
  onFit,
  onReset,
  className,
}: {
  zoom: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onFit?: () => void;
  onReset?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-10 items-center gap-0.5 rounded-full border border-hairline bg-paper p-1 shadow-float",
        className,
      )}
    >
      <button type="button" aria-label="Zoom out" onClick={onZoomOut} className="grid size-8 place-items-center rounded-full hover:bg-fog">
        <Minus className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Reset zoom to 100%"
        title="Reset to 100%"
        onClick={onReset}
        className="h-8 w-12 rounded-full text-center font-mono text-[12px] text-slate hover:bg-fog"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button type="button" aria-label="Zoom in" onClick={onZoomIn} className="grid size-8 place-items-center rounded-full hover:bg-fog">
        <Plus className="size-4" />
      </button>
      <span className="mx-0.5 h-5 w-px bg-hairline" />
      <button type="button" aria-label="Fit diagram" title="Fit diagram" onClick={onFit} className="grid size-8 place-items-center rounded-full hover:bg-fog">
        <ScanSearch className="size-4" />
      </button>
    </div>
  );
}
