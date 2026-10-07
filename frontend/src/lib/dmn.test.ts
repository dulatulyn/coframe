import { describe, expect, it } from "vitest";

import { evaluateDecision, literalValues, parseDmn, pickDecision, primaryOutput } from "./dmn";

const rule = (id: string, total: string, customer: string, result: string) =>
  `<rule id="${id}"><inputEntry id="${id}a"><text>${total}</text></inputEntry><inputEntry id="${id}b"><text>${customer}</text></inputEntry><outputEntry id="${id}c"><text>${result}</text></outputEntry></rule>`;

const DMN = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" id="D" name="Approve" namespace="x">
  <decision id="Decision_1" name="Approve order">
    <decisionTable id="T" hitPolicy="FIRST">
      <input id="I1" label="Order total"><inputExpression id="E1" typeRef="number"><text>total</text></inputExpression></input>
      <input id="I2" label="Customer type"><inputExpression id="E2" typeRef="string"><text>customer</text></inputExpression></input>
      <output id="O" label="Result" name="result" typeRef="string"/>
      ${rule("R1", "&lt; 1000", "-", '"approve"')}
      ${rule("R2", "&gt;= 1000", '"vip"', '"escalate"')}
      ${rule("R3", "-", "-", '"reject"')}
    </decisionTable>
  </decision>
</definitions>`;

describe("dmn", () => {
  it("reads inputs, outputs and the possible results", () => {
    const [decision] = parseDmn(DMN);
    expect(decision.name).toBe("Approve order");
    expect(decision.inputs.map((i) => i.label)).toEqual(["Order total", "Customer type"]);
    expect(primaryOutput(decision)?.values).toEqual(["approve", "escalate", "reject"]);
    expect(pickDecision(parseDmn(DMN), "approve ORDER")?.id).toBe("Decision_1");
    expect(literalValues('"a", "b"')).toEqual(["a", "b"]);
    expect(literalValues("x > 2")).toBeNull();
  });

  it("evaluates rules with the hit policy", () => {
    const [decision] = parseDmn(DMN);
    expect(evaluateDecision(decision, ["500", "regular"])).toMatchObject({ matched: [0], results: [{ result: "approve" }] });
    expect(evaluateDecision(decision, ["2000", "vip"])).toMatchObject({ matched: [1], results: [{ result: "escalate" }] });
    expect(evaluateDecision(decision, ["2000", "regular"])).toMatchObject({ matched: [2], results: [{ result: "reject" }] });
  });

  it("collects every match and flags broken unique tables", () => {
    const [decision] = parseDmn(DMN.replace('hitPolicy="FIRST"', 'hitPolicy="COLLECT"'));
    expect(evaluateDecision(decision, ["500", "vip"]).matched).toEqual([0, 2]);
    const [unique] = parseDmn(DMN.replace('hitPolicy="FIRST"', 'hitPolicy="UNIQUE"'));
    expect(evaluateDecision(unique, ["500", "x"]).warnings[0]).toMatch(/UNIQUE/);
  });
});
