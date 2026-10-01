"use client";

import { CircleAlert, Flag, Repeat } from "lucide-react";
import { useEffect, useMemo, useReducer, useState } from "react";

import { cn } from "@/lib/utils";

import { service, type BpmnEditor } from "../modeler";
import { MAX_SCENARIOS, readNodes, scenarios, type Scenario } from "./paths";
import { ViewPanel } from "./view-panel";

const PATH_MARKER = "coframe-path";
const DIM_CLASS = "coframe-dim";

type Element = any;

export function useDiagramVersion(editor: BpmnEditor): number {
  const [version, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const eventBus = service(editor, "eventBus");
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onChange = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(bump, 300);
    };
    eventBus.on("elements.changed", onChange);
    eventBus.on("import.done", onChange);
    return () => {
      if (timer) clearTimeout(timer);
      eventBus.off("elements.changed", onChange);
      eventBus.off("import.done", onChange);
    };
  }, [editor]);
  return version;
}

export function highlight(editor: BpmnEditor, ids: string[] | null) {
  const canvas = service(editor, "canvas");
  const registry = service(editor, "elementRegistry");
  const container = canvas.getContainer() as HTMLElement;
  registry.forEach((element: Element) => canvas.removeMarker(element, PATH_MARKER));
  container.classList.toggle(DIM_CLASS, !!ids);
  if (!ids) return;
  const keep = new Set(ids);
  registry.forEach((element: Element) => {
    const owner = element.type === "label" ? element.labelTarget : element;
    if (!owner) return;
    if (keep.has(owner.id) || owner.type === "bpmn:Participant" || owner.type === "bpmn:Lane") canvas.addMarker(element, PATH_MARKER);
  });
}

function title(scenario: Scenario) {
  if (!scenario.decisions.length) return "Main path";
  return scenario.decisions.map((d) => `${d.question} → ${d.answer}`).join(" · ");
}

export function PathsPanel({ editor }: { editor: BpmnEditor }) {
  const version = useDiagramVersion(editor);
  const [activeId, setActiveId] = useState<string | null>(null);

  const { list, pools } = useMemo(() => {
    void version;
    const registry = service(editor, "elementRegistry");
    const names = new Map<string, string>();
    registry.filter((e: Element) => e.type === "bpmn:Participant").forEach((p: Element) => names.set(p.id, p.businessObject?.name || "Pool"));
    return { list: scenarios(readNodes(registry)), pools: names };
  }, [editor, version]);

  const active = list.find((s) => s.id === activeId) ?? list[0] ?? null;

  useEffect(() => {
    highlight(editor, active ? active.elements : null);
  }, [editor, active]);

  useEffect(() => () => highlight(editor, null), [editor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!list.length || !["ArrowDown", "ArrowUp"].includes(e.key)) return;
      if ((e.target as HTMLElement).closest("input, textarea")) return;
      e.preventDefault();
      const index = Math.max(0, list.findIndex((s) => s.id === active?.id));
      const next = (index + (e.key === "ArrowDown" ? 1 : list.length - 1)) % list.length;
      setActiveId(list[next].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [list, active]);

  const multiplePools = new Set(list.map((s) => s.pool)).size > 1;

  return (
    <ViewPanel
      title={`${list.length}${list.length >= MAX_SCENARIOS ? "+" : ""} ${list.length === 1 ? "scenario" : "scenarios"}`}
      subtitle="Each scenario is one combination of decisions and outcomes. ↑ ↓ to switch."
    >
      {list.length === 0 && <p className="px-2 py-3 text-[13px] text-slate">Add a start event to see the paths through the process.</p>}
      <div className="space-y-1">
        {list.map((scenario, i) => {
          const showPool = multiplePools && (i === 0 || list[i - 1].pool !== scenario.pool);
          return (
            <div key={scenario.id}>
              {showPool && (
                <p className="px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-slate">
                  {(scenario.pool && pools.get(scenario.pool)) || "Process"}
                </p>
              )}
              <button
                type="button"
                onClick={() => setActiveId(scenario.id)}
                className={cn(
                  "w-full rounded-xl px-2.5 py-2 text-left transition-colors",
                  active?.id === scenario.id ? "bg-ink text-paper" : "hover:bg-fog",
                )}
              >
                <span className="block text-[13px] font-medium leading-5">{title(scenario)}</span>
                <span
                  className={cn(
                    "mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] leading-4",
                    active?.id === scenario.id ? "text-paper/70" : "text-slate",
                  )}
                >
                  <span>
                    {scenario.steps} {scenario.steps === 1 ? "step" : "steps"}
                  </span>
                  {scenario.ends.length > 0 && (
                    <span className="flex items-center gap-1">
                      <Flag className="size-3" /> {scenario.ends.map((e) => e.name || e.id).join(", ")}
                    </span>
                  )}
                  {scenario.loops && (
                    <span className="flex items-center gap-1">
                      <Repeat className="size-3" /> loops back
                    </span>
                  )}
                  {scenario.stuck.length > 0 && (
                    <span className={cn("flex items-center gap-1", active?.id !== scenario.id && "text-destructive")}>
                      <CircleAlert className="size-3" /> stops without an end
                    </span>
                  )}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </ViewPanel>
  );
}
