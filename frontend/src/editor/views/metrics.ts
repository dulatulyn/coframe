import type { FlowNode, Scenario } from "./paths";

export const HOURS_PER_DAY = 8;
const UNITS: Record<string, number> = {
  m: 1 / 60,
  min: 1 / 60,
  mins: 1 / 60,
  minute: 1 / 60,
  minutes: 1 / 60,
  h: 1,
  hr: 1,
  hrs: 1,
  hour: 1,
  hours: 1,
  d: HOURS_PER_DAY,
  day: HOURS_PER_DAY,
  days: HOURS_PER_DAY,
  w: HOURS_PER_DAY * 5,
  week: HOURS_PER_DAY * 5,
  weeks: HOURS_PER_DAY * 5,
};

export function parseDuration(text: string | undefined | null): number | null {
  const match = /^\s*(\d+(?:[.,]\d+)?)\s*([a-z]*)\s*$/i.exec(text ?? "");
  if (!match) return null;
  const value = Number(match[1].replace(",", "."));
  const unit = match[2].toLowerCase() || "h";
  return unit in UNITS ? value * UNITS[unit] : null;
}

export function formatDuration(hours: number): string {
  if (hours <= 0) return "0";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < HOURS_PER_DAY) return `${+hours.toFixed(1)}h`;
  const days = hours / HOURS_PER_DAY;
  return days < 10 ? `${+days.toFixed(1)}d` : `${Math.round(days)}d`;
}

export function parseAmount(text: string | undefined | null): number | null {
  const cleaned = (text ?? "").replace(/[\s,_]/g, "").replace(/^[^\d.-]+|[^\d.]+$/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function formatAmount(value: number): string {
  return value >= 1000 ? Math.round(value).toLocaleString("en") : `${+value.toFixed(2)}`;
}

export type Inputs = {
  duration: Map<string, number>;
  cost: Map<string, number>;
  probability: Map<string, number>;
};

export type ScenarioResult = { scenario: Scenario; probability: number; duration: number; cost: number };

export type Analysis = { results: ScenarioResult[]; duration: number; cost: number; covered: number };

function chance(node: FlowNode, choice: string, inputs: Inputs): number {
  const options = node.boundaries.length ? ["", ...node.boundaries.map((b) => b.id)] : node.outgoing.map((f) => f.id);
  const explicit = options.filter((o) => o && inputs.probability.has(o));
  const fixed = explicit.reduce((sum, o) => sum + inputs.probability.get(o)!, 0);
  if (choice && inputs.probability.has(choice)) return Math.min(1, inputs.probability.get(choice)!);
  const free = options.length - explicit.length;
  return free > 0 ? Math.max(0, 1 - fixed) / free : 0;
}

function longest(nodes: Map<string, FlowNode>, elements: Set<string>, inputs: Inputs): number {
  const hostOf = new Map<string, string>();
  for (const node of nodes.values()) for (const b of node.boundaries) hostOf.set(b.id, node.id);
  const predecessors = new Map<string, string[]>();
  for (const node of nodes.values()) {
    if (!elements.has(node.id)) continue;
    for (const flow of node.outgoing) {
      if (!elements.has(flow.id) || !elements.has(flow.target)) continue;
      predecessors.set(flow.target, [...(predecessors.get(flow.target) ?? []), node.id]);
    }
  }
  const start = new Map<string, number>();
  const finish = new Map<string, number>();
  const visiting = new Set<string>();
  const startOf = (id: string): number => {
    if (start.has(id)) return start.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const host = hostOf.get(id);
    const value = host ? startOf(host) : Math.max(0, ...(predecessors.get(id) ?? []).map(finishOf));
    visiting.delete(id);
    start.set(id, value);
    return value;
  };
  const finishOf = (id: string): number => {
    if (finish.has(id)) return finish.get(id)!;
    const value = startOf(id) + (inputs.duration.get(id) ?? 0);
    finish.set(id, value);
    return value;
  };
  let total = 0;
  for (const id of elements) if (nodes.has(id)) total = Math.max(total, finishOf(id));
  return total;
}

export function analyse(nodes: Map<string, FlowNode>, list: Scenario[], inputs: Inputs): Analysis {
  const results = list.map((scenario) => {
    const probability = scenario.decisions.reduce((p, d) => {
      const node = nodes.get(d.gateway);
      return node ? p * chance(node, d.choice, inputs) : p;
    }, 1);
    const elements = new Set(scenario.elements);
    const cost = scenario.elements.reduce((sum, id) => sum + (inputs.cost.get(id) ?? 0), 0);
    return { scenario, probability, duration: longest(nodes, elements, inputs), cost };
  });
  const byStart = new Map<string, ScenarioResult[]>();
  for (const r of results) {
    const key = r.scenario.id.split(":")[0];
    byStart.set(key, [...(byStart.get(key) ?? []), r]);
  }
  let duration = 0;
  let cost = 0;
  let covered = 0;
  for (const group of byStart.values()) {
    const mass = group.reduce((s, r) => s + r.probability, 0);
    covered = Math.max(covered, mass);
    const weight = mass > 0 ? 1 / mass : 0;
    duration = Math.max(duration, group.reduce((s, r) => s + r.probability * weight * r.duration, 0));
    cost += group.reduce((s, r) => s + r.probability * weight * r.cost, 0);
  }
  return { results, duration, cost, covered };
}
