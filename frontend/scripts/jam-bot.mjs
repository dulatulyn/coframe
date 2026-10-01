#!/usr/bin/env node
import { generateKeyBetween } from "fractional-indexing";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const code = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"))?.replace(/[^A-Za-z0-9]/g, "");
if (!code) {
  console.error("usage: node scripts/jam-bot.mjs <JAM-CODE> [--diagram <id>] [--steps 10] [--api http://localhost:8100]");
  process.exit(1);
}
const API = option("api", "http://localhost:8100").replace(/\/$/, "");
const WS = API.replace(/^http/, "ws");
const STEPS = Number(option("steps", "10"));
const BOT = { email: "jam-bot@example.com", password: "jam-bot-local-only", name: "Jam Bot" };
const TASK_NAMES = ["Check stock", "Reserve items", "Send invoice", "Confirm payment", "Pack order", "Notify customer"];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rand = (min, max) => min + Math.random() * (max - min);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const log = (...parts) => console.log(new Date().toLocaleTimeString(), ...parts);
const names = [...TASK_NAMES].sort(() => Math.random() - 0.5);
let nameIndex = 0;
const nextName = () => names[nameIndex++ % names.length];

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

async function signIn() {
  let res = await api("/api/auth/login", { method: "POST", body: { email: BOT.email, password: BOT.password } });
  if (res.status === 401) res = await api("/api/auth/signup", { method: "POST", body: BOT });
  if (!res.ok) throw new Error(`sign in failed: ${res.status} ${await res.text()}`);
  await api("/api/auth/me", { method: "PATCH", body: { color: "#12A594" } });
}

async function joinDiagram() {
  const joined = await api(`/api/jams/${code}/join`, { method: "POST" });
  if (!joined.ok) throw new Error(`cannot join jam ${code}: ${joined.status} ${await joined.text()}`);
  const { projectId } = await joined.json();
  const wanted = option("diagram", null);
  if (wanted) return wanted;
  const tree = await (await api(`/api/projects/${projectId}/tree`)).json();
  const latest = [...tree.diagrams].sort((a, b) => b.contentUpdatedAt.localeCompare(a.contentUpdatedAt))[0];
  if (!latest) throw new Error("the jam's project has no diagrams");
  log(`joined jam ${code} → “${tree.project.name}” / “${latest.name}”`);
  return latest.id;
}

const localName = (qname) => qname.slice(qname.lastIndexOf(":") + 1);
const prefixOf = (qname) => qname.slice(0, qname.lastIndexOf(":") + 1);

function snapshot(elements) {
  const doc = {};
  elements.forEach((entry, key) => (doc[key] = entry.toJSON()));
  return doc;
}

function boundsKey(entry) {
  return Object.keys(entry).find((k) => k.startsWith("#") && localName(k.slice(1)) === "Bounds");
}

function boundsOf(entry) {
  const key = boundsKey(entry);
  if (!key) return null;
  const read = (name) => Number(entry[key].match(new RegExp(`\\s${name}="([^"]+)"`))?.[1] ?? NaN);
  const b = { x: read("x"), y: read("y"), width: read("width"), height: read("height") };
  return Object.values(b).every(Number.isFinite) ? b : null;
}

function boundsXml(qname, b) {
  const r = (n) => Math.round(n);
  return `<${qname} height="${r(b.height)}" width="${r(b.width)}" x="${r(b.x)}" y="${r(b.y)}"/>`;
}

function lastOrder(doc, parent) {
  let last = null;
  for (const entry of Object.values(doc)) if (entry.p === parent && entry.o && (last === null || entry.o > last)) last = entry.o;
  return last;
}

const newId = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 9).padEnd(7, "0")}`;

const FLOW_NODE = /(task|Task|event|Event|gateway|Gateway|subProcess|callActivity|transaction)$/;

function flowNodes(doc) {
  const nodes = [];
  for (const [key, entry] of Object.entries(doc)) {
    if (localName(entry.t ?? "") !== "BPMNShape") continue;
    const semanticId = entry["@bpmnElement"];
    const semantic = doc[semanticId];
    const bounds = boundsOf(entry);
    if (!semantic || !bounds || !FLOW_NODE.test(localName(semantic.t)) || localName(semantic.t) === "boundaryEvent") continue;
    nodes.push({ id: semanticId, diKey: key, bounds, semantic });
  }
  return nodes;
}

const center = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
const overlaps = (a, b, gap = 20) =>
  a.x < b.x + b.width + gap && b.x < a.x + a.width + gap && a.y < b.y + b.height + gap && b.y < a.y + a.height + gap;

async function main() {
  await signIn();
  const diagramId = await joinDiagram();

  class CookieSocket extends WebSocket {
    constructor(url, protocols) {
      super(url, { protocols, headers: { cookie } });
    }
  }
  const doc = new Y.Doc();
  const elements = doc.getMap("elements");
  const provider = new WebsocketProvider(`${WS}/api/ws/diagrams`, diagramId, doc, {
    WebSocketPolyfill: CookieSocket,
    disableBc: true,
  });
  provider.messageHandlers[100] = () => {};
  provider.on("connection-close", (event) => event && event.code >= 4400 && log(`server closed the room: ${event.code} ${event.reason}`));
  await new Promise((resolve) => provider.once("sync", resolve));
  log("connected, document synced");

  const awareness = provider.awareness;
  const plane = () => Object.entries(snapshot(elements)).find(([, e]) => localName(e.t ?? "") === "BPMNPlane");
  awareness.setLocalState({ cursor: null, root: plane()?.[1]["@bpmnElement"] ?? null, selection: [] });

  let pointer = null;
  const setPointer = (p) => {
    pointer = p;
    awareness.setLocalStateField("cursor", { x: Math.round(p.x), y: Math.round(p.y) });
  };
  const select = (ids) => awareness.setLocalStateField("selection", ids);

  async function glide(to, duration = rand(650, 1100)) {
    const from = pointer ?? { x: to.x - 220, y: to.y - 140 };
    const bend = rand(-0.18, 0.18);
    const steps = Math.max(8, Math.round(duration / 40));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const nx = -(to.y - from.y) * bend;
      const ny = (to.x - from.x) * bend;
      const arc = Math.sin(Math.PI * e);
      setPointer({ x: from.x + (to.x - from.x) * e + nx * arc, y: from.y + (to.y - from.y) * e + ny * arc });
      await sleep(40);
    }
  }

  async function wander(duration) {
    const end = Date.now() + duration;
    while (Date.now() < end && pointer) {
      await glide({ x: pointer.x + rand(-40, 40), y: pointer.y + rand(-25, 25) }, rand(300, 600));
      await sleep(rand(150, 400));
    }
  }

  async function typeName(id, text) {
    for (let i = 1; i <= text.length; i++) {
      const entry = elements.get(id);
      if (!entry) return;
      entry.set("@name", text.slice(0, i));
      await sleep(rand(70, 150));
    }
  }

  function fitPool(current, processId, shape) {
    const participant = Object.entries(current).find(([, e]) => localName(e.t ?? "") === "participant" && e["@processRef"] === processId);
    if (!participant) return;
    const poolDi = Object.entries(current).find(([, e]) => e["@bpmnElement"] === participant[0] && boundsOf(e));
    if (!poolDi) return;
    const [poolKey, poolEntry] = poolDi;
    const pool = boundsOf(poolEntry);
    const right = Math.max(pool.x + pool.width, shape.x + shape.width + 50);
    const bottom = Math.max(pool.y + pool.height, shape.y + shape.height + 40);
    if (right === pool.x + pool.width && bottom === pool.y + pool.height) return;
    const key = boundsKey(poolEntry);
    elements.get(poolKey)?.set(key, boundsXml(key.slice(1), { ...pool, width: right - pool.x, height: bottom - pool.y }));
    for (const [laneKey, laneEntry] of Object.entries(current)) {
      const semantic = current[laneEntry["@bpmnElement"]];
      const lane = boundsOf(laneEntry);
      if (!semantic || localName(semantic.t) !== "lane" || !lane) continue;
      if (Math.abs(lane.x + lane.width - (pool.x + pool.width)) > 1) continue;
      const laneBoundsKey = boundsKey(laneEntry);
      elements.get(laneKey)?.set(laneBoundsKey, boundsXml(laneBoundsKey.slice(1), { ...lane, width: right - lane.x }));
    }
  }

  async function appendTask(source) {
    const current = snapshot(elements);
    const planeEntry = plane();
    if (!planeEntry) return false;
    const [planeKey] = planeEntry;
    const nodes = flowNodes(current);
    const src = source.bounds;
    const size = { width: 100, height: 80 };
    let spot = { x: src.x + src.width + 60, y: center(src).y - size.height / 2, ...size };
    for (let attempt = 0; attempt < 6 && nodes.some((n) => overlaps(n.bounds, spot)); attempt++) spot = { ...spot, y: spot.y + 120 };
    if (nodes.some((n) => overlaps(n.bounds, spot))) return false;

    const parent = source.semantic.p;
    const bp = prefixOf(source.semantic.t);
    const shapeTag = current[source.diKey].t;
    const dcBounds = boundsKey(current[source.diKey]).slice(1);
    const waypointKey =
      Object.values(current).flatMap((e) => Object.keys(e)).find((k) => k.startsWith("#") && localName(k) === "waypoint") ??
      `#${prefixOf(dcBounds) === "dc:" ? "di:" : prefixOf(dcBounds)}waypoint`;
    const wp = waypointKey.slice(1);

    const taskId = newId("Activity");
    const flowId = newId("Flow");
    const start = { x: src.x + src.width, y: center(src).y };
    const end = { x: spot.x, y: spot.y + spot.height / 2 };
    const points =
      Math.abs(start.y - end.y) < 1
        ? [start, end]
        : [start, { x: (start.x + end.x) / 2, y: start.y }, { x: (start.x + end.x) / 2, y: end.y }, end];

    await glide({ x: spot.x + 50, y: spot.y + 40 });
    doc.transact(() => {
      const orderTask = generateKeyBetween(lastOrder(current, parent), null);
      const orderFlow = generateKeyBetween(orderTask, null);
      const orderShape = generateKeyBetween(lastOrder(current, planeKey), null);
      const orderEdge = generateKeyBetween(orderShape, null);
      const put = (key, entry) => elements.set(key, new Y.Map(Object.entries(entry)));
      put(taskId, { t: `${bp}task`, p: parent, o: orderTask });
      put(flowId, { t: `${bp}sequenceFlow`, p: parent, o: orderFlow, "@sourceRef": source.id, "@targetRef": taskId });
      put(`${taskId}_di`, { t: shapeTag, p: planeKey, o: orderShape, "@bpmnElement": taskId, [`#${dcBounds}`]: boundsXml(dcBounds, spot) });
      put(`${flowId}_di`, {
        t: shapeTag.replace(/Shape$/, "Edge"),
        p: planeKey,
        o: orderEdge,
        "@bpmnElement": flowId,
        [waypointKey]: points.map((p) => `<${wp} x="${Math.round(p.x)}" y="${Math.round(p.y)}"/>`).join(""),
      });
      for (const [laneKey, lane] of Object.entries(current)) {
        const ref = Object.keys(lane).find((k) => k.startsWith("~") && k.endsWith(`|${source.id}`));
        if (ref) elements.get(laneKey)?.set(`${ref.slice(0, ref.lastIndexOf("|"))}|${taskId}`, "1");
      }
      if (current[parent] && localName(current[parent].t) === "process") fitPool(current, parent, spot);
    });
    select([taskId]);
    await sleep(500);
    const name = nextName();
    log(`appending “${name}” after ${source.semantic["@name"] ? `“${source.semantic["@name"]}”` : source.id}`);
    await typeName(taskId, name);
    await sleep(700);
    return true;
  }

  async function lookAt(node) {
    await glide({ x: node.bounds.x + node.bounds.width * rand(0.3, 0.7), y: node.bounds.y + node.bounds.height * rand(0.3, 0.7) });
    select([node.id]);
    await wander(rand(900, 1800));
    select([]);
  }

  let stopping = false;
  const leave = async () => {
    if (stopping) return;
    stopping = true;
    log("leaving the jam");
    awareness.setLocalState(null);
    await sleep(300);
    provider.destroy();
    process.exit(0);
  };
  process.on("SIGINT", leave);
  process.on("SIGTERM", leave);

  for (let step = 1; step <= STEPS && !stopping; step++) {
    const nodes = flowNodes(snapshot(elements));
    if (nodes.length === 0) {
      log("the diagram has no flow nodes yet, waiting…");
      await sleep(3000);
      continue;
    }
    const current = snapshot(elements);
    const ends = nodes.filter(
      (n) => !Object.values(current).some((e) => localName(e.t ?? "") === "sequenceFlow" && e["@sourceRef"] === n.id) && !/endEvent$/.test(n.semantic.t),
    );
    if (step % 2 === 0 && ends.length > 0) {
      const target = pick(ends);
      await lookAt(target);
      if (!(await appendTask(target))) log("no free space next to it, skipping");
    } else {
      const target = pick(nodes);
      log(`looking at ${target.semantic["@name"] ? `“${target.semantic["@name"]}”` : target.id}`);
      await lookAt(target);
    }
    await sleep(rand(400, 900));
  }
  await leave();
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
