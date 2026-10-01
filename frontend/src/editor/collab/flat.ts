import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

export type Entry = Record<string, string>;
export type FlatDoc = Record<string, Entry>;

export const ROOT_KEY_FALLBACK = "__root__";

const DERIVED_CHILDREN = new Set(["incoming", "outgoing"]);
const SET_CHILDREN = new Set(["flowNodeRef"]);
const FIRST_CONTENT = ["documentation", "extensionElements"];
const DI_TAGS = new Set(["BPMNShape", "BPMNEdge"]);
const FLOW_TAGS = new Set(["sequenceFlow", "messageFlow", "association"]);
const DATA_ASSOCIATION_TAGS = new Set(["dataInputAssociation", "dataOutputAssociation"]);
const ID_IN_CONTENT = /\sid="([^"]+)"/g;
const TEXT_IN_CONTENT = />([^<]*)</g;

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const CDATA_NODE = 4;

export function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "&#10;")
    .replace(/\r/g, "&#13;")
    .replace(/\t/g, "&#9;");
}

export function localName(qname: string): string {
  const i = qname.lastIndexOf(":");
  return i === -1 ? qname : qname.slice(i + 1);
}

function prefixOf(qname: string): string {
  const i = qname.lastIndexOf(":");
  return i === -1 ? "" : qname.slice(0, i + 1);
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function attributes(el: Element): [string, string][] {
  return Array.from(el.attributes, (a) => [a.name, a.value] as [string, string]);
}

function isText(node: Node): boolean {
  return node.nodeType === TEXT_NODE || node.nodeType === CDATA_NODE;
}

function ownText(el: Element): string {
  let text = "";
  el.childNodes.forEach((n) => {
    if (isText(n)) text += n.nodeValue ?? "";
  });
  return text;
}

function elementChildren(el: Element): Element[] {
  return Array.from(el.childNodes).filter((n): n is Element => n.nodeType === ELEMENT_NODE);
}

export function serializeContent(el: Element): string {
  const qn = el.tagName;
  let out = `<${qn}`;
  for (const [name, value] of attributes(el).sort((a, b) => cmp(a[0], b[0]))) {
    out += ` ${name}="${escapeAttr(value)}"`;
  }
  const hasElements = elementChildren(el).length > 0;
  let inner = "";
  el.childNodes.forEach((n) => {
    if (n.nodeType === ELEMENT_NODE) {
      inner += serializeContent(n as Element);
    } else if (isText(n)) {
      const text = n.nodeValue ?? "";
      if (!hasElements || text.trim()) inner += escapeText(text);
    }
  });
  return inner ? `${out}>${inner}</${qn}>` : `${out}/>`;
}

export class InvalidXmlError extends Error {}

export function parseXml(xml: string): Document {
  if (/<!DOCTYPE|<!ENTITY/.test(xml)) throw new InvalidXmlError("doctype_not_allowed");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) throw new InvalidXmlError("malformed_xml");
  return doc;
}

export function flattenXml(xml: string): FlatDoc {
  const root = parseXml(xml).documentElement;
  const entries: FlatDoc = {};
  const childOrder = new Map<string, string[]>();

  const entryId = (el: Element): string | null => {
    const value = el.getAttribute("id");
    if (!value || value in entries || value === ROOT_KEY_FALLBACK) return null;
    return value;
  };

  const visit = (el: Element, key: string, parentKey: string) => {
    const entry: Entry = { t: el.tagName, p: parentKey };
    for (const [name, value] of attributes(el)) {
      if (name !== "id") entry[`@${name}`] = value;
    }
    const text = ownText(el);
    if (text.trim()) entry.x = text;
    entries[key] = entry;
    if (!childOrder.has(parentKey)) childOrder.set(parentKey, []);
    childOrder.get(parentKey)!.push(key);

    const groups = new Map<string, string[]>();
    for (const child of elementChildren(el)) {
      const childKey = entryId(child);
      if (childKey !== null) {
        visit(child, childKey, key);
        continue;
      }
      const qn = child.tagName;
      const local = localName(qn);
      const leaf = elementChildren(child).length === 0;
      if (DERIVED_CHILDREN.has(local) && leaf) continue;
      if (SET_CHILDREN.has(local) && leaf) {
        entry[`~${qn}|${ownText(child).trim()}`] = "1";
        continue;
      }
      if (!groups.has(qn)) groups.set(qn, []);
      groups.get(qn)!.push(serializeContent(child));
    }
    for (const [qn, parts] of groups) entry[`#${qn}`] = parts.join("");
  };

  visit(root, root.getAttribute("id") || ROOT_KEY_FALLBACK, "");
  for (const keys of childOrder.values()) {
    const orders = generateNKeysBetween(null, null, keys.length);
    keys.forEach((key, i) => (entries[key].o = orders[i]));
  }
  return entries;
}

function contentIds(doc: FlatDoc): Set<string> {
  const found = new Set<string>();
  for (const entry of Object.values(doc)) {
    for (const [key, value] of Object.entries(entry)) {
      if (!key.startsWith("#")) continue;
      for (const m of value.matchAll(ID_IN_CONTENT)) found.add(m[1]);
    }
  }
  return found;
}

function contentRefs(entry: Entry, tagLocal: string): string[] {
  const refs: string[] = [];
  for (const [key, value] of Object.entries(entry)) {
    if (!key.startsWith("#") || localName(key.slice(1)) !== tagLocal) continue;
    for (const m of value.matchAll(TEXT_IN_CONTENT)) {
      const t = m[1].trim();
      if (t) refs.push(t);
    }
  }
  return refs;
}

function orderOf(doc: FlatDoc, key: string): [string, string] {
  return [doc[key].o ?? "", key];
}

function byOrder(doc: FlatDoc) {
  return (a: string, b: string) => {
    const [oa, ka] = orderOf(doc, a);
    const [ob, kb] = orderOf(doc, b);
    return cmp(oa, ob) || cmp(ka, kb);
  };
}

function fixPlane(doc: FlatDoc, planeKey: string, drop: (key: string) => void) {
  const diagramKey = doc[planeKey].p ?? "";
  const rootKey = doc[diagramKey]?.p ?? "";
  const diagrams = Object.keys(doc)
    .filter((k) => doc[k].p === rootKey && localName(doc[k].t ?? "") === "BPMNDiagram")
    .sort(byOrder(doc));
  if (diagrams.length > 0 && diagrams[0] === diagramKey) {
    const candidates = Object.keys(doc)
      .filter((k) => doc[k].p === rootKey && ["collaboration", "process"].includes(localName(doc[k].t ?? "")))
      .sort((a, b) => {
        const ca = localName(doc[a].t) !== "collaboration" ? 1 : 0;
        const cb = localName(doc[b].t) !== "collaboration" ? 1 : 0;
        return ca - cb || byOrder(doc)(a, b);
      });
    if (candidates.length > 0) {
      doc[planeKey]["@bpmnElement"] = candidates[0];
      return;
    }
  }
  drop(diagramKey || planeKey);
}

export function sanitize(input: FlatDoc): FlatDoc {
  const doc: FlatDoc = {};
  for (const [k, v] of Object.entries(input)) doc[k] = { ...v };

  const roots = Object.keys(doc).filter((k) => (doc[k].p ?? "") === "");
  if (roots.length > 1) {
    const sorted = [...roots].sort(cmp);
    const keep = sorted.find((k) => localName(doc[k].t) === "definitions") ?? sorted[0];
    for (const k of roots) if (k !== keep) delete doc[k];
  }

  let changed = true;
  while (changed) {
    changed = false;
    const ids = new Set([...Object.keys(doc), ...contentIds(doc)]);
    const drop = (key: string) => {
      if (key in doc) {
        delete doc[key];
        changed = true;
      }
    };

    for (const key of Object.keys(doc)) {
      const entry = doc[key];
      if (!entry) continue;
      const parent = entry.p ?? "";
      if (parent && !(parent in doc)) {
        drop(key);
        continue;
      }
      const local = localName(entry.t ?? "");
      if (DI_TAGS.has(local) && !ids.has(entry["@bpmnElement"])) {
        drop(key);
      } else if (FLOW_TAGS.has(local) && (!ids.has(entry["@sourceRef"]) || !ids.has(entry["@targetRef"]))) {
        drop(key);
      } else if (
        DATA_ASSOCIATION_TAGS.has(local) &&
        [...contentRefs(entry, "sourceRef"), ...contentRefs(entry, "targetRef")].some((r) => !ids.has(r))
      ) {
        drop(key);
      } else if (local === "boundaryEvent" && !ids.has(entry["@attachedToRef"])) {
        drop(key);
      } else if (local === "BPMNPlane" && !ids.has(entry["@bpmnElement"])) {
        fixPlane(doc, key, drop);
      }
    }

    for (const entry of Object.values(doc)) {
      for (const attr of ["@default", "@processRef"]) {
        if (attr in entry && !ids.has(entry[attr])) {
          delete entry[attr];
          changed = true;
        }
      }
      for (const setKey of Object.keys(entry).filter((k) => k.startsWith("~"))) {
        if (!ids.has(setKey.split("|").slice(1).join("|"))) {
          delete entry[setKey];
          changed = true;
        }
      }
    }

    const seen = new Set<string>();
    const diKeys = Object.keys(doc)
      .filter((k) => DI_TAGS.has(localName(doc[k].t ?? "")))
      .sort(byOrder(doc));
    for (const key of diKeys) {
      const target = doc[key]["@bpmnElement"] ?? "";
      if (seen.has(target)) drop(key);
      else seen.add(target);
    }
  }
  return doc;
}

function contentRank(key: string): number {
  const i = FIRST_CONTENT.indexOf(localName(key.slice(1)));
  return i === -1 ? FIRST_CONTENT.length : i;
}

export function reconstructXml(input: FlatDoc, { clean = true }: { clean?: boolean } = {}): string {
  const doc = clean ? sanitize(input) : input;
  const children = new Map<string, string[]>();
  let rootKey: string | null = null;
  for (const [key, entry] of Object.entries(doc)) {
    const parent = entry.p ?? "";
    if (parent === "") rootKey = key;
    else {
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent)!.push(key);
    }
  }
  if (rootKey === null) throw new Error("document has no root entry");
  for (const keys of children.values()) keys.sort(byOrder(doc));

  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  const push = (map: Map<string, string[]>, key: string, value: string) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(value);
  };
  const collectFlows = (key: string) => {
    const entry = doc[key];
    if (localName(entry.t) === "sequenceFlow") {
      push(outgoing, entry["@sourceRef"] ?? "", key);
      push(incoming, entry["@targetRef"] ?? "", key);
    }
    for (const child of children.get(key) ?? []) collectFlows(child);
  };
  collectFlows(rootKey);

  const out: string[] = ['<?xml version="1.0" encoding="UTF-8"?>\n'];
  const emit = (key: string) => {
    const entry = doc[key];
    const tag = entry.t;
    out.push(`<${tag}`);
    if (key !== ROOT_KEY_FALLBACK) out.push(` id="${escapeAttr(key)}"`);
    for (const name of Object.keys(entry).filter((k) => k.startsWith("@")).sort(cmp)) {
      out.push(` ${name.slice(1)}="${escapeAttr(entry[name])}"`);
    }
    const body: string[] = [];
    if ("x" in entry) body.push(escapeText(entry.x));
    const contentKeys = Object.keys(entry)
      .filter((k) => k.startsWith("#"))
      .sort((a, b) => contentRank(a) - contentRank(b) || cmp(a, b));
    const first = contentKeys.filter((k) => FIRST_CONTENT.includes(localName(k.slice(1))));
    const rest = contentKeys.filter((k) => !FIRST_CONTENT.includes(localName(k.slice(1))));
    for (const k of first) body.push(entry[k]);
    const prefix = prefixOf(tag);
    for (const f of incoming.get(key) ?? []) body.push(`<${prefix}incoming>${escapeText(f)}</${prefix}incoming>`);
    for (const f of outgoing.get(key) ?? []) body.push(`<${prefix}outgoing>${escapeText(f)}</${prefix}outgoing>`);
    for (const k of rest) body.push(entry[k]);
    for (const setKey of Object.keys(entry).filter((k) => k.startsWith("~")).sort(cmp)) {
      const [qn, ...value] = setKey.slice(1).split("|");
      body.push(`<${qn}>${escapeText(value.join("|"))}</${qn}>`);
    }
    const kids = children.get(key) ?? [];
    if (body.length === 0 && kids.length === 0) {
      out.push("/>");
      return;
    }
    out.push(">", ...body);
    for (const child of kids) emit(child);
    out.push(`</${tag}>`);
  };
  emit(rootKey);
  return out.join("");
}

export function alignOrder(next: FlatDoc, prev: FlatDoc): FlatDoc {
  const result: FlatDoc = {};
  const groups = new Map<string, string[]>();
  for (const [key, entry] of Object.entries(next)) {
    result[key] = { ...entry };
    const parent = entry.p ?? "";
    if (!groups.has(parent)) groups.set(parent, []);
    groups.get(parent)!.push(key);
  }
  for (const [parent, keys] of groups) {
    keys.sort(byOrder(next));
    const previousKey = (key: string): string | null => {
      const old = prev[key];
      return old && (old.p ?? "") === parent && old.o ? old.o : null;
    };
    let last: string | null = null;
    keys.forEach((key, i) => {
      const candidate = previousKey(key);
      let order: string;
      if (candidate !== null && (last === null || candidate > last)) {
        order = candidate;
      } else {
        let upper: string | null = null;
        for (const later of keys.slice(i + 1)) {
          const c = previousKey(later);
          if (c !== null && (last === null || c > last)) {
            upper = c;
            break;
          }
        }
        order = generateKeyBetween(last, upper);
      }
      result[key].o = order;
      last = order;
    });
  }
  return result;
}

export type EntryPatch = { set: Entry; remove: string[] };
export type FlatDiff = {
  created: FlatDoc;
  deleted: string[];
  updated: Record<string, EntryPatch>;
};

export function diffDocs(prev: FlatDoc, next: FlatDoc): FlatDiff {
  const diff: FlatDiff = { created: {}, deleted: [], updated: {} };
  for (const [key, entry] of Object.entries(next)) {
    const old = prev[key];
    if (!old) {
      diff.created[key] = entry;
      continue;
    }
    const set: Entry = {};
    const remove: string[] = [];
    for (const [field, value] of Object.entries(entry)) if (old[field] !== value) set[field] = value;
    for (const field of Object.keys(old)) if (!(field in entry)) remove.push(field);
    if (Object.keys(set).length > 0 || remove.length > 0) diff.updated[key] = { set, remove };
  }
  for (const key of Object.keys(prev)) if (!(key in next)) diff.deleted.push(key);
  return diff;
}

export function isEmptyDiff(diff: FlatDiff): boolean {
  return (
    Object.keys(diff.created).length === 0 && diff.deleted.length === 0 && Object.keys(diff.updated).length === 0
  );
}
