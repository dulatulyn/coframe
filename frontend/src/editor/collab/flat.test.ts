import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { BpmnModdle } from "bpmn-moddle";
import { generateNKeysBetween } from "fractional-indexing";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { alignOrder, diffDocs, flattenXml, isEmptyDiff, reconstructXml, sanitize, type FlatDoc } from "./flat";
import { applyDiff, getElements, readElements, replaceAll } from "./ydoc";

const FIXTURES = path.resolve(__dirname, "../../../../shared/fixtures");
const names = readdirSync(path.join(FIXTURES, "bpmn"))
  .filter((f) => f.endsWith(".bpmn"))
  .map((f) => f.replace(/\.bpmn$/, ""));

const source = (name: string) => readFileSync(path.join(FIXTURES, "bpmn", `${name}.bpmn`), "utf8");
const pythonFlat = (name: string) => JSON.parse(readFileSync(path.join(FIXTURES, "flat", `${name}.json`), "utf8"));
const pythonXml = (name: string) => readFileSync(path.join(FIXTURES, "flat", `${name}.xml`), "utf8");

describe.each(names)("fixture %s", (name) => {
  it("flattens exactly like the Python implementation", () => {
    expect(flattenXml(source(name))).toEqual(pythonFlat(name));
  });

  it("rebuilds exactly the XML the Python implementation rebuilds", () => {
    expect(reconstructXml(flattenXml(source(name)))).toBe(pythonXml(name));
  });

  it("round-trips without changes", () => {
    const flat = flattenXml(source(name));
    expect(flattenXml(reconstructXml(flat))).toEqual(flat);
  });

  it("rebuilds XML that bpmn-moddle imports without warnings", async () => {
    const { warnings } = await new BpmnModdle().fromXML(reconstructXml(flattenXml(source(name))));
    expect(warnings.map((w: { message: string }) => w.message)).toEqual([]);
  });
});

describe("order keys", () => {
  it("match the Python port of fractional-indexing", () => {
    const samples = JSON.parse(readFileSync(path.join(FIXTURES, "order-keys.json"), "utf8"));
    expect(generateNKeysBetween(null, null, 70)).toEqual(samples.sequential);
    expect(generateNKeysBetween("a0", "a1", 20)).toEqual(samples.between);
    expect(generateNKeysBetween(null, "a0", 10)).toEqual(samples.before);
  });
});

describe("sanitize", () => {
  it("removes everything that depends on a deleted task and stays stable", () => {
    const flat = flattenXml(source("collaboration"));
    delete flat.Task_check;
    const clean = sanitize(flat);
    for (const gone of ["Task_check_di", "Flow_1", "Flow_2_di", "Property_1", "DataInputAssociation_1", "Association_1"]) {
      expect(clean).not.toHaveProperty(gone);
    }
    expect(clean.Lane_sales).not.toHaveProperty(["~bpmn:flowNodeRef|Task_check"]);
    expect(sanitize(clean)).toEqual(clean);
  });

  it("drops orphaned boundary events and stale defaults", () => {
    const flat = flattenXml(source("collaboration"));
    delete flat.Task_send_invoice;
    delete flat.Flow_yes;
    const clean = sanitize(flat);
    expect(clean).not.toHaveProperty("Event_timer_boundary");
    expect(clean).not.toHaveProperty("Flow_4");
    expect(clean.Gateway_ok).not.toHaveProperty("@default");
  });
});

describe("alignOrder", () => {
  it("keeps known keys, gives new elements keys between their neighbours", () => {
    const prev = flattenXml(source("subprocesses"));
    const shifted: FlatDoc = {};
    for (const [k, e] of Object.entries(prev)) shifted[k] = { ...e, o: e.o.replace(/^a/, "b0") };
    const next = flattenXml(source("subprocesses"));
    const aligned = alignOrder(next, shifted);
    expect(aligned.Start_1.o).toBe(shifted.Start_1.o);
    expect(aligned.Sub_collapsed.o).toBe(shifted.Sub_collapsed.o);

    const withNew = { ...next, Task_new: { t: "bpmn:task", p: "Process_sub", o: "zz" } };
    const placed = alignOrder(withNew, prev);
    const siblings = Object.entries(placed)
      .filter(([, e]) => e.p === "Process_sub")
      .sort(([, a], [, b]) => (a.o < b.o ? -1 : 1))
      .map(([k]) => k);
    expect(siblings.at(-1)).toBe("Task_new");
    expect(placed.Start_1.o).toBe(prev.Start_1.o);
  });

  it("assigns a fresh key when an element moves before its siblings", () => {
    const prev = flattenXml(source("default-namespace"));
    const next = structuredClone(prev);
    next["sid-receive"].o = "Zz";
    const aligned = alignOrder(next, prev);
    const order = Object.entries(aligned)
      .filter(([, e]) => e.p === "sid-process")
      .sort(([, a], [, b]) => (a.o < b.o ? -1 : 1))
      .map(([k]) => k);
    expect(order[0]).toBe("sid-receive");
    expect(new Set(order.map((k) => aligned[k].o)).size).toBe(order.length);
  });
});

describe("Yjs round trip", () => {
  it("concurrent edits to different fields of one element merge", () => {
    const base = flattenXml(source("collaboration"));
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    docA.transact(() => replaceAll(getElements(docA), base));
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    const renamed = structuredClone(base);
    renamed.Task_check["@name"] = "Check the order";
    const moved = structuredClone(base);
    moved.Task_check_di["#dc:Bounds"] = '<dc:Bounds height="80" width="100" x="360" y="250"/>';
    docA.transact(() => applyDiff(getElements(docA), diffDocs(base, renamed)));
    docB.transact(() => applyDiff(getElements(docB), diffDocs(base, moved)));

    Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB));
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    const merged = readElements(getElements(docA));
    expect(merged).toEqual(readElements(getElements(docB)));
    expect(merged.Task_check["@name"]).toBe("Check the order");
    expect(merged.Task_check_di["#dc:Bounds"]).toContain('x="360"');
  });

  it("a delete wins over a concurrent edit and the result still imports", async () => {
    const base = flattenXml(source("collaboration"));
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    docA.transact(() => replaceAll(getElements(docA), base));
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    const deleted = structuredClone(base);
    delete deleted.Gateway_ok;
    delete deleted.Gateway_ok_di;
    const edited = structuredClone(base);
    edited.Gateway_ok["@name"] = "Valid?";
    docA.transact(() => applyDiff(getElements(docA), diffDocs(base, deleted)));
    docB.transact(() => applyDiff(getElements(docB), diffDocs(base, edited)));
    Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB));

    const merged = readElements(getElements(docA));
    expect(merged).not.toHaveProperty("Gateway_ok");
    const { warnings } = await new BpmnModdle().fromXML(reconstructXml(merged));
    expect(warnings).toEqual([]);
  });

  it("diffing identical documents produces nothing", () => {
    const base = flattenXml(source("subprocesses"));
    expect(isEmptyDiff(diffDocs(base, structuredClone(base)))).toBe(true);
  });
});
