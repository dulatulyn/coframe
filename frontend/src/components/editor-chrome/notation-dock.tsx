"use client";

import {
  Check,
  ChevronUp,
  Hand,
  LassoSelect,
  MousePointer2,
  MoveHorizontal,
  Search,
  Spline,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { CATALOG, type CatalogGroup, type CatalogItem } from "@/components/bpmn/catalog";
import { Glyph } from "@/components/bpmn/glyphs";
import { cn } from "@/lib/utils";

export type ToolId = "select" | "hand" | "lasso" | "space" | "connect";

export const TOOLS: { id: ToolId; label: string; key: string; icon: LucideIcon }[] = [
  { id: "select", label: "Select", key: "V", icon: MousePointer2 },
  { id: "hand", label: "Hand tool", key: "H", icon: Hand },
  { id: "lasso", label: "Lasso tool", key: "L", icon: LassoSelect },
  { id: "space", label: "Create/remove space", key: "S", icon: MoveHorizontal },
  { id: "connect", label: "Global connect", key: "C", icon: Spline },
];

function Tip({ label, keys }: { label: string; keys?: string }) {
  return (
    <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 hidden -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-ink px-2.5 py-1 text-[12px] font-medium text-paper shadow-float group-hover/tip:inline-flex">
      {label}
      {keys && <span className="font-mono text-[11px] text-paper/60">{keys}</span>}
    </span>
  );
}

export function NotationFlyout({
  group,
  selectedId,
  onPick,
  className,
}: {
  group: CatalogGroup;
  selectedId?: string;
  onPick?: (item: CatalogItem, event: MouseEvent | DragEvent) => void;
  className?: string;
}) {
  return (
    <div role="menu" aria-label={group.label} className={cn("w-[280px] rounded-[20px] border border-hairline bg-paper p-2 shadow-pop", className)}>
      <div className="px-2 pb-1.5 pt-1 text-[12px] text-slate">{group.label}</div>
      <div className="flex flex-col gap-0.5">
        {group.items.map((item) => {
          const selected = item.id === selectedId;
          return (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              draggable
              onClick={(e) => onPick?.(item, e.nativeEvent)}
              onDragStart={(e) => onPick?.(item, e.nativeEvent)}
              className={cn(
                "flex h-11 items-center gap-3 rounded-xl px-2 text-left text-[14px] transition-colors hover:bg-fog",
                selected && "bg-fog",
              )}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-[11px] border border-hairline bg-paper">
                <Glyph kind={item.glyph} size={24} />
              </span>
              <span className="flex-1 truncate">{item.label}</span>
              {selected && (
                <span className="grid size-5 place-items-center rounded-full bg-ink text-paper">
                  <Check className="size-3" strokeWidth={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-1 border-t border-hairline px-2 pb-0.5 pt-2 text-[12px] text-slate">
        Drag onto the canvas or click to place
      </div>
    </div>
  );
}

export function NotationDock({
  activeTool = "select",
  openGroupId,
  onTool,
  onCreate,
  onAllElements,
  className,
  style,
}: {
  style?: React.CSSProperties;
  activeTool?: ToolId;
  openGroupId?: string;
  onTool?: (tool: ToolId, event: MouseEvent) => void;
  onCreate?: (item: CatalogItem, event: MouseEvent | DragEvent) => void;
  onAllElements?: (event: MouseEvent) => void;
  className?: string;
}) {
  const [open, setOpen] = useState<string | undefined>(openGroupId);
  const [lastUsed, setLastUsed] = useState<Record<string, string>>({});
  const root = useRef<HTMLDivElement>(null);
  const openGroup = CATALOG.find((g) => g.id === open);
  const current = (group: CatalogGroup) => group.items.find((i) => i.id === lastUsed[group.id]) ?? group.items[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(undefined);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(undefined);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (group: CatalogGroup, item: CatalogItem, event: MouseEvent | DragEvent) => {
    setLastUsed((prev) => ({ ...prev, [group.id]: item.id }));
    setOpen(undefined);
    onCreate?.(item, event);
  };

  return (
    <div ref={root} className={cn("relative", className)} style={style}>
      {openGroup && (
        <NotationFlyout
          group={openGroup}
          selectedId={current(openGroup).id}
          onPick={(item, event) => pick(openGroup, item, event)}
          className="absolute bottom-full left-1/2 mb-3 -translate-x-1/2"
        />
      )}
      <div className="flex items-center gap-1 rounded-[22px] border border-hairline bg-paper p-1.5 shadow-float">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            aria-label={tool.label}
            aria-pressed={activeTool === tool.id}
            onClick={(e) => onTool?.(tool.id, e.nativeEvent)}
            className={cn(
              "group/tip relative grid size-10 place-items-center rounded-2xl transition-colors",
              activeTool === tool.id ? "bg-ink text-paper" : "text-ink hover:bg-fog",
            )}
          >
            <tool.icon className="size-[18px]" strokeWidth={1.75} />
            <Tip label={tool.label} keys={tool.key} />
          </button>
        ))}
        <span className="mx-1 h-6 w-px bg-hairline" />
        {CATALOG.map((group) => {
          const item = current(group);
          const expanded = open === group.id;
          return (
            <div key={group.id} className="relative">
              <button
                type="button"
                draggable
                aria-label={item.label}
                onClick={(e) => pick(group, item, e.nativeEvent)}
                onDragStart={(e) => pick(group, item, e.nativeEvent)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setOpen(expanded ? undefined : group.id);
                }}
                className={cn(
                  "group/tip relative grid size-10 place-items-center rounded-2xl transition-colors",
                  expanded ? "bg-fog" : "hover:bg-fog",
                )}
              >
                <Glyph kind={item.glyph} size={22} />
                {!expanded && <Tip label={item.label} />}
              </button>
              <button
                type="button"
                aria-label={`${group.label} types`}
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? undefined : group.id)}
                className={cn(
                  "absolute bottom-0 right-0 grid size-[18px] place-items-center rounded-full text-slate-soft transition-colors hover:bg-fog-strong hover:text-ink",
                  expanded && "text-ink",
                )}
              >
                <ChevronUp className="size-3" strokeWidth={2.5} />
              </button>
            </div>
          );
        })}
        <span className="mx-1 h-6 w-px bg-hairline" />
        <button
          type="button"
          aria-label="All elements"
          onClick={(e) => {
            setOpen(undefined);
            onAllElements?.(e.nativeEvent);
          }}
          className="group/tip relative flex h-10 items-center gap-2 whitespace-nowrap rounded-2xl px-3 text-[13px] font-medium hover:bg-fog"
        >
          <Search className="size-4" strokeWidth={1.75} />
          <span className="hidden 2xl:inline">All elements</span>
          <span className="keycap">N</span>
          <span className="2xl:hidden">
            <Tip label="All elements" keys="N" />
          </span>
        </button>
      </div>
    </div>
  );
}

export function NotationRibbon({ activeTool = "select", className }: { activeTool?: ToolId; className?: string }) {
  const inline: { label: string; ids: [string, number][] }[] = [
    { label: "Events", ids: [["start", 1], ["intermediate", 1], ["end", 1]] },
    { label: "Gateways", ids: [["gateway", 2]] },
    { label: "Activities", ids: [["task", 2], ["subprocess", 1]] },
    { label: "Data", ids: [["data", 1]] },
    { label: "Pools", ids: [["participant", 1]] },
    { label: "Notes", ids: [["artifact", 1]] },
  ];
  return (
    <div
      className={cn(
        "flex items-end gap-2.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <span className="px-1 text-[11px] text-slate">Tools</span>
        <div className="flex items-center gap-0.5 rounded-2xl bg-fog p-1">
          {TOOLS.map((tool) => (
            <button
              key={tool.id}
              type="button"
              aria-label={tool.label}
              className={cn(
                "group/tip relative grid size-9 place-items-center rounded-xl transition-colors",
                activeTool === tool.id ? "bg-paper shadow-sm" : "text-ink/80 hover:bg-paper/70",
              )}
            >
              <tool.icon className="size-[17px]" strokeWidth={1.75} />
              <Tip label={tool.label} keys={tool.key} />
            </button>
          ))}
        </div>
      </div>
      {inline.map((section) => (
        <div key={section.label} className="flex flex-col gap-1">
          <span className="px-1 text-[11px] text-slate">{section.label}</span>
          <div className="flex items-center gap-0.5 rounded-2xl bg-fog p-1">
            {section.ids.flatMap(([id, count]) =>
              CATALOG.find((g) => g.id === id)!
                .items.slice(0, count)
                .map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-label={item.label}
                    className="group/tip relative grid size-9 shrink-0 place-items-center rounded-xl text-ink hover:bg-paper"
                  >
                    <Glyph kind={item.glyph} size={21} />
                    <Tip label={item.label} />
                  </button>
                )),
            )}
          </div>
        </div>
      ))}
      <button
        type="button"
        aria-label="All elements"
        className="group/tip relative ml-auto flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-2xl border border-hairline px-3 text-[13px] font-medium hover:bg-fog"
      >
        <Search className="size-4" strokeWidth={1.75} />
        <span className="keycap">N</span>
        <Tip label="All elements" keys="N" />
      </button>
    </div>
  );
}
