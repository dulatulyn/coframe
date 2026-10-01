#!/usr/bin/env node
import { readFileSync } from "node:fs";

import { BpmnModdle } from "bpmn-moddle";

const source = process.argv[2] ?? "-";
const xml = readFileSync(source === "-" ? 0 : source, "utf8");
const moddle = new BpmnModdle();

try {
  const { rootElement, warnings } = await moddle.fromXML(xml, "bpmn:Definitions");
  const flowElements = rootElement.rootElements
    .filter((e) => e.$type === "bpmn:Process" || e.$type === "bpmn:SubProcess")
    .reduce((n, p) => n + (p.flowElements?.length ?? 0), 0);
  const di = rootElement.diagrams?.[0]?.plane?.planeElement?.length ?? 0;
  for (const w of warnings) console.log(`warning: ${w.message}`);
  console.log(`${warnings.length === 0 ? "ok" : "problems"}: ${flowElements} flow elements, ${di} diagram elements`);
  process.exit(warnings.length === 0 ? 0 : 1);
} catch (error) {
  console.log(`invalid: ${error.message}`);
  process.exit(1);
}
