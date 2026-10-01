import { selfAndAllChildren } from "diagram-js/lib/util/Elements";

import type { AiOp } from "@/lib/api/types";

import { hasService, service, type BpmnEditor } from "../modeler";

export const APPLY_COMMAND = "coframe.ai.apply";
const CHANGED_MARKER = "coframe-ai-changed";
const FOCUS_MARKER = "coframe-focus";

type Element = any;
type Context = { ops: AiOp[]; changed: string[]; skipped: number };

function eventDefinition(event: string | null | undefined): string | undefined {
  if (!event) return undefined;
  return `bpmn:${event.charAt(0).toUpperCase()}${event.slice(1)}EventDefinition`;
}

class ApplyOpsHandler {
  static $inject = ["injector"];

  constructor(private injector: { get(name: string): any }) {}

  preExecute(context: Context) {
    const get = (name: string) => this.injector.get(name);
    const modeling = get("modeling");
    const elementFactory = get("elementFactory");
    const autoPlace = get("autoPlace");
    const bpmnReplace = get("bpmnReplace");
    const registry = get("elementRegistry");
    const canvas = get("canvas");
    const rules = get("bpmnRules");
    const spaceTool = get("spaceTool");
    const refs: Record<string, Element> = {};
    const resolve = (id: string | null | undefined): Element | null => (id ? refs[id] ?? registry.get(id) ?? null : null);
    const mark = (element: Element | null) => element && context.changed.push(element.id);

    const freeSpot = () => {
      const vb = canvas.viewbox();
      return { x: Math.round(vb.x + vb.width / 2), y: Math.round(vb.y + vb.height / 2) };
    };
    const parentAt = (position: { x: number; y: number }) => {
      const root = canvas.getRootElement();
      if (root.type !== "bpmn:Collaboration") return root;
      const pools = registry.filter((e: Element) => e.type === "bpmn:Participant" && e.children?.length !== undefined);
      return (
        pools.find((p: Element) => position.x >= p.x && position.x <= p.x + p.width && position.y >= p.y && position.y <= p.y + p.height) ??
        pools[0] ??
        root
      );
    };

    for (const op of context.ops) {
      try {
        if (op.op === "add") {
          const attrs: Record<string, unknown> = { type: op.type };
          const definition = eventDefinition(op.event);
          if (definition) attrs.eventDefinitionType = definition;
          if (op.type === "bpmn:SubProcess") attrs.isExpanded = false;
          const shape = elementFactory.createShape(attrs);
          let created: Element;
          if (op.type === "bpmn:BoundaryEvent") {
            const host = resolve(op.attachTo);
            if (!host) throw new Error("missing host");
            created = modeling.createShape(shape, { x: host.x + host.width / 2, y: host.y + host.height }, host, { attach: true });
          } else if (op.after) {
            const source = resolve(op.after);
            if (!source) throw new Error("missing source");
            created = autoPlace.append(source, shape);
          } else {
            const position = freeSpot();
            created = modeling.createShape(shape, position, parentAt(position));
          }
          if (op.name) modeling.updateLabel(created, op.name);
          if (op.ref) refs[op.ref] = created;
          mark(created);
        } else if (op.op === "insert") {
          const connection = resolve(op.flow);
          if (!connection?.source || !connection?.target) throw new Error("missing flow");
          const { source, target } = connection;
          const label = connection.businessObject?.name;
          const wasDefault = source.businessObject?.default === connection.businessObject;
          const attrs: Record<string, unknown> = { type: op.type };
          const definition = eventDefinition(op.event);
          if (definition) attrs.eventDefinitionType = definition;
          if (op.type === "bpmn:SubProcess") attrs.isExpanded = false;
          const shape = elementFactory.createShape(attrs);
          const needed = shape.width + 100;
          const gap = target.x - (source.x + source.width);
          if (gap < needed) {
            const start = source.x + source.width + 10;
            const delta = needed - Math.max(gap, 0);
            const root = canvas.getRootElement();
            const children = [...selfAndAllChildren(root), ...(root.attachers || [])];
            const { movingShapes, resizingShapes } = spaceTool.calculateAdjustments(children, "x", delta, start);
            modeling.createSpace(movingShapes, resizingShapes, { x: delta, y: 0 }, "e", start);
          }
          modeling.removeElements([connection]);
          const position = { x: source.x + source.width + 50 + shape.width / 2, y: source.y + source.height / 2 };
          const created = modeling.createShape(shape, position, source.parent);
          const incoming = modeling.connect(source, created, rules.canConnect(source, created));
          modeling.connect(created, target, rules.canConnect(created, target));
          if (label && incoming) modeling.updateLabel(incoming, label);
          if (wasDefault && incoming) modeling.updateProperties(source, { default: incoming.businessObject });
          if (op.name) modeling.updateLabel(created, op.name);
          if (op.ref) refs[op.ref] = created;
          mark(created);
        } else if (op.op === "connect") {
          const source = resolve(op.source);
          const target = resolve(op.target);
          if (!source || !target) throw new Error("missing endpoint");
          const allowed = rules.canConnect(source, target);
          if (!allowed) throw new Error("not allowed");
          const connection = modeling.connect(source, target, allowed);
          if (op.name && connection) modeling.updateLabel(connection, op.name);
          mark(connection);
        } else if (op.op === "rename") {
          const element = resolve(op.element);
          if (!element) throw new Error("missing element");
          modeling.updateLabel(element, op.name ?? "");
          mark(element);
        } else if (op.op === "retype") {
          const element = resolve(op.element);
          if (!element) throw new Error("missing element");
          const replaced = bpmnReplace.replaceElement(element, { type: op.type, eventDefinitionType: eventDefinition(op.event) });
          if (op.element) refs[op.element] = replaced;
          mark(replaced);
        } else if (op.op === "remove") {
          const element = resolve(op.element);
          if (!element) throw new Error("missing element");
          modeling.removeElements([element]);
        } else if (op.op === "set_default") {
          const gateway = resolve(op.element);
          const flow = resolve(op.flow);
          if (!gateway || !flow) throw new Error("missing element");
          modeling.updateProperties(gateway, { default: flow.businessObject });
          mark(flow);
        } else if (op.op === "label_flow") {
          const flow = resolve(op.flow);
          if (!flow) throw new Error("missing flow");
          modeling.updateLabel(flow, op.name ?? "");
          mark(flow);
        }
      } catch {
        context.skipped += 1;
      }
    }
  }

  execute() {
    return [];
  }

  revert() {
    return [];
  }
}

export function applyOps(editor: BpmnEditor, ops: AiOp[]): { changed: string[]; skipped: number } {
  const commandStack = service(editor, "commandStack");
  if (!commandStack._handlerMap?.[APPLY_COMMAND]) commandStack.registerHandler(APPLY_COMMAND, ApplyOpsHandler);
  const context: Context = { ops, changed: [], skipped: 0 };
  commandStack.execute(APPLY_COMMAND, context);
  const changed = [...new Set(context.changed)];
  flash(editor, changed);
  return { changed, skipped: context.skipped };
}

function flash(editor: BpmnEditor, ids: string[]) {
  const canvas = service(editor, "canvas");
  const registry = service(editor, "elementRegistry");
  const present = ids.filter((id) => registry.get(id));
  for (const id of present) canvas.addMarker(id, CHANGED_MARKER);
  setTimeout(() => {
    for (const id of present) if (registry.get(id)) canvas.removeMarker(id, CHANGED_MARKER);
  }, 2600);
}

let focused: string[] = [];

export function focusElements(editor: BpmnEditor, ids: string[]): void {
  const canvas = service(editor, "canvas");
  const registry = service(editor, "elementRegistry");
  for (const id of focused) if (registry.get(id)) canvas.removeMarker(id, FOCUS_MARKER);
  const elements = ids.map((id) => registry.get(id)).filter(Boolean);
  focused = elements.map((e: Element) => e.id);
  if (!elements.length) return;
  for (const element of elements) canvas.addMarker(element.id, FOCUS_MARKER);
  if (hasService(editor, "selection")) service(editor, "selection").select(elements.filter((e: Element) => !e.waypoints || elements.length === 1));

  const boxes = elements.map((e: Element) =>
    e.waypoints
      ? {
          x: Math.min(...e.waypoints.map((p: { x: number }) => p.x)),
          y: Math.min(...e.waypoints.map((p: { y: number }) => p.y)),
          right: Math.max(...e.waypoints.map((p: { x: number }) => p.x)),
          bottom: Math.max(...e.waypoints.map((p: { y: number }) => p.y)),
        }
      : { x: e.x, y: e.y, right: e.x + e.width, bottom: e.y + e.height },
  );
  const box = {
    x: Math.min(...boxes.map((b) => b.x)),
    y: Math.min(...boxes.map((b) => b.y)),
    right: Math.max(...boxes.map((b) => b.right)),
    bottom: Math.max(...boxes.map((b) => b.bottom)),
  };
  const vb = canvas.viewbox();
  const margin = 120 / vb.scale;
  const visible =
    box.x >= vb.x + margin && box.right <= vb.x + vb.width - margin && box.y >= vb.y + margin && box.bottom <= vb.y + vb.height - margin;
  if (visible) return;
  const width = box.right - box.x;
  const height = box.bottom - box.y;
  if (width > vb.width * 0.7 || height > vb.height * 0.7) {
    canvas.viewbox({ x: box.x - width * 0.3, y: box.y - height * 0.3, width: width * 1.6, height: height * 1.6 });
  } else {
    canvas.viewbox({ x: box.x + width / 2 - vb.width / 2, y: box.y + height / 2 - vb.height / 2, width: vb.width, height: vb.height });
  }
}

export function clearFocus(editor: BpmnEditor): void {
  const canvas = service(editor, "canvas");
  const registry = service(editor, "elementRegistry");
  for (const id of focused) if (registry.get(id)) canvas.removeMarker(id, FOCUS_MARKER);
  focused = [];
}
