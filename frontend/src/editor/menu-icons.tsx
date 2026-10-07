import { renderToStaticMarkup } from "react-dom/server";

import { Glyph, type GlyphKind } from "@/components/bpmn/glyphs";

const PROVIDERS = ["bpmn-replace", "bpmn-create", "bpmn-append"];

const SIMPLE: Record<string, GlyphKind> = {
  "bpmn-icon-task": "task",
  "bpmn-icon-user": "task-user",
  "bpmn-icon-service": "task-service",
  "bpmn-icon-send": "task-send",
  "bpmn-icon-receive": "task-receive",
  "bpmn-icon-manual": "task-manual",
  "bpmn-icon-business-rule": "task-business-rule",
  "bpmn-icon-script": "task-script",
  "bpmn-icon-call-activity": "call-activity",
  "bpmn-icon-subprocess-collapsed": "subprocess-collapsed",
  "bpmn-icon-subprocess-expanded": "subprocess-expanded",
  "bpmn-icon-event-subprocess-expanded": "event-subprocess",
  "bpmn-icon-transaction": "transaction",
  "bpmn-icon-gateway-xor": "gateway-exclusive",
  "bpmn-icon-gateway-parallel": "gateway-parallel",
  "bpmn-icon-gateway-or": "gateway-inclusive",
  "bpmn-icon-gateway-eventbased": "gateway-event",
  "bpmn-icon-exclusive-event-based": "gateway-event",
  "bpmn-icon-parallel-event-based-instantiate-gateway": "gateway-event",
  "bpmn-icon-gateway-complex": "gateway-complex",
  "bpmn-icon-data-object": "data-object",
  "bpmn-icon-data-store": "data-store",
  "bpmn-icon-participant": "pool",
  "bpmn-icon-lane": "lane",
  "bpmn-icon-connection": "sequence-flow",
  "bpmn-icon-default-flow": "sequence-flow",
  "bpmn-icon-conditional-flow": "sequence-flow",
};

const RING = {
  start: '<circle cx="12" cy="12" r="8.25"/>',
  intermediate: '<circle cx="12" cy="12" r="8.5" stroke-width="1.2"/><circle cx="12" cy="12" r="6.6" stroke-width="1.2"/>',
  end: '<circle cx="12" cy="12" r="8" stroke-width="2.75"/>',
};

function marker(trigger: string, filled: boolean): string {
  const fill = filled ? 'fill="currentColor"' : "";
  switch (trigger) {
    case "message":
      return `<rect x="8.6" y="9.6" width="6.8" height="4.8" rx="0.6" stroke-width="1.1" ${fill}/><path d="M8.8 10l3.2 2.3 3.2-2.3" stroke-width="1.1" stroke="${filled ? "#fff" : "currentColor"}"/>`;
    case "timer":
      return '<circle cx="12" cy="12" r="4.4" stroke-width="1.1"/><path d="M12 9.6V12l1.6 1" stroke-width="1.1"/>';
    case "signal":
      return `<path d="M12 8.8l3.3 5.7H8.7Z" stroke-width="1.1" ${fill}/>`;
    case "condition":
      return '<rect x="9.3" y="8.6" width="5.4" height="6.8" rx="0.4" stroke-width="1.1"/><path d="M10.4 10.4h3.2M10.4 12h3.2M10.4 13.6h3.2" stroke-width="0.9"/>';
    case "error":
      return `<path d="M9 15.2l1.6-5.6 2.2 3 2.2-3.8-1 6.1-2.1-2.9Z" stroke-width="0.9" ${fill}/>`;
    case "escalation":
      return `<path d="M12 8.4l2.8 6.6L12 13.2 9.2 15Z" stroke-width="1" ${fill}/>`;
    case "compensation":
      return `<path d="M12 9.4v5.2L8.6 12ZM15.6 9.4v5.2L12.2 12Z" stroke-width="1" ${fill}/>`;
    case "cancel":
      return `<path d="M9.6 9.6l4.8 4.8M14.4 9.6l-4.8 4.8" stroke-width="${filled ? 2.2 : 1.6}"/>`;
    case "link":
      return `<path d="M8.8 10.8h3.6V9.3L15.4 12l-3 2.7v-1.5H8.8Z" stroke-width="1.1" ${fill}/>`;
    case "terminate":
      return '<circle cx="12" cy="12" r="4.2" fill="currentColor" stroke="none"/>';
    default:
      return "";
  }
}

function eventSvg(className: string): string | null {
  const match = /^bpmn-icon-(start|intermediate|end)-event-(.+)$/.exec(className);
  if (!match) return null;
  const [, position, rest] = match;
  const nonInterrupting = rest.includes("non-interrupting");
  const throwing = position === "end" || rest.startsWith("throw");
  const trigger = rest.replace(/^(catch|throw)-/, "").replace(/^non-interrupting-/, "");
  let ring = RING[position as keyof typeof RING];
  if (nonInterrupting) ring = ring.replace(/<circle /g, '<circle stroke-dasharray="2.6 2" ');
  return svg(ring + (trigger === "none" ? "" : marker(trigger, throwing)));
}

function svg(body: string): string {
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

const cache = new Map<string, string | null>();

export function menuIcon(className: string | undefined): string | null {
  if (!className) return null;
  const key = className.split(/\s+/).find((c) => c.startsWith("bpmn-icon-"));
  if (!key) return null;
  if (!cache.has(key)) {
    const kind = SIMPLE[key];
    cache.set(key, kind ? renderToStaticMarkup(<Glyph kind={kind} size={22} />) : eventSvg(key));
  }
  return cache.get(key) ?? null;
}

type Entry = { className?: string; imageHtml?: string; imageUrl?: string };

class MenuIcons {
  static $inject = ["popupMenu"];

  constructor(popupMenu: { registerProvider(id: string, priority: number, provider: unknown): void }) {
    for (const id of PROVIDERS) popupMenu.registerProvider(id, 1, this);
  }

  getPopupMenuEntries() {
    return (entries: Record<string, Entry>) => {
      for (const entry of Object.values(entries)) {
        const html = entry.imageUrl || entry.imageHtml ? null : menuIcon(entry.className);
        if (!html) continue;
        entry.imageHtml = html;
        entry.className = (entry.className ?? "").replace(/\bbpmn-icon-[\w-]+/g, "").trim();
      }
      return entries;
    };
  }
}

export const MenuIconsModule = { __init__: ["menuIcons"], menuIcons: ["type", MenuIcons] };
