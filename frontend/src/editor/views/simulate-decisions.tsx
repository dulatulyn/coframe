"use client";

import { AlertTriangle, ArrowRight, Table2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { evaluateDecision, inputLabel, outputKey, parseDmn, pickDecision, primaryOutput, type Decision } from "@/lib/dmn";

import { useDiagramXml } from "../dmn/dmn-workspace";
import { consistency, isRuleTask, linkedDecisionId } from "../dmn/link";
import { service, type BpmnEditor } from "../modeler";
import { ViewPanel } from "./view-panel";

type Element = any;

function chooseFlow(editor: BpmnEditor, gateway: Element, flow: Element | null) {
  const simulator = service(editor, "simulator");
  const settings = service(editor, "exclusiveGatewaySettings");
  if (!flow || gateway.type !== "bpmn:ExclusiveGateway") return;
  const outgoing = gateway.outgoing.filter((c: Element) => c.type === "bpmn:SequenceFlow");
  const index = outgoing.indexOf(flow);
  if (index < 0) return;
  simulator.setConfig(gateway, { activeOutgoing: outgoing[(index - 1 + outgoing.length) % outgoing.length] });
  settings.setSequenceFlow(gateway);
}

function TaskDecision({ editor, task, known }: { editor: BpmnEditor; task: Element; known?: string }) {
  const tableId = linkedDecisionId(task)!;
  const fetched = useDiagramXml(known === undefined ? tableId : null);
  const xml = known ?? fetched.data ?? null;
  const name: string = task.businessObject?.name ?? "";
  const decision: Decision | null = useMemo(() => (xml ? pickDecision(parseDmn(xml), name) : null), [xml, name]);
  const [values, setValues] = useState<string[]>([]);
  const evaluation = useMemo(() => (decision?.kind === "table" ? evaluateDecision(decision, values) : null), [decision, values]);
  const output = decision ? primaryOutput(decision) : null;
  const status = decision ? consistency(task, decision) : null;
  const value = output && evaluation?.results[0] ? String(evaluation.results[0][outputKey(decision!, output)] ?? "") : "";
  const branch = status?.values.find((v) => v.value === value)?.flow ?? null;
  const touched = values.some((v) => v.trim());

  useEffect(() => {
    if (touched && status?.gateway && branch) chooseFlow(editor, status.gateway, branch);
  }, [editor, touched, status?.gateway, branch]);

  if (!decision || decision.kind !== "table") return null;
  return (
    <section className="rounded-2xl border border-hairline p-3">
      <p className="flex items-center gap-1.5 text-[13px] font-semibold">
        <Table2 className="size-3.5" /> {name || decision.name}
      </p>
      <div className="mt-2 grid gap-2">
        {decision.inputs.map((input, i) => (
          <label key={input.id || i} className="flex items-center gap-2 text-[12px] text-slate">
            <span className="w-28 shrink-0 truncate font-medium">{inputLabel(input)}</span>
            <input
              value={values[i] ?? ""}
              onChange={(e) => {
                const next = [...values];
                next[i] = e.target.value;
                setValues(next);
              }}
              placeholder={input.typeRef || "value"}
              className="h-8 min-w-0 flex-1 rounded-lg bg-fog px-2.5 text-[13px] text-ink outline-none focus:ring-2 focus:ring-cobalt/30"
            />
          </label>
        ))}
      </div>
      {touched && evaluation && (
        <p className="mt-2 text-[12px] leading-5">
          {evaluation.matched.length === 0 ? (
            <span className="flex items-center gap-1.5 text-[#8a5a00]">
              <AlertTriangle className="size-3.5" /> No rule matches, so the token would stop here.
            </span>
          ) : branch ? (
            <span className="flex flex-wrap items-center gap-1.5">
              Rule {evaluation.matched[0] + 1} → <span className="font-semibold">{value}</span>
              <ArrowRight className="size-3" />
              <span className="text-slate">{branch.target?.businessObject?.name || "next step"}</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-[#8a5a00]">
              <AlertTriangle className="size-3.5" /> Result “{value}” has no branch, so the process would get stuck.
            </span>
          )}
        </p>
      )}
    </section>
  );
}

export function SimulateDecisions({ editor, decisions }: { editor: BpmnEditor; decisions?: Map<string, { xml: string }> }) {
  const tasks = useMemo(
    () =>
      service(editor, "elementRegistry")
        .filter((e: Element) => isRuleTask(e) && linkedDecisionId(e))
        .sort((a: Element, b: Element) => a.x - b.x || a.y - b.y),
    [editor],
  );
  if (!tasks.length) return null;
  return (
    <ViewPanel
      title="Decisions"
      subtitle="Enter the data the tables need. Each decision picks its branch, and tokens follow it."
      className="md:top-[140px] md:w-[320px]"
    >
      <div className="space-y-2 px-2">
        {tasks.map((task: Element) => (
          <TaskDecision
            key={task.id}
            editor={editor}
            task={task}
            known={decisions ? decisions.get(linkedDecisionId(task)!)?.xml ?? "" : undefined}
          />
        ))}
      </div>
    </ViewPanel>
  );
}
