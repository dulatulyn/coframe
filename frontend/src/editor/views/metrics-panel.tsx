"use client";

import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";

import { service, type BpmnEditor } from "../modeler";
import { analyse, formatAmount, formatDuration, parseAmount, parseDuration, type Inputs } from "./metrics";
import { readNodes, scenarios, type FlowNode } from "./paths";
import { highlight, useDiagramVersion } from "./paths-panel";
import { ViewPanel } from "./view-panel";

type Element = any;

const TIMED = /Task$|^bpmn:SubProcess$|^bpmn:CallActivity$|^bpmn:IntermediateCatchEvent$|^bpmn:BoundaryEvent$/;
const OVERLAY = "coframe-metric";

function attr(element: Element, name: string): string {
  return element?.businessObject?.get?.(`coframe:${name}`) ?? "";
}

function readInputs(registry: Element): Inputs {
  const inputs: Inputs = { duration: new Map(), cost: new Map(), probability: new Map() };
  registry.forEach((element: Element) => {
    const duration = parseDuration(attr(element, "duration"));
    if (duration !== null) inputs.duration.set(element.id, duration);
    const cost = parseAmount(attr(element, "cost"));
    if (cost !== null) inputs.cost.set(element.id, cost);
    const probability = parseAmount(attr(element, "probability"));
    if (probability !== null) inputs.probability.set(element.id, Math.min(probability, 100) / 100);
  });
  return inputs;
}

function Field({
  value,
  placeholder,
  valid,
  readOnly,
  onCommit,
  className,
  label,
}: {
  value: string;
  placeholder: string;
  valid: (text: string) => boolean;
  readOnly: boolean;
  onCommit: (text: string) => void;
  className?: string;
  label: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? value;
  const ok = !text.trim() || valid(text);
  if (readOnly) return <span className={cn("text-right text-[13px] tabular-nums", className)}>{value || "—"}</span>;
  return (
    <input
      aria-label={label}
      value={text}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null && ok && draft.trim() !== value) onCommit(draft.trim());
        setDraft(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
      className={cn(
        "h-8 rounded-lg bg-fog px-2 text-right text-[13px] tabular-nums outline-none placeholder:text-slate-soft focus:ring-2 focus:ring-cobalt/30",
        !ok && "ring-2 ring-destructive/50",
        className,
      )}
    />
  );
}

export function MetricsPanel({ editor, readOnly }: { editor: BpmnEditor; readOnly: boolean }) {
  const version = useDiagramVersion(editor);
  const [hovered, setHovered] = useState<string | null>(null);

  const data = useMemo(() => {
    void version;
    const registry = service(editor, "elementRegistry");
    const nodes = readNodes(registry);
    const list = scenarios(nodes);
    const inputs = readInputs(registry);
    const analysis = analyse(nodes, list, inputs);
    const timed = registry
      .filter((e: Element) => TIMED.test(e.type) && nodes.has(e.id))
      .sort((a: Element, b: Element) => a.x - b.x || a.y - b.y);
    const choices = [...nodes.values()].filter(
      (n) => (n.type.endsWith("Gateway") && n.type !== "bpmn:ParallelGateway" && n.outgoing.length > 1) || n.boundaries.length > 0,
    );
    return { registry, nodes, inputs, analysis, timed, choices };
  }, [editor, version]);

  const { analysis, inputs, timed, choices, nodes, registry } = data;

  useEffect(() => {
    const overlays = service(editor, "overlays");
    overlays.remove({ type: OVERLAY });
    const max = Math.max(0, ...timed.map((e: Element) => inputs.duration.get(e.id) ?? 0));
    for (const element of timed) {
      const duration = inputs.duration.get(element.id);
      const cost = inputs.cost.get(element.id);
      if (duration === undefined && cost === undefined) continue;
      const heat = max > 0 && duration ? duration / max : 0;
      const html = document.createElement("div");
      html.className = "coframe-metric-badge";
      html.style.setProperty("--heat", String(heat));
      html.textContent = [duration !== undefined ? formatDuration(duration) : null, cost !== undefined ? formatAmount(cost) : null]
        .filter(Boolean)
        .join(" · ");
      overlays.add(element.id, OVERLAY, { position: element.type.endsWith("Event") ? { top: -20, left: -8 } : { bottom: 10, left: 0 }, html, show: { minZoom: 0.4 } });
    }
    return () => overlays.remove({ type: OVERLAY });
  }, [editor, timed, inputs]);

  useEffect(() => {
    const result = analysis.results.find((r) => r.scenario.id === hovered);
    highlight(editor, result ? result.scenario.elements : null);
  }, [editor, hovered, analysis]);

  useEffect(() => () => highlight(editor, null), [editor]);

  const update = (id: string, name: string, value: string) => {
    const element = registry.get(id);
    if (element) service(editor, "modeling").updateProperties(element, { [`coframe:${name}`]: value || undefined });
  };

  const top = [...analysis.results].sort((a, b) => b.probability - a.probability).slice(0, 6);
  const longest = analysis.results.reduce((m, r) => Math.max(m, r.duration), 0);
  const label = (n: FlowNode | undefined) => n?.name || n?.id || "";

  return (
    <ViewPanel title="Time & cost" subtitle="1d = 8 working hours. Durations take m, h, d or w; odds are in percent.">
      <div className="grid grid-cols-3 gap-2 px-2 pb-3">
        <Stat label="Expected time" value={formatDuration(analysis.duration)} />
        <Stat label="Expected cost" value={formatAmount(analysis.cost)} />
        <Stat label="Longest case" value={formatDuration(longest)} />
      </div>

      {top.length > 0 && (
        <Section title="Most likely scenarios">
          {top.map((r) => (
            <div
              key={r.scenario.id}
              onMouseEnter={() => setHovered(r.scenario.id)}
              onMouseLeave={() => setHovered(null)}
              className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-fog"
            >
              <span className="truncate">
                {r.scenario.decisions.length ? r.scenario.decisions.map((d) => d.answer).join(" · ") : "Main path"}
              </span>
              <span className="tabular-nums text-slate">{Math.round(r.probability * 100)}%</span>
              <span className="w-12 text-right tabular-nums">{formatDuration(r.duration)}</span>
              <span className="w-14 text-right tabular-nums text-slate">{formatAmount(r.cost)}</span>
            </div>
          ))}
        </Section>
      )}

      <Section title="Steps" aside={<span className="grid grid-cols-2 gap-2 text-right"><span className="w-20">Time</span><span className="w-20">Cost</span></span>}>
        {timed.map((element: Element) => (
          <div key={element.id} className="flex items-center gap-2 px-2 py-1">
            <span className="min-w-0 flex-1 truncate text-[13px]">{element.businessObject?.name || "Unnamed step"}</span>
            <Field
              label="Duration"
              className="w-20"
              value={attr(element, "duration")}
              placeholder="2h"
              readOnly={readOnly}
              valid={(t) => parseDuration(t) !== null}
              onCommit={(t) => update(element.id, "duration", t)}
            />
            <Field
              label="Cost"
              className="w-20"
              value={attr(element, "cost")}
              placeholder="0"
              readOnly={readOnly}
              valid={(t) => parseAmount(t) !== null}
              onCommit={(t) => update(element.id, "cost", t)}
            />
          </div>
        ))}
        {timed.length === 0 && <p className="px-2 py-1 text-[13px] text-slate">Add tasks to estimate time and cost.</p>}
      </Section>

      {choices.length > 0 && (
        <Section title="Branch odds">
          {choices.map((node) => {
            const options = node.boundaries.length
              ? [
                  { id: "", name: "Completes normally", editable: false },
                  ...node.boundaries.map((b) => ({ id: b.id, name: label(nodes.get(b.id)) || "Boundary event", editable: true })),
                ]
              : node.outgoing.map((f) => ({ id: f.id, name: f.name || label(nodes.get(f.target)), editable: true }));
            const fixed = options.filter((o) => o.id && inputs.probability.has(o.id));
            const rest = Math.max(0, 1 - fixed.reduce((s, o) => s + inputs.probability.get(o.id)!, 0));
            const share = options.length - fixed.length > 0 ? rest / (options.length - fixed.length) : 0;
            return (
              <div key={node.id} className="px-2 py-1.5">
                <p className="text-[13px] font-medium">{label(node)}</p>
                {options.map((o) => (
                  <div key={o.id || "normal"} className="flex items-center gap-2 py-0.5 pl-3">
                    <span className="min-w-0 flex-1 truncate text-[13px] text-slate">{o.name}</span>
                    {o.editable ? (
                      <Field
                        label="Probability"
                        className="w-16"
                        value={attr(registry.get(o.id), "probability")}
                        placeholder={`${Math.round(share * 100)}`}
                        readOnly={readOnly}
                        valid={(t) => {
                          const v = parseAmount(t);
                          return v !== null && v <= 100;
                        }}
                        onCommit={(t) => update(o.id, "probability", t)}
                      />
                    ) : (
                      <span className="w-16 pr-2 text-right text-[13px] tabular-nums text-slate">{Math.round(share * 100)}</span>
                    )}
                    <span className="text-[12px] text-slate">%</span>
                  </div>
                ))}
              </div>
            );
          })}
        </Section>
      )}
    </ViewPanel>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-fog px-3 py-2">
      <p className="text-[11px] text-slate">{label}</p>
      <p className="text-[17px] font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-t border-hairline py-2">
      <div className="flex items-center justify-between px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-slate">
        <span>{title}</span>
        {aside}
      </div>
      {children}
    </section>
  );
}
