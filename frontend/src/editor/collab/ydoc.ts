import * as Y from "yjs";

import type { Entry, FlatDiff, FlatDoc } from "./flat";

export type ElementsMap = Y.Map<Y.Map<string>>;

export const ELEMENTS = "elements";

export function getElements(doc: Y.Doc): ElementsMap {
  return doc.getMap(ELEMENTS) as ElementsMap;
}

export function readElements(elements: ElementsMap): FlatDoc {
  const out: FlatDoc = {};
  elements.forEach((entry, key) => {
    out[key] = entry.toJSON() as Entry;
  });
  return out;
}

function entryMap(entry: Entry): Y.Map<string> {
  const map = new Y.Map<string>();
  for (const [field, value] of Object.entries(entry)) map.set(field, value);
  return map;
}

export function applyDiff(elements: ElementsMap, diff: FlatDiff): void {
  for (const key of diff.deleted) elements.delete(key);
  for (const [key, entry] of Object.entries(diff.created)) elements.set(key, entryMap(entry));
  for (const [key, patch] of Object.entries(diff.updated)) {
    const map = elements.get(key);
    if (!map) continue;
    for (const [field, value] of Object.entries(patch.set)) map.set(field, value);
    for (const field of patch.remove) map.delete(field);
  }
}

export function replaceAll(elements: ElementsMap, doc: FlatDoc): void {
  for (const key of Array.from(elements.keys())) if (!(key in doc)) elements.delete(key);
  for (const [key, entry] of Object.entries(doc)) {
    const map = elements.get(key);
    if (!map) {
      elements.set(key, entryMap(entry));
      continue;
    }
    for (const field of Array.from(map.keys())) if (!(field in entry)) map.delete(field);
    for (const [field, value] of Object.entries(entry)) if (map.get(field) !== value) map.set(field, value);
  }
}
