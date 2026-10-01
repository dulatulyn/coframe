export type FlowNode = {
  id: string;
  type: string;
  name: string;
  outgoing: { id: string; name: string; target: string }[];
  boundaries: { id: string; interrupting: boolean }[];
  pool: string | null;
};

export type Scenario = {
  id: string;
  pool: string | null;
  elements: string[];
  decisions: { gateway: string; question: string; answer: string }[];
  ends: { id: string; name: string }[];
  steps: number;
  loops: boolean;
  stuck: string[];
};

const CHOICE = new Set(["bpmn:ExclusiveGateway", "bpmn:InclusiveGateway", "bpmn:EventBasedGateway", "bpmn:ComplexGateway"]);
const ACTIVITY = /Task$|^bpmn:SubProcess$|^bpmn:CallActivity$|^bpmn:Transaction$/;
export const MAX_SCENARIOS = 60;

type State = {
  queue: string[];
  elements: Set<string>;
  decisions: Scenario["decisions"];
  ends: Scenario["ends"];
  loops: boolean;
  stuck: string[];
};

const copy = (s: State): State => ({
  queue: [...s.queue],
  elements: new Set(s.elements),
  decisions: [...s.decisions],
  ends: [...s.ends],
  loops: s.loops,
  stuck: [...s.stuck],
});

export function scenarios(nodes: Map<string, FlowNode>): Scenario[] {
  const starts = [...nodes.values()].filter((n) => n.type === "bpmn:StartEvent");
  const result: Scenario[] = [];

  const finish = (state: State, start: FlowNode) => {
    result.push({
      id: `${start.id}:${result.length}`,
      pool: start.pool,
      elements: [...state.elements],
      decisions: state.decisions,
      ends: state.ends,
      steps: [...state.elements].filter((id) => ACTIVITY.test(nodes.get(id)?.type ?? "")).length,
      loops: state.loops,
      stuck: state.stuck,
    });
  };

  const run = (state: State, start: FlowNode) => {
    while (state.queue.length) {
      if (result.length >= MAX_SCENARIOS) return;
      const id = state.queue.shift()!;
      const node = nodes.get(id);
      if (!node) continue;
      if (state.elements.has(id)) continue;
      state.elements.add(id);

      const enter = (flow: FlowNode["outgoing"][number], into: State) => {
        into.elements.add(flow.id);
        if (into.elements.has(flow.target)) {
          if (!nodes.get(flow.target)?.type.endsWith("Gateway") || CHOICE.has(nodes.get(flow.target)!.type)) into.loops = true;
          return;
        }
        into.queue.push(flow.target);
      };

      const alternatives: { label: string; apply: (s: State) => void }[] = [];
      if (node.boundaries.length && node.outgoing.length) {
        alternatives.push({ label: "completes", apply: (s) => node.outgoing.forEach((f) => enter(f, s)) });
        for (const boundary of node.boundaries) {
          const event = nodes.get(boundary.id);
          alternatives.push({
            label: event?.name || "boundary event",
            apply: (s) => {
              if (!boundary.interrupting) node.outgoing.forEach((f) => enter(f, s));
              s.queue.push(boundary.id);
            },
          });
        }
      } else if (CHOICE.has(node.type) && node.outgoing.length > 1) {
        for (const flow of node.outgoing) {
          alternatives.push({
            label: flow.name || nodes.get(flow.target)?.name || flow.target,
            apply: (s) => enter(flow, s),
          });
        }
      }

      if (alternatives.length) {
        const question = node.name || node.id;
        for (const alternative of alternatives) {
          const branch = copy(state);
          branch.decisions.push({ gateway: node.id, question, answer: alternative.label });
          alternative.apply(branch);
          run(branch, start);
          if (result.length >= MAX_SCENARIOS) return;
        }
        return;
      }

      if (!node.outgoing.length) {
        if (node.type === "bpmn:EndEvent") state.ends.push({ id: node.id, name: node.name });
        else if (node.type !== "bpmn:BoundaryEvent") state.stuck.push(node.id);
        continue;
      }
      node.outgoing.forEach((f) => enter(f, state));
    }
    finish(state, start);
  };

  for (const start of starts) {
    if (result.length >= MAX_SCENARIOS) break;
    run({ queue: [start.id], elements: new Set(), decisions: [], ends: [], loops: false, stuck: [] }, start);
  }
  return result;
}

type Element = any;

export function readNodes(registry: { filter(fn: (e: Element) => boolean): Element[] }): Map<string, FlowNode> {
  const nodes = new Map<string, FlowNode>();
  const poolOf = (element: Element): string | null => {
    let parent = element.parent;
    while (parent) {
      if (parent.type === "bpmn:Participant") return parent.id;
      parent = parent.parent;
    }
    return null;
  };
  const shapes = registry.filter((e) => !e.waypoints && e.type !== "label" && !!e.businessObject?.$instanceOf?.("bpmn:FlowNode"));
  for (const shape of shapes) {
    const bo = shape.businessObject;
    if (bo.$parent?.triggeredByEvent) continue;
    nodes.set(shape.id, {
      id: shape.id,
      type: shape.type,
      name: (bo.name ?? "").trim(),
      outgoing: (shape.outgoing ?? [])
        .filter((c: Element) => c.type === "bpmn:SequenceFlow" && c.target)
        .map((c: Element) => ({ id: c.id, name: (c.businessObject?.name ?? "").trim(), target: c.target.id })),
      boundaries: (shape.attachers ?? []).map((b: Element) => ({ id: b.id, interrupting: b.businessObject?.cancelActivity !== false })),
      pool: poolOf(shape),
    });
  }
  return nodes;
}
