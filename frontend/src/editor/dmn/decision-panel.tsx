"use client";

import { AlertTriangle, ArrowRight, Check, ExternalLink, FlaskConical, Pencil, Plus, Split, Table2, Tag, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { DiagramMeta } from "@/lib/api/types";
import { chainInputs, evaluateChain, linkedDecision, outputKey, parseDmn, primaryOutput, type Decision } from "@/lib/dmn";
import { cn } from "@/lib/utils";

import { applyOps, focusElements } from "../ai/apply";
import { service, type BpmnEditor } from "../modeler";
import { DecisionTableView } from "./decision-table-view";
import { DmnWorkspace, useDiagramXml } from "./dmn-workspace";
import { addBranchOps, addGatewayOps, branchValues, consistency, labelOps, linkedDecisionRef } from "./link";

type Element = any;

function targetName(flow: Element): string {
  return flow?.target?.businessObject?.name || flow?.target?.type?.replace("bpmn:", "") || "next step";
}

export function DecisionPanel({
  editor,
  taskId,
  table,
  projectId,
  readOnly,
  version,
  onClose,
  className,
}: {
  editor: BpmnEditor;
  taskId: string;
  table: DiagramMeta | null;
  projectId: string;
  readOnly: boolean;
  version: number;
  onClose: () => void;
  className?: string;
}) {
  const [tab, setTab] = useState<"edit" | "try">("edit");
  const [liveXml, setLiveXml] = useState<string | null>(null);
  const [labeling, setLabeling] = useState<Record<string, string> | null>(null);
  const stored = useDiagramXml(table?.id ?? null);
  const xml = liveXml ?? stored.data ?? null;
  const task = service(editor, "elementRegistry").get(taskId);
  const taskName: string = task?.businessObject?.name ?? "";
  const ref = task ? linkedDecisionRef(task) : null;

  const decisions = useMemo(() => (xml ? parseDmn(xml) : []), [xml]);
  const decision: Decision | null = useMemo(() => linkedDecision(decisions, taskName, ref), [decisions, taskName, ref]);
  const status = useMemo(() => {
    void version;
    return task ? consistency(task, decision) : null;
  }, [task, decision, version]);
  const output = decision ? primaryOutput(decision) : null;

  if (!task || !table) {
    return (
      <aside className={cn("flex flex-col items-center justify-center gap-3 p-6 text-center", className)}>
        <p className="text-[14px] text-slate">This decision table is no longer available.</p>
        <Button variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      </aside>
    );
  }

  const apply = (ops: Parameters<typeof applyOps>[1], title: string) => {
    if (!ops.length) return;
    applyOps(editor, ops, title);
    service(editor, "selection").select([]);
  };

  const unused = (status?.values ?? []).filter((v) => !v.flow).map((v) => v.value);

  return (
    <aside data-decision-panel className={cn("flex flex-col overflow-hidden", className)}>
      <header className="flex items-start gap-3 border-b border-hairline px-4 py-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-fog">
          <Table2 className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{decisions.length > 1 && decision ? decision.name || decision.id : table.name}</p>
          <p className="truncate text-[12px] text-slate">
            {decisions.length > 1 ? `In “${table.name}”, used by “${taskName || "business rule task"}”` : `Decision table of “${taskName || "business rule task"}”`}
          </p>
        </div>
        <Button asChild variant="ghost" size="sm" className="h-8">
          <Link href={`/p/${projectId}/${table.id}`}>
            <ExternalLink /> Open as file
          </Link>
        </Button>
        <button type="button" aria-label="Close decision table" onClick={onClose} className="grid size-8 place-items-center rounded-full hover:bg-fog">
          <X className="size-4" />
        </button>
      </header>

      {ref && xml && !decision && (
        <p className="flex items-center gap-1.5 border-b border-hairline px-4 py-3 text-[13px] text-[#8a5a00]">
          <AlertTriangle className="size-3.5 shrink-0" /> The decision this task uses was removed from “{table.name}”. Pick another one in the
          task&apos;s properties.
        </p>
      )}

      {status && output && (
        <section className="space-y-2 border-b border-hairline px-4 py-3 text-[13px]">
          {status.gateway ? (
            <>
              <p className="flex items-center gap-1.5 text-slate">
                <Split className="size-3.5" /> Routes at{" "}
                <button type="button" className="font-medium text-ink hover:underline" onClick={() => focusElements(editor, [status.gateway.id])}>
                  {status.gateway.businessObject?.name || "the decision gateway"}
                </button>
                <span>by {output.label || output.name || "the result"}</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {status.values.map(({ value, flow }) => (
                  <span
                    key={value}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-2.5 py-1",
                      flow ? "bg-[#30a46c]/12 text-[#1d6b44]" : "bg-[#f5a524]/18 text-[#8a5a00]",
                    )}
                  >
                    {flow ? <Check className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
                    <span className="font-medium">{value}</span>
                    {flow ? (
                      <>
                        <ArrowRight className="size-3" /> {targetName(flow)}
                      </>
                    ) : (
                      !readOnly && (
                        <button
                          type="button"
                          onClick={() => apply(addBranchOps(status.gateway, value), `Add a branch for “${value}”`)}
                          className="ml-0.5 flex items-center gap-1 rounded-full bg-paper px-2 py-0.5 text-[12px] font-medium text-ink hover:bg-fog"
                        >
                          <Plus className="size-3" /> Add branch
                        </button>
                      )
                    )}
                  </span>
                ))}
                {!output.complete && <span className="px-1 py-1 text-[12px] text-slate">Some results are formulas, so the list may be incomplete.</span>}
              </div>
              {status.impossible.map((flow) => (
                <p key={flow.id} className="flex items-center gap-1.5 text-[#8a5a00]">
                  <AlertTriangle className="size-3.5 shrink-0" /> The branch “{branchValues(flow)[0]}” can never happen: the table
                  doesn&apos;t return it.
                </p>
              ))}
              {!readOnly && status.unlabeled.length > 0 && !labeling && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() =>
                    setLabeling(Object.fromEntries(status.unlabeled.map((flow, i) => [flow.id, unused[i] ?? ""])))
                  }
                >
                  <Tag /> Label {status.unlabeled.length} unlabeled {status.unlabeled.length === 1 ? "branch" : "branches"}
                </Button>
              )}
              {labeling && (
                <div className="space-y-1.5 rounded-2xl bg-fog p-2.5">
                  {status.unlabeled.map((flow) => (
                    <label key={flow.id} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate">Branch to {targetName(flow)}</span>
                      <select
                        value={labeling[flow.id] ?? ""}
                        onChange={(e) => setLabeling({ ...labeling, [flow.id]: e.target.value })}
                        className="h-8 rounded-lg bg-paper px-2 text-[13px] outline-none"
                      >
                        <option value="">Leave unlabeled</option>
                        {output.values.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  <div className="flex justify-end gap-1.5 pt-1">
                    <Button size="sm" variant="ghost" onClick={() => setLabeling(null)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        const registry = service(editor, "elementRegistry");
                        const assignments = Object.entries(labeling)
                          .filter(([, value]) => value)
                          .map(([id, value]) => ({ flow: registry.get(id), value }))
                          .filter((a) => a.flow);
                        apply(labelOps(assignments), "Label branches from the decision table");
                        setLabeling(null);
                      }}
                    >
                      Apply
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : status.routable ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 text-slate">
                The table returns {output.values.join(", ")}, but the process continues the same way after this task.
              </p>
              {!readOnly && decision && (
                <Button size="sm" variant="outline" className="h-8" onClick={() => apply(addGatewayOps(task, decision), "Route by the decision")}>
                  <Split /> Add decision gateway
                </Button>
              )}
            </div>
          ) : null}
        </section>
      )}

      <div className="mx-4 mt-3 grid w-fit grid-cols-2 rounded-full bg-fog p-1 text-[13px] font-medium">
        {(
          [
            ["edit", "Table", Pencil],
            ["try", "Try it", FlaskConical],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5", tab === id ? "bg-paper shadow-sm" : "text-slate hover:text-ink")}
          >
            <Icon className="size-3.5" /> {label}
          </button>
        ))}
      </div>

      <div className={cn("min-h-0 flex-1", tab === "edit" ? "flex" : "hidden")}>
        <DmnWorkspace diagramId={table.id} readOnly={readOnly} onXml={setLiveXml} focus={decision?.id ?? null} className="mt-2 flex-1" />
      </div>
      {tab === "try" && decision && <TryIt decisions={decisions} decision={decision} task={task} />}
    </aside>
  );
}

function show(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function TryIt({ decisions, decision, task }: { decisions: Decision[]; decision: Decision; task: Element }) {
  const inputs = useMemo(() => chainInputs(decisions, decision), [decisions, decision]);
  const [values, setValues] = useState<Record<string, string>>({});
  const chain = useMemo(() => evaluateChain(decisions, decision, values), [decisions, decision, values]);
  const result = chain.result;
  const steps = chain.steps.slice(0, -1);
  const output = primaryOutput(decision);
  const status = consistency(task, decision);
  const first = result.results[0];
  const value = output && first ? String(first[outputKey(decision, output)] ?? "") : "";
  const branch = status.values.find((v) => v.value === value)?.flow;

  if (decision.kind !== "table") {
    return <p className="px-4 py-3 text-[13px] text-slate">Trying works for decision tables.</p>;
  }
  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {inputs.map((input) => (
          <label key={input.key} className="flex flex-col gap-1 text-[12px] font-medium text-slate">
            {input.label}
            {input.typeRef && <span className="font-normal">{input.typeRef}</span>}
            <input
              value={values[input.key] ?? ""}
              onChange={(e) => setValues({ ...values, [input.key]: e.target.value })}
              placeholder={input.typeRef === "number" ? "e.g. 1500" : input.typeRef === "boolean" ? "true / false" : "value"}
              className="h-9 rounded-xl bg-fog px-3 text-[14px] font-normal text-ink outline-none focus:ring-2 focus:ring-cobalt/30"
            />
          </label>
        ))}
      </div>
      {steps.length > 0 && (
        <ol className="space-y-1 rounded-2xl border border-hairline px-3 py-2.5 text-[13px]">
          <li className="text-[12px] font-medium text-slate">Decided first</li>
          {steps.map((step) => (
            <li key={step.decision.id} className="flex flex-wrap items-center gap-1.5">
              <span className="font-medium">{step.decision.name || step.decision.id}</span>
              <ArrowRight className="size-3 text-slate" />
              {step.evaluation.results.length ? (
                <span className="font-mono text-[12.5px]">{show(step.value)}</span>
              ) : (
                <span className="text-[#8a5a00]">no result</span>
              )}
              {step.evaluation.matched.length > 0 && <span className="text-slate">rule {step.evaluation.matched[0] + 1}</span>}
            </li>
          ))}
        </ol>
      )}
      <div className="rounded-2xl bg-fog px-3 py-2.5 text-[13px]">
        {result.matched.length === 0 ? (
          <p className="text-[#8a5a00]">No rule matches these inputs, so the decision has no result.</p>
        ) : (
          <>
            <p>
              Rule {result.matched.map((m) => m + 1).join(", ")} →{" "}
              {result.results.map((r, i) => (
                <span key={i} className="font-semibold">
                  {i > 0 && "; "}
                  {Object.entries(r)
                    .map(([k, v]) => `${k} = ${show(v)}`)
                    .join(", ")}
                </span>
              ))}
            </p>
            {status.gateway && (
              <p className="mt-1 text-slate">
                {branch ? (
                  <>The process continues to {targetName(branch)}.</>
                ) : (
                  <span className="text-[#8a5a00]">No branch of the gateway handles “{value}”, so the process would get stuck.</span>
                )}
              </p>
            )}
          </>
        )}
        {chain.steps.flatMap((s) => s.evaluation.warnings).map((w) => (
          <p key={w} className="mt-1 text-[12px] text-[#8a5a00]">
            {w}
          </p>
        ))}
      </div>
      <DecisionTableView decision={decision} highlight={result.matched} compact />
    </div>
  );
}
