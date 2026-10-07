import type { AiOp } from "@/lib/api/types";
import { normalize, primaryOutput, type Decision } from "@/lib/dmn";

type Element = any;

export const DECISION_OPEN_EVENT = "coframe.decision.open";
export const DECISION_CREATE_EVENT = "coframe.decision.create";

const ROUTING = new Set(["bpmn:ExclusiveGateway", "bpmn:InclusiveGateway"]);

export function isRuleTask(element: Element): boolean {
  return element?.type === "bpmn:BusinessRuleTask";
}

export function linkedDecisionId(element: Element): string | null {
  const value = element?.businessObject?.get?.("coframe:diagram");
  return typeof value === "string" && value ? value : null;
}

function sequenceOut(element: Element): Element[] {
  return (element?.outgoing ?? []).filter((c: Element) => c.type === "bpmn:SequenceFlow" && c.target);
}

export function routingGateway(task: Element): Element | null {
  const out = sequenceOut(task);
  if (out.length !== 1) return null;
  const target = out[0].target;
  return ROUTING.has(target.type) ? target : null;
}

export function branchValues(flow: Element): string[] {
  const bo = flow.businessObject ?? {};
  const values = new Set<string>();
  if (bo.name?.trim()) values.add(normalize(bo.name));
  const body: string = bo.conditionExpression?.body ?? "";
  for (const match of body.matchAll(/"((?:[^"\\]|\\.)*)"/g)) values.add(normalize(match[1]));
  return [...values].filter(Boolean);
}

export type Consistency = {
  gateway: Element | null;
  values: { value: string; flow: Element | null }[];
  impossible: Element[];
  unlabeled: Element[];
  routable: boolean;
};

export function consistency(task: Element, decision: Decision | null): Consistency {
  const output = decision ? primaryOutput(decision) : null;
  const gateway = routingGateway(task);
  const branches = gateway ? sequenceOut(gateway) : [];
  const defaultFlow = gateway?.businessObject?.default;
  const values = (output?.values ?? []).map((value) => ({
    value,
    flow: branches.find((b) => branchValues(b).includes(normalize(value))) ?? null,
  }));
  const known = new Set((output?.values ?? []).map(normalize));
  const impossible =
    output?.complete && known.size
      ? branches.filter((b) => {
          const labels = branchValues(b);
          return labels.length > 0 && b.businessObject !== defaultFlow && !labels.some((l) => known.has(l));
        })
      : [];
  const unlabeled = branches.filter((b) => branchValues(b).length === 0 && b.businessObject !== defaultFlow);
  return { gateway, values, impossible, unlabeled, routable: (output?.values.length ?? 0) > 1 };
}

let counter = 0;
const ref = (prefix: string) => `${prefix}${++counter}`;

export function addBranchOps(gateway: Element, value: string): AiOp[] {
  return [{ op: "add", ref: ref("branch"), type: "bpmn:Task", name: `Handle ${value}`, after: gateway.id, label: value }];
}

export function addGatewayOps(task: Element, decision: Decision): AiOp[] {
  const output = primaryOutput(decision);
  if (!output) return [];
  const question = `${output.label || output.name || decision.name || "Result"}?`;
  const gatewayRef = ref("gateway");
  const out = sequenceOut(task);
  const ops: AiOp[] = out.length === 1
    ? [{ op: "insert", ref: gatewayRef, type: "bpmn:ExclusiveGateway", name: question, flow: out[0].id, label: output.values[0] }]
    : [{ op: "add", ref: gatewayRef, type: "bpmn:ExclusiveGateway", name: question, after: task.id }];
  const remaining = out.length === 1 ? output.values.slice(1) : output.values;
  for (const value of remaining) {
    ops.push({ op: "add", ref: ref("branch"), type: "bpmn:Task", name: `Handle ${value}`, after: gatewayRef, label: value });
  }
  return ops;
}

export function labelOps(assignments: { flow: Element; value: string }[]): AiOp[] {
  return assignments.map(({ flow, value }) => ({ op: "label_flow", flow: flow.id, name: value }));
}
