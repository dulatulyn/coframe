"use client";

import { useState } from "react";

import { MiniDiagram } from "@/components/editor-chrome/files-panel";
import { cn } from "@/lib/utils";

export function DiagramThumb({
  diagramId,
  version,
  seed = 0,
  minWidth = 720,
  className,
}: {
  diagramId: string | null;
  version?: string | null;
  seed?: number;
  minWidth?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [naturalWidth, setNaturalWidth] = useState<number | null>(null);
  const src = diagramId && version && !failed ? `/api/diagrams/${diagramId}/preview?v=${encodeURIComponent(version)}` : null;
  const width = naturalWidth ? Math.min(88, (naturalWidth / minWidth) * 100) : 88;
  return (
    <div className={cn("grid place-items-center overflow-hidden bg-paper", className)}>
      {src ? (
        <img
          src={src}
          alt=""
          className={cn("max-h-[84%] object-contain transition-opacity duration-150", naturalWidth ? "opacity-100" : "opacity-0")}
          style={{ width: `${width}%` }}
          onLoad={(e) => setNaturalWidth(e.currentTarget.naturalWidth || minWidth)}
          onError={() => setFailed(true)}
        />
      ) : (
        <MiniDiagram variant={seed} className="w-[70%] text-ink/25" />
      )}
    </div>
  );
}
