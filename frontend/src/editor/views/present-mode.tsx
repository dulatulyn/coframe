"use client";

import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { service, type BpmnEditor } from "../modeler";
import { parseDmn, pickDecision } from "@/lib/dmn";

import { DecisionTableView } from "../dmn/decision-table-view";
import { useDiagramXml } from "../dmn/dmn-workspace";
import { isRuleTask, linkedDecisionId } from "../dmn/link";
import { describe } from "../ui/element-info";
import { formatAmount, formatDuration, parseAmount, parseDuration } from "./metrics";
import { readNodes, type FlowNode } from "./paths";
import { highlight } from "./paths-panel";

type Element = any;

export function presentationOrder(nodes: Map<string, FlowNode>, position: (id: string) => { x: number; y: number }): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  const hostOf = new Map<string, string>();
  for (const node of nodes.values()) for (const b of node.boundaries) hostOf.set(b.id, node.id);
  const byPosition = (a: string, b: string) => position(a).x - position(b).x || position(a).y - position(b).y;
  const queue = [...nodes.values()].filter((n) => n.type === "bpmn:StartEvent").map((n) => n.id).sort(byPosition);
  const visit = () => {
    while (queue.length) {
      const id = queue.shift()!;
      if (seen.has(id) || !nodes.has(id)) continue;
      seen.add(id);
      order.push(id);
      const node = nodes.get(id)!;
      const next = [...node.outgoing.map((f) => f.target), ...node.boundaries.map((b) => b.id)].sort(byPosition);
      queue.push(...next);
    }
  };
  visit();
  for (const id of [...nodes.keys()].sort(byPosition)) {
    if (seen.has(id)) continue;
    queue.push(id);
    visit();
  }
  return order;
}

const CARD_SPACE = 240;

function center(editor: BpmnEditor, element: Element | null) {
  const canvas = service(editor, "canvas");
  if (!element) {
    const container = canvas.getContainer() as HTMLElement;
    const inner = canvas.viewbox().inner;
    const room = { width: container.clientWidth, height: Math.max(200, container.clientHeight - CARD_SPACE) };
    const scale = Math.min(1, (room.width / inner.width) * 0.92, (room.height / inner.height) * 0.92);
    canvas.viewbox({
      x: inner.x - (room.width / scale - inner.width) / 2,
      y: inner.y - (room.height / scale - inner.height) / 2,
      width: container.clientWidth / scale,
      height: container.clientHeight / scale,
    });
    return;
  }
  const vb = canvas.viewbox();
  const container = canvas.getContainer() as HTMLElement;
  const scale = Math.min(1.4, Math.max(0.8, vb.scale));
  const width = container.clientWidth / scale;
  const height = container.clientHeight / scale;
  const cx = element.x + element.width / 2;
  const cy = element.y + element.height / 2 + height * 0.12;
  canvas.viewbox({ x: cx - width / 2, y: cy - height / 2, width, height });
}

function roleOf(editor: BpmnEditor, element: Element): string | null {
  const bo = element?.businessObject;
  const lane = service(editor, "elementRegistry")
    .filter((e: Element) => e.type === "bpmn:Lane")
    .find((e: Element) => (e.businessObject?.flowNodeRef ?? []).includes(bo));
  if (lane?.businessObject?.name) return lane.businessObject.name;
  let parent = element?.parent;
  while (parent) {
    if (parent.type === "bpmn:Participant") return parent.businessObject?.name || null;
    parent = parent.parent;
  }
  return null;
}

function StepDecision({ tableId, taskName, known }: { tableId: string; taskName: string; known?: string }) {
  const fetched = useDiagramXml(known === undefined ? tableId : null);
  const xml = known ?? fetched.data ?? null;
  const decision = useMemo(() => (xml ? pickDecision(parseDmn(xml), taskName) : null), [xml, taskName]);
  if (!decision) return null;
  return (
    <div className="mt-3 max-h-56 overflow-y-auto">
      <DecisionTableView decision={decision} compact />
    </div>
  );
}

export function PresentMode({
  editor,
  title,
  onExit,
  decisions,
}: {
  editor: BpmnEditor;
  title: string;
  onExit: () => void;
  decisions?: Map<string, { name: string; xml: string }>;
}) {
  const [index, setIndex] = useState(0);

  const steps = useMemo(() => {
    const registry = service(editor, "elementRegistry");
    const nodes = readNodes(registry);
    const position = (id: string) => registry.get(id) ?? { x: 0, y: 0 };
    return presentationOrder(nodes, position).map((id) => ({ element: registry.get(id), node: nodes.get(id)! }));
  }, [editor]);

  const total = steps.length + 1;
  const go = useCallback((next: number) => setIndex(Math.max(0, Math.min(total - 1, next))), [total]);
  const step = index > 0 ? steps[index - 1] : null;

  useEffect(() => {
    const canvas = service(editor, "canvas");
    canvas.resized();
    if (!step) {
      highlight(editor, null);
      center(editor, null);
      return;
    }
    highlight(editor, [step.element.id, ...step.node.outgoing.map((f) => f.id), ...step.node.boundaries.map((b) => b.id)]);
    center(editor, step.element);
  }, [editor, step]);

  useEffect(
    () => () => {
      highlight(editor, null);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      requestAnimationFrame(() => service(editor, "canvas").resized());
    },
    [editor],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) {
        e.preventDefault();
        go(index + 1);
      } else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) {
        e.preventDefault();
        go(index - 1);
      } else if (e.key === "Home") go(0);
      else if (e.key === "End") go(total - 1);
      else if (e.key === "f" || e.key === "F") toggleFullscreen();
      else if (e.key === "Escape" && !document.fullscreenElement) onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index, total, onExit]);

  const bo = step?.element?.businessObject;
  const documentation = bo?.documentation?.[0]?.text?.trim();
  const duration = parseDuration(bo?.get?.("coframe:duration"));
  const cost = parseAmount(bo?.get?.("coframe:cost"));
  const branches = step && step.node.outgoing.length > 1 ? step.node.outgoing : [];
  const role = step ? roleOf(editor, step.element) : null;
  const nodesById = new Map(steps.map((s) => [s.node.id, s.node]));

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center p-4 sm:p-6">
      <div className="pointer-events-auto w-full max-w-2xl rounded-[24px] border border-hairline bg-paper/95 p-4 shadow-pop backdrop-blur sm:p-5">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            {step ? (
              <>
                <p className="text-[12px] font-medium uppercase tracking-wide text-slate">
                  {describe(step.element).label}
                  {role ? ` · ${role}` : ""}
                </p>
                <h2 className="mt-1 text-[22px] font-semibold leading-7 tracking-tight">{bo?.name || "Unnamed"}</h2>
                {documentation && <p className="mt-2 whitespace-pre-wrap text-[15px] leading-6 text-slate">{documentation}</p>}
                {branches.length > 0 && (
                  <ul className="mt-2 space-y-1 text-[15px] leading-6">
                    {branches.map((f) => (
                      <li key={f.id} className="flex gap-2">
                        <span className="text-slate">→</span>
                        <span>
                          {f.name ? <strong className="font-semibold">{f.name}: </strong> : null}
                          {nodesById.get(f.target)?.name || "next step"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {isRuleTask(step.element) && linkedDecisionId(step.element) && (
                  <StepDecision
                    key={linkedDecisionId(step.element)!}
                    tableId={linkedDecisionId(step.element)!}
                    taskName={bo?.name ?? ""}
                    known={decisions ? decisions.get(linkedDecisionId(step.element)!)?.xml ?? "" : undefined}
                  />
                )}
                {(duration !== null || cost !== null) && (
                  <p className="mt-2 text-[13px] text-slate">
                    {[duration !== null ? `Takes ${formatDuration(duration)}` : null, cost !== null ? `costs ${formatAmount(cost)}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-[12px] font-medium uppercase tracking-wide text-slate">Process overview</p>
                <h2 className="mt-1 text-[22px] font-semibold leading-7 tracking-tight">{title}</h2>
                <p className="mt-2 text-[15px] leading-6 text-slate">
                  {steps.length} steps. Press → or Space to walk through them.
                </p>
              </>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" aria-label="Full screen (F)" onClick={toggleFullscreen} className="grid size-9 place-items-center rounded-full hover:bg-fog">
              <Expand className="size-4" />
            </button>
            <button type="button" aria-label="End presentation" onClick={onExit} className="grid size-9 place-items-center rounded-full hover:bg-fog">
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            aria-label="Previous step"
            disabled={index === 0}
            onClick={() => go(index - 1)}
            className="grid size-10 place-items-center rounded-full bg-fog hover:bg-fog-strong disabled:opacity-40"
          >
            <ChevronLeft className="size-5" />
          </button>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-fog">
            <div className="h-full rounded-full bg-ink transition-[width] duration-300" style={{ width: `${(index / Math.max(1, total - 1)) * 100}%` }} />
          </div>
          <span className="w-14 text-center font-mono text-[12px] text-slate">
            {index}/{total - 1}
          </span>
          <button
            type="button"
            aria-label="Next step"
            disabled={index === total - 1}
            onClick={() => go(index + 1)}
            className="grid size-10 place-items-center rounded-full bg-ink text-paper hover:bg-ink/85 disabled:opacity-40"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  else void document.documentElement.requestFullscreen?.().catch(() => {});
}
