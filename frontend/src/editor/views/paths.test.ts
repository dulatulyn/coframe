import { describe, expect, it } from "vitest";

import { scenarios, type FlowNode } from "./paths";

function graph(spec: Record<string, [string, [string, string, string?][], { id: string; interrupting: boolean }[]?]>) {
  const nodes = new Map<string, FlowNode>();
  for (const [id, [type, outgoing, boundaries]] of Object.entries(spec)) {
    nodes.set(id, {
      id,
      type: `bpmn:${type}`,
      name: id,
      outgoing: outgoing.map(([fid, target, name]) => ({ id: fid, target, name: name ?? "" })),
      boundaries: boundaries ?? [],
      pool: null,
    });
  }
  return nodes;
}

describe("scenarios", () => {
  it("splits on decisions and follows both branches of a parallel split", () => {
    const result = scenarios(
      graph({
        S: ["StartEvent", [["f1", "X"]]],
        X: ["ExclusiveGateway", [["f2", "P", "yes"], ["f3", "E2", "no"]]],
        P: ["ParallelGateway", [["f4", "A"], ["f5", "B"]]],
        A: ["Task", [["f6", "J"]]],
        B: ["Task", [["f7", "J"]]],
        J: ["ParallelGateway", [["f8", "E1"]]],
        E1: ["EndEvent", []],
        E2: ["EndEvent", []],
      }),
    );
    expect(result.map((s) => s.decisions.map((d) => d.answer))).toEqual([["yes"], ["no"]]);
    expect(result[0].elements).toEqual(expect.arrayContaining(["A", "B", "J", "E1"]));
    expect(result[0].steps).toBe(2);
    expect(result[0].loops).toBe(false);
    expect(result[1].ends.map((e) => e.id)).toEqual(["E2"]);
  });

  it("treats boundary events as alternative outcomes", () => {
    const result = scenarios(
      graph({
        S: ["StartEvent", [["f1", "A"]]],
        A: ["UserTask", [["f2", "E1"]], [{ id: "T", interrupting: true }]],
        T: ["BoundaryEvent", [["f3", "E2"]]],
        E1: ["EndEvent", []],
        E2: ["EndEvent", []],
      }),
    );
    expect(result.map((s) => s.ends.map((e) => e.id))).toEqual([["E1"], ["E2"]]);
  });

  it("flags loops and dead ends", () => {
    const result = scenarios(
      graph({
        S: ["StartEvent", [["f1", "A"]]],
        A: ["Task", [["f2", "X"]]],
        X: ["ExclusiveGateway", [["f3", "A", "retry"], ["f4", "B", "done"]]],
        B: ["Task", []],
      }),
    );
    expect(result[0].loops).toBe(true);
    expect(result[1].stuck).toEqual(["B"]);
  });
});
