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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type ToolId = "select" | "hand" | "lasso" | "space" | "connect";

export const TOOLS: { id: ToolId; label: string; key: string; icon: LucideIcon }[] = [
  { id: "select", label: "Select", key: "V", icon: MousePointer2 },
  { id: "hand", label: "Hand tool", key: "H", icon: Hand },
  { id: "lasso", label: "Lasso tool", key: "L", icon: LassoSelect },
  { id: "space", label: "Create/remove space", key: "S", icon: MoveHorizontal },
  { id: "connect", label: "Global connect", key: "C", icon: Spline },
];

function DockTip({
  label,
  keys,
  hidden,
  children,
}: {
  label: string;
  keys?: string;
  hidden?: boolean;
  children: React.ReactElement;
}) {
  return (
    <Tooltip open={hidden ? false : undefined}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" sideOffset={10}>
        {label}
        {keys && <span className="font-mono text-[11px] text-paper/60">{keys}</span>}
      </TooltipContent>
    </Tooltip>
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
  const bar = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const update = () => setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    el.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", update);
    };
  }, []);
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
      <div
        ref={bar}
        data-more={more || undefined}
        className="flex items-center gap-1 overflow-x-auto rounded-[22px] border border-hairline bg-paper p-1.5 shadow-float [scrollbar-width:none] data-more:[mask-image:linear-gradient(to_right,black_calc(100%-40px),transparent)] [&::-webkit-scrollbar]:hidden"
      >
        {TOOLS.map((tool) => (
          <DockTip key={tool.id} label={tool.label} keys={tool.key}>
            <button
              type="button"
              aria-label={tool.label}
              aria-pressed={activeTool === tool.id}
              onClick={(e) => onTool?.(tool.id, e.nativeEvent)}
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-2xl transition-colors 2xl:size-10",
                (tool.id === "lasso" || tool.id === "space") && "max-sm:hidden",
                activeTool === tool.id ? "bg-ink text-paper" : "text-ink hover:bg-fog",
              )}
            >
              <tool.icon className="size-[18px]" strokeWidth={1.75} />
            </button>
          </DockTip>
        ))}
        <span className="mx-1 h-6 w-px shrink-0 bg-hairline" />
        {CATALOG.map((group) => {
          const item = current(group);
          const expanded = open === group.id;
          return (
            <div key={group.id} className="relative shrink-0">
              <DockTip label={item.label} hidden={expanded}>
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
                    "grid size-9 place-items-center rounded-2xl transition-colors 2xl:size-10",
                    expanded ? "bg-fog" : "hover:bg-fog",
                  )}
                >
                  <Glyph kind={item.glyph} size={22} />
                </button>
              </DockTip>
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
        <span className="mx-1 h-6 w-px shrink-0 bg-hairline" />
        <DockTip label="All elements" keys="N">
          <button
            type="button"
            aria-label="All elements"
            onClick={(e) => {
              setOpen(undefined);
              onAllElements?.(e.nativeEvent);
            }}
            className="flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-2xl px-3 text-[13px] font-medium hover:bg-fog 2xl:h-10"
          >
            <Search className="size-4" strokeWidth={1.75} />
            <span className="hidden 2xl:inline">All elements</span>
            <span className="keycap max-sm:hidden">N</span>
          </button>
        </DockTip>
      </div>
    </div>
  );
}
