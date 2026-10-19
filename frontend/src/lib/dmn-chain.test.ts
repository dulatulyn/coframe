import { describe, expect, it } from "vitest";

import { chainInputs, evaluateChain, linkedDecision, parseDmn, requiredChain } from "./dmn";

const input = (id: string, label: string, expr: string, type: string) =>
  `<input id="${id}" label="${label}"><inputExpression id="${id}e" typeRef="${type}"><text>${expr}</text></inputExpression></input>`;
const requires = (...ids: string[]) =>
  ids.map((id) => `<informationRequirement id="IR_${id}"><requiredDecision href="#${id}"/></informationRequirement>`).join("");
const rule = (id: string, ins: string[], out: string) =>
  `<rule id="${id}">${ins.map((t, i) => `<inputEntry id="${id}i${i}"><text>${t}</text></inputEntry>`).join("")}<outputEntry id="${id}o"><text>${out}</text></outputEntry></rule>`;

const DRD = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" id="D" name="Loan" namespace="x">
  <decision id="Main" name="Approve loan">${requires("Risk", "Afford")}
    <decisionTable id="T1" hitPolicy="FIRST">
      ${input("a", "Risk", "risk", "string")}${input("b", "Affordable", "affordable", "boolean")}
      <output id="o1" name="approval" typeRef="string"/>
      ${rule("m1", ['"low"', "true"], '"approve"')}${rule("m2", ["-", "-"], '"decline"')}
    </decisionTable>
  </decision>
  <decision id="Risk" name="Assess risk">${requires("Score")}
    <decisionTable id="T2" hitPolicy="FIRST">
      ${input("c", "Credit score", "score", "number")}
      <output id="o2" name="risk" typeRef="string"/>
      ${rule("r1", [">= 700"], '"low"')}${rule("r2", ["-"], '"high"')}
    </decisionTable>
  </decision>
  <decision id="Afford" name="Check affordability">
    <decisionTable id="T3" hitPolicy="FIRST">
      ${input("d", "Income", "income", "number")}${input("e", "Debt", "debt", "number")}
      <output id="o3" name="affordable" typeRef="boolean"/>
      ${rule("f1", [">= 3000", "&lt; 1000"], "true")}${rule("f2", ["-", "-"], "false")}
    </decisionTable>
  </decision>
  <decision id="Score" name="Score applicant">
    <decisionTable id="T4" hitPolicy="FIRST">
      ${input("g", "Late payments", "late", "number")}
      <output id="o4" name="score" typeRef="number"/>
      ${rule("s1", ["0"], "800")}${rule("s2", ["-"], "500")}
    </decisionTable>
  </decision>
</definitions>`;

describe("decision requirements", () => {
  const decisions = parseDmn(DRD);
  const main = decisions.find((d) => d.id === "Main")!;

  it("reads the requirement graph", () => {
    expect(main.requires).toEqual(["Risk", "Afford"]);
    expect(requiredChain(decisions, main).map((d) => d.id)).toEqual(["Score", "Risk", "Afford", "Main"]);
  });

  it("asks only for the data no subdecision provides", () => {
    expect(chainInputs(decisions, main).map((i) => i.key)).toEqual(["late", "income", "debt"]);
    const risk = decisions.find((d) => d.id === "Risk")!;
    expect(chainInputs(decisions, risk).map((i) => i.key)).toEqual(["late"]);
  });

  it("evaluates subdecisions first and feeds their results upward", () => {
    const good = evaluateChain(decisions, main, { late: "0", income: "4000", debt: "200" });
    expect(good.steps.map((s) => s.value)).toEqual([800, "low", true, "approve"]);
    const bad = evaluateChain(decisions, main, { late: "3", income: "4000", debt: "200" });
    expect(bad.steps.map((s) => s.value)).toEqual([500, "high", true, "decline"]);
    expect(bad.result.matched).toEqual([1]);
  });

  it("links a task to a decision by id, or by name without one", () => {
    expect(linkedDecision(decisions, "whatever", "Afford")?.name).toBe("Check affordability");
    expect(linkedDecision(decisions, "Assess risk", null)?.id).toBe("Risk");
    expect(linkedDecision(decisions, "x", "Gone")).toBeNull();
  });
});
