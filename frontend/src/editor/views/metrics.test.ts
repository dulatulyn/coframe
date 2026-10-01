import { describe, expect, it } from "vitest";

import { analyse, formatDuration, parseAmount, parseDuration } from "./metrics";
import { scenarios, type FlowNode } from "./paths";

function graph(spec: Record<string, [string, [string, string][], { id: string; interrupting: boolean }[]?]>) {
  const nodes = new Map<string, FlowNode>();
  for (const [id, [type, outgoing, boundaries]] of Object.entries(spec)) {
    nodes.set(id, {
      id,
      type: `bpmn:${type}`,
      name: id,
      outgoing: outgoing.map(([fid, target]) => ({ id: fid, target, name: "" })),
      boundaries: boundaries ?? [],
      pool: null,
    });
  }
  return nodes;
}

describe("metrics", () => {
  it("parses and formats durations and amounts", () => {
    expect(parseDuration("90m")).toBe(1.5);
    expect(parseDuration("2")).toBe(2);
    expect(parseDuration("1,5 days")).toBe(12);
    expect(parseDuration("soon")).toBeNull();
    expect(formatDuration(12)).toBe("1.5d");
    expect(formatDuration(0.5)).toBe("30m");
    expect(parseAmount("$1,200")).toBe(1200);
  });

  it("weights scenarios by branch odds and takes the longest parallel branch", () => {
    const nodes = graph({
      S: ["StartEvent", [["f1", "X"]]],
      X: ["ExclusiveGateway", [["f2", "P"], ["f3", "E2"]]],
      P: ["ParallelGateway", [["f4", "A"], ["f5", "B"]]],
      A: ["Task", [["f6", "J"]]],
      B: ["Task", [["f7", "J"]]],
      J: ["ParallelGateway", [["f8", "E1"]]],
      E1: ["EndEvent", []],
      E2: ["EndEvent", []],
    });
    const inputs = {
      duration: new Map([["A", 2], ["B", 5]]),
      cost: new Map([["A", 10], ["B", 30]]),
      probability: new Map([["f2", 0.8]]),
    };
    const result = analyse(nodes, scenarios(nodes), inputs);
    expect(result.results.map((r) => r.probability)).toEqual([0.8, expect.closeTo(0.2)]);
    expect(result.results[0].duration).toBe(5);
    expect(result.results[0].cost).toBe(40);
    expect(result.duration).toBeCloseTo(4);
    expect(result.cost).toBeCloseTo(32);
  });

  it("starts a boundary path when its activity starts", () => {
    const nodes = graph({
      S: ["StartEvent", [["f1", "W"]]],
      W: ["Task", [["f2", "A"]]],
      A: ["ReceiveTask", [["f3", "E1"]], [{ id: "T", interrupting: true }]],
      T: ["BoundaryEvent", [["f4", "E2"]]],
      E1: ["EndEvent", []],
      E2: ["EndEvent", []],
    });
    const inputs = { duration: new Map([["W", 1], ["A", 3], ["T", 8]]), cost: new Map(), probability: new Map([["T", 0.25]]) };
    const result = analyse(nodes, scenarios(nodes), inputs);
    expect(result.results.map((r) => [r.probability, r.duration])).toEqual([
      [0.75, 4],
      [0.25, 9],
    ]);
  });
});
