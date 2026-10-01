"use client";

import { Loader2, Network, PanelLeft } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { DiagramThumb } from "@/components/app/diagram-thumb";
import { useProcessMap, useTree } from "@/lib/api/hooks";
import type { ProcessMap as MapData } from "@/lib/api/types";
import { useFilesPanel } from "@/lib/panels";
import { cn } from "@/lib/utils";

const CARD_W = 220;
const CARD_H = 150;
const GAP_X = 120;
const GAP_Y = 56;
const PAD = 48;

type Placed = { id: string; name: string; preview: string | null; x: number; y: number; level: number };

export function layoutMap(data: MapData): { cards: Placed[]; width: number; height: number } {
  const callers = new Map<string, string[]>();
  const callees = new Map<string, string[]>();
  for (const link of data.links) {
    callers.set(link.target, [...(callers.get(link.target) ?? []), link.source]);
    callees.set(link.source, [...(callees.get(link.source) ?? []), link.target]);
  }
  const level = new Map<string, number>();
  const depth = (id: string, seen: Set<string>): number => {
    if (level.has(id)) return level.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const value = Math.max(-1, ...(callers.get(id) ?? []).map((c) => depth(c, seen))) + 1;
    seen.delete(id);
    level.set(id, value);
    return value;
  };
  const linked = data.diagrams.filter((d) => callers.has(d.id) || callees.has(d.id));
  const loose = data.diagrams.filter((d) => !callers.has(d.id) && !callees.has(d.id));
  linked.forEach((d) => depth(d.id, new Set()));
  const columns = new Map<number, typeof linked>();
  for (const d of linked) columns.set(level.get(d.id)!, [...(columns.get(level.get(d.id)!) ?? []), d]);
  const cards: Placed[] = [];
  let tallest = 0;
  for (const [col, list] of [...columns.entries()].sort((a, b) => a[0] - b[0])) {
    list.forEach((d, row) =>
      cards.push({ id: d.id, name: d.name, preview: d.previewUpdatedAt, level: col, x: PAD + col * (CARD_W + GAP_X), y: PAD + row * (CARD_H + GAP_Y) }),
    );
    tallest = Math.max(tallest, list.length);
  }
  const looseTop = PAD + tallest * (CARD_H + GAP_Y) + (linked.length ? GAP_Y : 0);
  const perRow = Math.max(4, columns.size);
  loose.forEach((d, i) =>
    cards.push({
      id: d.id,
      name: d.name,
      preview: d.previewUpdatedAt,
      level: -1,
      x: PAD + (i % perRow) * (CARD_W + 32),
      y: looseTop + Math.floor(i / perRow) * (CARD_H + 32),
    }),
  );
  const width = Math.max(...cards.map((c) => c.x + CARD_W), 0) + PAD;
  const height = Math.max(...cards.map((c) => c.y + CARD_H), 0) + PAD;
  return { cards, width, height };
}

export function ProcessMap({ projectId }: { projectId: string }) {
  const { data, isLoading } = useProcessMap(projectId);
  const { data: tree } = useTree(projectId);
  const files = useFilesPanel();
  const layout = useMemo(() => (data ? layoutMap(data) : null), [data]);
  const byId = new Map(layout?.cards.map((c) => [c.id, c]) ?? []);
  const hasLinks = (data?.links.length ?? 0) > 0;

  return (
    <div className={cn("dot-grid absolute inset-0 overflow-auto", files.wide && files.open && "lg:pl-[316px]")}>
      <div className="sticky left-0 top-0 z-20 flex items-center gap-2 p-3 sm:p-4">
        <div className="flex h-12 items-center gap-2 rounded-full border border-hairline bg-paper pl-1.5 pr-4 shadow-float">
          {!files.open && (
            <button type="button" aria-label="Show files" onClick={() => files.setOpen(true)} className="grid size-9 place-items-center rounded-full bg-fog hover:bg-fog-strong">
              <PanelLeft className="size-[18px]" strokeWidth={1.75} />
            </button>
          )}
          <Network className={cn("size-4", files.open && "ml-2.5")} />
          <span className="text-[14px] font-semibold">Process map</span>
          <span className="text-[13px] text-slate">· {tree?.project.name}</span>
        </div>
      </div>

      {isLoading && (
        <div className="grid h-64 place-items-center text-slate">
          <Loader2 className="size-5 animate-spin" />
        </div>
      )}

      {layout && (
        <div className="px-3 pb-10 sm:px-4">
          {!hasLinks && (
            <p className="mb-2 max-w-xl px-1 text-[14px] leading-6 text-slate">
              Link diagrams to see how processes depend on each other: select a call activity and choose the diagram it
              calls under “Calls diagram” in its properties.
            </p>
          )}
          <div className="relative" style={{ width: layout.width, height: layout.height }}>
            <svg className="pointer-events-none absolute inset-0" width={layout.width} height={layout.height}>
              <defs>
                <marker id="map-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill="#3e63dd" />
                </marker>
              </defs>
              {data!.links.map((link, i) => {
                const a = byId.get(link.source);
                const b = byId.get(link.target);
                if (!a || !b) return null;
                const x1 = a.x + CARD_W;
                const y1 = a.y + CARD_H / 2;
                const backwards = b.x <= a.x;
                const x2 = backwards ? b.x + CARD_W / 2 : b.x;
                const y2 = backwards ? b.y : b.y + CARD_H / 2;
                const bend = Math.max(60, Math.abs(x2 - x1) / 2);
                const d = backwards
                  ? `M${x1},${y1} C${x1 + 80},${y1} ${x2},${y2 - 80} ${x2},${y2}`
                  : `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`;
                return (
                  <g key={i}>
                    <path d={d} fill="none" stroke="#3e63dd" strokeWidth={2} strokeDasharray={link.kind === "decision" ? "6 4" : undefined} markerEnd="url(#map-arrow)" />
                    {link.label && (
                      <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 8} textAnchor="middle" className="fill-[#3e63dd] text-[11px] font-medium">
                        {link.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
            {layout.cards.map((card) => (
              <Link
                key={card.id}
                href={`/p/${projectId}/${card.id}`}
                className="absolute flex flex-col overflow-hidden rounded-2xl border border-hairline bg-paper shadow-float transition-transform hover:-translate-y-0.5 hover:shadow-pop"
                style={{ left: card.x, top: card.y, width: CARD_W, height: CARD_H }}
              >
                <div className="min-h-0 flex-1 bg-canvas">
                  <DiagramThumb diagramId={card.id} version={card.preview} minWidth={CARD_W} className="size-full" />
                </div>
                <div className="truncate border-t border-hairline px-3 py-2 text-[13px] font-medium">{card.name}</div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
