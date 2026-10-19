import { evaluate, unaryTest } from "feelin";

export type DecisionInput = { id: string; label: string; expression: string; typeRef: string };
export type DecisionOutput = { id: string; name: string; label: string; typeRef: string; values: string[]; complete: boolean };
export type DecisionRule = { id: string; inputs: string[]; outputs: string[]; description: string };
export type Decision = {
  id: string;
  name: string;
  hitPolicy: string;
  aggregation: string;
  inputs: DecisionInput[];
  outputs: DecisionOutput[];
  rules: DecisionRule[];
  kind: "table" | "literal" | "other";
  literal: string;
  requires: string[];
};

const DMN_NS = [
  "https://www.omg.org/spec/DMN/20191111/MODEL/",
  "http://www.omg.org/spec/DMN/20180521/MODEL/",
  "http://www.omg.org/spec/DMN/20151101/dmn.xsd",
];

function children(el: Element, local: string): Element[] {
  return Array.from(el.children).filter((c) => c.localName === local);
}

function text(el: Element | undefined): string {
  if (!el) return "";
  return (children(el, "text")[0]?.textContent ?? "").trim();
}

const LITERAL = /^\s*(?:"((?:[^"\\]|\\.)*)"|(-?\d+(?:\.\d+)?)|(true|false))\s*$/;

export function literalValues(source: string): string[] | null {
  const value = (source ?? "").trim();
  if (!value || value === "-") return [];
  const parts = value.match(/"(?:[^"\\]|\\.)*"|[^,]+/g) ?? [];
  const out: string[] = [];
  for (const part of parts) {
    const match = LITERAL.exec(part);
    if (!match) return null;
    out.push(match[1] !== undefined ? JSON.parse(`"${match[1]}"`) : part.trim());
  }
  return out;
}

function requirements(el: Element): string[] {
  const ids: string[] = [];
  for (const requirement of children(el, "informationRequirement")) {
    for (const required of children(requirement, "requiredDecision")) {
      const href = (required.getAttribute("href") ?? "").replace(/^#/, "");
      if (href && !ids.includes(href)) ids.push(href);
    }
  }
  return ids;
}

export function parseDmn(xml: string): Decision[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const root = doc.documentElement;
  if (!root || root.localName !== "definitions" || !DMN_NS.includes(root.namespaceURI ?? "")) return [];
  return children(root, "decision").map((el) => {
    const base = { id: el.getAttribute("id") ?? "", name: (el.getAttribute("name") ?? "").trim(), requires: requirements(el) };
    const table = children(el, "decisionTable")[0];
    const literal = children(el, "literalExpression")[0];
    if (!table) {
      return {
        ...base,
        hitPolicy: "",
        aggregation: "",
        inputs: [],
        outputs: [],
        rules: [],
        kind: literal ? "literal" : "other",
        literal: text(literal),
      } satisfies Decision;
    }
    const inputs = children(table, "input").map((item) => {
      const expression = children(item, "inputExpression")[0];
      return {
        id: item.getAttribute("id") ?? "",
        label: (item.getAttribute("label") ?? "").trim(),
        expression: text(expression),
        typeRef: expression?.getAttribute("typeRef") ?? "",
      };
    });
    const rules = children(table, "rule").map((rule) => ({
      id: rule.getAttribute("id") ?? "",
      inputs: children(rule, "inputEntry").map((e) => text(e)),
      outputs: children(rule, "outputEntry").map((e) => text(e)),
      description: (children(rule, "description")[0]?.textContent ?? "").trim(),
    }));
    const outputs = children(table, "output").map((item, index) => {
      const declared = literalValues(text(children(item, "outputValues")[0]));
      let values: string[] = declared?.length ? declared : [];
      let complete = true;
      if (!values.length) {
        for (const rule of rules) {
          const entry = literalValues(rule.outputs[index] ?? "");
          if (entry === null) {
            complete = false;
            continue;
          }
          for (const value of entry) if (!values.includes(value)) values = [...values, value];
        }
      }
      return {
        id: item.getAttribute("id") ?? "",
        name: (item.getAttribute("name") ?? "").trim(),
        label: (item.getAttribute("label") ?? "").trim(),
        typeRef: item.getAttribute("typeRef") ?? "",
        values,
        complete,
      };
    });
    return {
      ...base,
      hitPolicy: table.getAttribute("hitPolicy") ?? "UNIQUE",
      aggregation: table.getAttribute("aggregation") ?? "",
      inputs,
      outputs,
      rules,
      kind: "table",
      literal: "",
    } satisfies Decision;
  });
}

export function pickDecision(decisions: Decision[], name: string): Decision | null {
  const tables = decisions.filter((d) => d.kind === "table" && d.outputs.length);
  if (!tables.length) return decisions[0] ?? null;
  return tables.find((d) => normalize(d.name) === normalize(name)) ?? tables[0];
}

export function linkedDecision(decisions: Decision[], name: string, ref: string | null): Decision | null {
  if (ref) return decisions.find((d) => d.id === ref) ?? null;
  return pickDecision(decisions, name);
}

export function primaryOutput(decision: Decision): DecisionOutput | null {
  return decision.outputs.find((o) => o.values.length) ?? decision.outputs[0] ?? null;
}

export function normalize(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "").toLowerCase().split(/\s+/).join(" ");
}

export function inputLabel(input: DecisionInput): string {
  return input.label || input.expression || "Input";
}

export function coerce(raw: string, typeRef: string): unknown {
  const value = raw.trim();
  if (!value) return null;
  const type = typeRef.toLowerCase();
  if (["number", "integer", "long", "double"].includes(type)) {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : value;
  }
  if (type === "boolean") return ["true", "yes", "1", "да"].includes(value.toLowerCase());
  if (type === "" || type === "any") {
    if (/^-?\d+(?:[.,]\d+)?$/.test(value)) return Number(value.replace(",", "."));
    if (value === "true" || value === "false") return value === "true";
  }
  return value;
}

export type Evaluation = {
  matched: number[];
  results: Record<string, unknown>[];
  warnings: string[];
};

function contextFor(decision: Decision, values: unknown[]): Record<string, unknown> {
  const context: Record<string, unknown> = {};
  decision.inputs.forEach((input, i) => {
    const name = input.expression.trim();
    if (/^[A-Za-z_][\w ]*$/.test(name)) context[name] = values[i];
  });
  return context;
}

export function evaluateDecision(decision: Decision, raw: string[]): Evaluation {
  return evaluateValues(
    decision,
    decision.inputs.map((input, i) => coerce(raw[i] ?? "", input.typeRef)),
  );
}

function evaluateValues(decision: Decision, values: unknown[]): Evaluation {
  const context = contextFor(decision, values);
  const warnings: string[] = [];
  const matched: number[] = [];
  decision.rules.forEach((rule, index) => {
    const hit = rule.inputs.every((entry, i) => {
      const test = entry.trim();
      if (!test || test === "-") return true;
      try {
        const { value } = unaryTest(test, { ...context, "?": values[i] });
        return value === true;
      } catch {
        warnings.push(`Rule ${index + 1}: "${test}" could not be evaluated.`);
        return false;
      }
    });
    if (hit) matched.push(index);
  });
  const policy = decision.hitPolicy.toUpperCase();
  const picked = ["COLLECT", "RULE ORDER", "OUTPUT ORDER"].includes(policy) ? matched : matched.slice(0, 1);
  if (policy === "UNIQUE" && matched.length > 1) {
    warnings.push(`Hit policy UNIQUE, but rules ${matched.map((m) => m + 1).join(", ")} all match.`);
  }
  const results = picked.map((index) => {
    const rule = decision.rules[index];
    const out: Record<string, unknown> = {};
    decision.outputs.forEach((output, i) => {
      const source = rule.outputs[i]?.trim() ?? "";
      if (!source) return;
      try {
        out[output.name || output.label || `output${i + 1}`] = evaluate(source, context).value;
      } catch {
        out[output.name || output.label || `output${i + 1}`] = source;
      }
    });
    return out;
  });
  return { matched: picked, results, warnings };
}

export function outputKey(decision: Decision, output: DecisionOutput): string {
  const index = decision.outputs.indexOf(output);
  return output.name || output.label || `output${index + 1}`;
}

export function inputKey(input: DecisionInput): string {
  return input.expression.trim() || input.label.trim() || input.id;
}

export function requiredChain(decisions: Decision[], target: Decision): Decision[] {
  const byId = new Map(decisions.map((d) => [d.id, d]));
  const order: Decision[] = [];
  const seen = new Set<string>();
  const visit = (decision: Decision) => {
    if (seen.has(decision.id)) return;
    seen.add(decision.id);
    for (const id of decision.requires) {
      const required = byId.get(id);
      if (required) visit(required);
    }
    order.push(decision);
  };
  visit(target);
  return order;
}

function resultNames(decision: Decision): string[] {
  return [decision.name, ...decision.outputs.map((o) => o.name)].filter(Boolean);
}

export type ChainInput = { key: string; label: string; typeRef: string };

export function chainInputs(decisions: Decision[], target: Decision): ChainInput[] {
  const chain = requiredChain(decisions, target);
  const inner = new Set(chain.slice(0, -1).flatMap(resultNames));
  const out: ChainInput[] = [];
  for (const decision of chain) {
    for (const input of decision.inputs) {
      const key = inputKey(input);
      if (inner.has(key) || out.some((i) => i.key === key)) continue;
      out.push({ key, label: inputLabel(input), typeRef: input.typeRef });
    }
  }
  return out;
}

export type ChainStep = { decision: Decision; evaluation: Evaluation; value: unknown };

export type ChainEvaluation = { steps: ChainStep[]; result: Evaluation };

export function evaluateChain(decisions: Decision[], target: Decision, raw: Record<string, string>): ChainEvaluation {
  const known = new Map<string, unknown>();
  const steps: ChainStep[] = [];
  for (const decision of requiredChain(decisions, target)) {
    let evaluation: Evaluation;
    let value: unknown = null;
    if (decision.kind === "literal") {
      const context = Object.fromEntries(known);
      for (const [key, text] of Object.entries(raw)) if (!(key in context)) context[key] = coerce(text, "");
      try {
        value = evaluate(decision.literal, context).value;
        evaluation = { matched: [], results: [{ [decision.name]: value }], warnings: [] };
      } catch {
        evaluation = { matched: [], results: [], warnings: [`"${decision.name}" could not be evaluated.`] };
      }
    } else {
      const values = decision.inputs.map((input) => {
        const key = inputKey(input);
        return known.has(key) ? known.get(key) : coerce(raw[key] ?? "", input.typeRef);
      });
      evaluation = evaluateValues(decision, values);
      const first = evaluation.results[0];
      if (first) {
        for (const [name, result] of Object.entries(first)) known.set(name, result);
        const entries = Object.values(first);
        value = entries.length === 1 ? entries[0] : first;
      }
    }
    if (decision.name) known.set(decision.name, value);
    steps.push({ decision, evaluation, value });
  }
  return { steps, result: steps[steps.length - 1].evaluation };
}
