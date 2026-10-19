"use client";

import { useQueries } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Table2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { chainInputs, evaluateChain, linkedDecision, outputKey, parseDmn, primaryOutput, type ChainInput, type Decision } from "@/lib/dmn";

import { fetchDiagramXml } from "../dmn/dmn-workspace";
import { consistency, isRuleTask, linkedDecisionId, linkedDecisionRef } from "../dmn/link";
import { service, type BpmnEditor } from "../modeler";
import { ViewPanel } from "./view-panel";

type Element = any;

type Linked = { task: Element; decisions: Decision[]; decision: Decision };

const dataOf = (results: { data?: string }[]) => results.map((r) => r.data ?? null);

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

function TaskResult({ editor, linked, values, touched }: { editor: BpmnEditor; linked: Linked; values: Record<string, string>; touched: boolean }) {
  const { task, decisions, decision } = linked;
  const name: string = task.businessObject?.name ?? "";
  const chain = useMemo(() => evaluateChain(decisions, decision, values), [decisions, decision, values]);
  const evaluation = chain.result;
  const output = primaryOutput(decision);
  const status = consistency(task, decision);
  const value = output && evaluation.results[0] ? String(evaluation.results[0][outputKey(decision, output)] ?? "") : "";
  const branch = status.values.find((v) => v.value === value)?.flow ?? null;

  useEffect(() => {
    if (touched && status.gateway && branch) chooseFlow(editor, status.gateway, branch);
  }, [editor, touched, status.gateway, branch]);

  return (
    <li className="rounded-2xl border border-hairline p-3">
      <p className="flex items-center gap-1.5 text-[13px] font-semibold">
        <Table2 className="size-3.5" /> {name || decision.name}
      </p>
      {touched && (
        <p className="mt-1.5 text-[12px] leading-5">
          {evaluation.matched.length === 0 ? (
            <span className="flex items-center gap-1.5 text-[#8a5a00]">
              <AlertTriangle className="size-3.5" /> No rule matches, so the token would stop here.
            </span>
          ) : !status.gateway ? (
            <span>
              Rule {evaluation.matched[0] + 1} → <span className="font-semibold">{value}</span>
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
    </li>
  );
}

export function SimulateDecisions({ editor, decisions: known }: { editor: BpmnEditor; decisions?: Map<string, { xml: string }> }) {
  const tasks: Element[] = useMemo(
    () =>
      service(editor, "elementRegistry")
        .filter((e: Element) => isRuleTask(e) && linkedDecisionId(e))
        .sort((a: Element, b: Element) => a.x - b.x || a.y - b.y),
    [editor],
  );
  const files = useMemo(() => [...new Set(tasks.map((t) => linkedDecisionId(t)!))], [tasks]);
  const fetched = useQueries({
    queries: files.map((id) => ({
      queryKey: ["content", id],
      queryFn: () => fetchDiagramXml(id),
      enabled: !known,
      refetchOnWindowFocus: false,
    })),
    combine: dataOf,
  });
  const linked = useMemo(() => {
    const parsed = new Map<string, Decision[]>();
    files.forEach((id, i) => {
      const xml = known ? (known.get(id)?.xml ?? null) : fetched[i];
      parsed.set(id, xml ? parseDmn(xml) : []);
    });
    const out: Linked[] = [];
    for (const task of tasks) {
      const decisions = parsed.get(linkedDecisionId(task)!) ?? [];
      const decision = linkedDecision(decisions, task.businessObject?.name ?? "", linkedDecisionRef(task));
      if (decision?.kind === "table") out.push({ task, decisions, decision });
    }
    return out;
  }, [tasks, files, known, fetched]);
  const inputs = useMemo(() => {
    const out: ChainInput[] = [];
    for (const item of linked) {
      for (const input of chainInputs(item.decisions, item.decision)) if (!out.some((i) => i.key === input.key)) out.push(input);
    }
    return out;
  }, [linked]);
  const [values, setValues] = useState<Record<string, string>>({});
  const touched = Object.values(values).some((v) => v.trim());

  if (!tasks.length) return null;
  return (
    <ViewPanel
      title="Decisions"
      subtitle="Enter the data once. Every decision, including the ones it depends on, picks its branch, and tokens follow it."
      className="md:top-[140px] md:w-[320px]"
    >
      <div className="space-y-3 px-2">
        {inputs.length > 0 && (
          <section className="grid gap-2 rounded-2xl bg-fog p-3">
            {inputs.map((input) => (
              <label key={input.key} className="flex items-center gap-2 text-[12px] text-slate">
                <span className="w-28 shrink-0 truncate font-medium" title={input.label}>
                  {input.label}
                </span>
                <input
                  value={values[input.key] ?? ""}
                  onChange={(e) => setValues({ ...values, [input.key]: e.target.value })}
                  placeholder={input.typeRef || "value"}
                  className="h-8 min-w-0 flex-1 rounded-lg bg-paper px-2.5 text-[13px] text-ink outline-none focus:ring-2 focus:ring-cobalt/30"
                />
              </label>
            ))}
          </section>
        )}
        <ul className="space-y-2">
          {linked.map((item) => (
            <TaskResult key={item.task.id} editor={editor} linked={item} values={values} touched={touched} />
          ))}
        </ul>
      </div>
    </ViewPanel>
  );
}
