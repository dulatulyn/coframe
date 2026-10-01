#!/usr/bin/env node
import { spawn } from "node:child_process";

import { BpmnModdle } from "bpmn-moddle";
import { generateKeyBetween } from "fractional-indexing";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const API = option("api", "http://localhost:8100").replace(/\/$/, "");
const WS = API.replace(/^http/, "ws");
const CLIENTS = Number(option("clients", "4"));
const OPS = Number(option("ops", "80"));
const RESTART = option("restart-cmd", null);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rand = (min, max) => min + Math.random() * (max - min);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const log = (...parts) => console.log(new Date().toISOString().slice(11, 19), ...parts);

let cookie = "";
async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const sid = res.headers.getSetCookie?.().find((c) => c.startsWith("sid="));
  if (sid) cookie = sid.split(";")[0];
  return res;
}

class CookieSocket extends WebSocket {
  constructor(url, protocols) {
    super(url, { protocols, headers: { cookie } });
  }
}

function connect(diagramId) {
  const doc = new Y.Doc();
  const provider = new WebsocketProvider(`${WS}/api/ws/diagrams`, diagramId, doc, {
    WebSocketPolyfill: CookieSocket,
    disableBc: true,
    maxBackoffTime: 1500,
  });
  provider.messageHandlers[100] = () => {};
  return { doc, provider, elements: doc.getMap("elements") };
}

const synced = (client) =>
  client.provider.synced ? Promise.resolve() : new Promise((resolve) => client.provider.once("sync", resolve));

function snapshot(elements) {
  const out = {};
  elements.forEach((entry, key) => (out[key] = entry.toJSON()));
  return out;
}

const local = (qname) => qname.slice(qname.lastIndexOf(":") + 1);

function context(doc) {
  const entries = Object.entries(doc);
  const parent = entries.find(([, e]) => local(e.t ?? "") === "process")?.[0];
  const plane = entries.find(([, e]) => local(e.t ?? "") === "BPMNPlane")?.[0];
  return { parent, plane };
}

function lastOrder(doc, parent) {
  let last = null;
  for (const e of Object.values(doc)) if (e.p === parent && e.o && (last === null || e.o > last)) last = e.o;
  return last;
}

const bounds = (b) =>
  `<dc:Bounds height="${b.height}" width="${b.width}" x="${Math.round(b.x)}" y="${Math.round(b.y)}"/>`;
const id = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 9).padEnd(7, "0")}`;
const put = (elements, key, entry) => elements.set(key, new Y.Map(Object.entries(entry)));

const operations = {
  addTask(client, doc) {
    const { parent, plane } = context(doc);
    if (!parent || !plane) return;
    const task = id("Activity");
    client.doc.transact(() => {
      put(client.elements, task, { t: "bpmn:task", p: parent, o: generateKeyBetween(lastOrder(doc, parent), null), "@name": "Task" });
      put(client.elements, `${task}_di`, {
        t: "bpmndi:BPMNShape",
        p: plane,
        o: generateKeyBetween(lastOrder(doc, plane), null),
        "@bpmnElement": task,
        "#dc:Bounds": bounds({ x: rand(0, 1600), y: rand(0, 900), width: 100, height: 80 }),
      });
    });
  },
  connect(client, doc) {
    const { parent, plane } = context(doc);
    const tasks = Object.keys(doc).filter((k) => local(doc[k].t ?? "") === "task");
    if (tasks.length < 2 || !parent || !plane) return;
    const [a, b] = [pick(tasks), pick(tasks)];
    if (a === b) return;
    const flow = id("Flow");
    client.doc.transact(() => {
      put(client.elements, flow, {
        t: "bpmn:sequenceFlow",
        p: parent,
        o: generateKeyBetween(lastOrder(doc, parent), null),
        "@sourceRef": a,
        "@targetRef": b,
      });
      put(client.elements, `${flow}_di`, {
        t: "bpmndi:BPMNEdge",
        p: plane,
        o: generateKeyBetween(lastOrder(doc, plane), null),
        "@bpmnElement": flow,
        "#di:waypoint": '<di:waypoint x="0" y="0"/><di:waypoint x="100" y="100"/>',
      });
    });
  },
  rename(client, doc) {
    const tasks = Object.keys(doc).filter((k) => local(doc[k].t ?? "") === "task");
    if (!tasks.length) return;
    client.elements.get(pick(tasks))?.set("@name", `Task ${Math.floor(rand(0, 1000))}`);
  },
  move(client, doc) {
    const shapes = Object.keys(doc).filter((k) => local(doc[k].t ?? "") === "BPMNShape" && doc[k]["#dc:Bounds"]);
    if (!shapes.length) return;
    const key = pick(shapes);
    client.elements.get(key)?.set("#dc:Bounds", bounds({ x: rand(0, 1600), y: rand(0, 900), width: 100, height: 80 }));
  },
  remove(client, doc) {
    const tasks = Object.keys(doc).filter((k) => local(doc[k].t ?? "") === "task");
    if (tasks.length < 3) return;
    const task = pick(tasks);
    client.doc.transact(() => {
      for (const [key, entry] of Object.entries(doc)) {
        if (key === task || entry["@bpmnElement"] === task || entry["@sourceRef"] === task || entry["@targetRef"] === task) {
          client.elements.delete(key);
        }
      }
    });
  },
};
const weighted = ["addTask", "addTask", "addTask", "connect", "connect", "rename", "rename", "move", "move", "remove"];

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function waitFor(check, timeout, label) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) return;
    await sleep(200);
  }
  throw new Error(`timed out waiting for ${label}`);
}

async function main() {
  const email = "sync-soak@example.com";
  let res = await api("/api/auth/login", { method: "POST", body: { email, password: "sync-soak-local-only" } });
  if (res.status === 401) res = await api("/api/auth/signup", { method: "POST", body: { email, password: "sync-soak-local-only", name: "Soak Test" } });
  if (!res.ok) throw new Error(`sign in failed: ${res.status}`);
  const [workspace] = await (await api("/api/workspaces")).json();
  const project = await (await api(`/api/workspaces/${workspace.id}/projects`, { method: "POST", body: { name: `Soak ${new Date().toISOString()}` } })).json();
  const diagramId = project.previewDiagramId;
  log(`project ${project.id}, diagram ${diagramId}; ${CLIENTS} clients × ${OPS} operations`);

  const clients = Array.from({ length: CLIENTS }, () => connect(diagramId));
  await Promise.all(clients.map(synced));
  log("all clients synced");

  let restarted = false;
  const workers = clients.map(async (client, index) => {
    for (let op = 0; op < OPS; op++) {
      if (Math.random() < 0.04) {
        client.provider.disconnect();
        const offline = rand(400, 1800);
        const edits = Math.floor(rand(1, 5));
        for (let i = 0; i < edits; i++) operations[pick(weighted)](client, snapshot(client.elements));
        await sleep(offline);
        client.provider.connect();
      }
      operations[pick(weighted)](client, snapshot(client.elements));
      await sleep(rand(10, 90));
      if (RESTART && !restarted && index === 0 && op === Math.floor(OPS / 2)) {
        restarted = true;
        log("restarting the API mid-run");
        await new Promise((resolve, reject) => {
          const child = spawn("sh", ["-c", RESTART], { stdio: "inherit" });
          child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`restart command failed: ${code}`))));
        });
      }
    }
  });
  await Promise.all(workers);
  log("edits done, waiting for convergence");

  await waitFor(() => clients.every((c) => c.provider.wsconnected && c.provider.synced), 30000, "reconnects");
  await waitFor(
    () => new Set(clients.map((c) => stableJson(snapshot(c.elements)))).size === 1,
    30000,
    "clients to converge",
  );
  const final = snapshot(clients[0].elements);
  log(`clients converged: ${Object.keys(final).length} entries`);

  await sleep(2500);
  const fresh = connect(diagramId);
  await synced(fresh);
  const same = stableJson(snapshot(fresh.elements)) === stableJson(final);
  log(`fresh client after reload sees the same document: ${same}`);

  const xml = await (await api(`/api/diagrams/${diagramId}/xml`)).text();
  const { rootElement, warnings } = await new BpmnModdle().fromXML(xml, "bpmn:Definitions");
  const bpmnProcess = rootElement.rootElements.find((e) => e.$type === "bpmn:Process");
  const saved = new Set((bpmnProcess.flowElements ?? []).map((e) => e.id));
  const expected = Object.keys(final).filter((k) => local(final[k].t ?? "") === "task");
  const missing = expected.filter((k) => !saved.has(k));
  log(`saved XML: ${saved.size} flow elements, ${warnings.length} import warnings, ${missing.length} tasks missing`);

  for (const c of [...clients, fresh]) c.provider.destroy();
  const ok = same && warnings.length === 0 && missing.length === 0;
  log(ok ? "PASS" : "FAIL");
  process.exitCode = ok ? 0 : 1;
  setTimeout(() => process.exit(process.exitCode), 200);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
