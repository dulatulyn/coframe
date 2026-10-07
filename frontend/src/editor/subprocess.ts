import { getBBox, selfAndAllChildren } from "diagram-js/lib/util/Elements";

import { service, type BpmnEditor } from "./modeler";

type Element = any;
type Bounds = { x: number; y: number; width: number; height: number };

export const TOGGLE_SUBPROCESS_COMMAND = "coframe.subprocess.toggle";

const PAD_X = 40;
const PAD_TOP = 44;
const PAD_BOTTOM = 36;
const MIN_WIDTH = 350;
const MIN_HEIGHT = 200;
const COLLAPSED = { width: 100, height: 80 };

export function isCollapsedSubProcess(element: Element): boolean {
  return element?.type === "bpmn:SubProcess" && element.di?.isExpanded === false && !element.businessObject?.triggeredByEvent;
}

export function isExpandedSubProcess(element: Element): boolean {
  return element?.type === "bpmn:SubProcess" && element.di?.isExpanded !== false && !element.businessObject?.triggeredByEvent;
}

function content(children: Element[]): Element[] {
  return children.filter((c: Element) => c.type !== "label");
}

class ToggleSubProcessHandler {
  static $inject = ["injector"];

  constructor(private injector: { get(name: string): any }) {}

  preExecute(context: { shape: Element; result?: Element }) {
    const get = (name: string) => this.injector.get(name);
    const registry = get("elementRegistry");
    const modeling = get("modeling");
    const spaceTool = get("spaceTool");
    const bpmnReplace = get("bpmnReplace");
    const shape: Element = context.shape;
    const parent: Element = shape.parent;
    const old: Bounds = { x: shape.x, y: shape.y, width: shape.width, height: shape.height };

    const makeSpace = (axis: "x" | "y", delta: number, start: number, direction: "e" | "w" | "n" | "s", keep: Element) => {
      if (!delta) return;
      const all = [...selfAndAllChildren(parent.children ?? [], true), ...(parent.attachers ?? [])];
      const others = all.filter((e: Element) => e !== keep && !selfAndAllChildren([keep], true).includes(e));
      const { movingShapes, resizingShapes } = spaceTool.calculateAdjustments(others, axis, delta, start);
      const vector = axis === "x" ? { x: delta, y: 0 } : { x: 0, y: delta };
      modeling.createSpace(movingShapes, resizingShapes, vector, direction, start);
    };

    if (isCollapsedSubProcess(shape)) {
      const plane = registry.get(`${shape.id}_plane`);
      const inner = content(plane?.children ?? []);
      const box = inner.length ? getBBox(inner) : { x: 0, y: 0, width: 0, height: 0 };
      const width = Math.max(MIN_WIDTH, box.width + PAD_X * 2);
      const height = Math.max(MIN_HEIGHT, box.height + PAD_TOP + PAD_BOTTOM);
      const dx = width - old.width;
      const dy = height - old.height;
      makeSpace("x", dx, old.x + old.width, "e", shape);
      makeSpace("y", Math.ceil(dy / 2), old.y + old.height, "s", shape);
      makeSpace("y", -Math.ceil(dy / 2), old.y, "n", shape);
      const expanded = bpmnReplace.replaceElement(shape, { type: "bpmn:SubProcess", isExpanded: true });
      const target = { x: old.x, y: old.y - Math.ceil(dy / 2), width, height };
      modeling.resizeShape(expanded, target);
      const moved = content(expanded.children ?? []);
      if (moved.length) {
        const now = getBBox(moved);
        const delta = {
          x: Math.round(target.x + (width - now.width) / 2 - now.x),
          y: Math.round(target.y + PAD_TOP + (height - PAD_TOP - PAD_BOTTOM - now.height) / 2 - now.y),
        };
        if (delta.x || delta.y) modeling.moveElements(moved, delta, expanded);
      }
      for (const connection of [...(expanded.incoming ?? []), ...(expanded.outgoing ?? [])]) modeling.layoutConnection(connection);
      context.result = expanded;
      return;
    }

    if (isExpandedSubProcess(shape)) {
      const collapsed = bpmnReplace.replaceElement(shape, { type: "bpmn:SubProcess", isExpanded: false });
      const target = {
        x: old.x,
        y: Math.round(old.y + old.height / 2 - COLLAPSED.height / 2),
        width: COLLAPSED.width,
        height: COLLAPSED.height,
      };
      modeling.resizeShape(collapsed, target);
      const dx = old.width - COLLAPSED.width;
      const dy = Math.floor((old.height - COLLAPSED.height) / 2);
      const siblings = (parent.children ?? []).filter(
        (e: Element) => e !== collapsed && e.type !== "label" && !e.waypoints && e.type !== "bpmn:Lane" && !e.host,
      );
      const shift = (list: Element[], delta: { x: number; y: number }) => {
        if (list.length && (delta.x || delta.y)) modeling.moveElements(list, delta);
      };
      shift(
        siblings.filter((e: Element) => e.x >= old.x + old.width),
        { x: -dx, y: 0 },
      );
      shift(
        siblings.filter((e: Element) => e.y >= old.y + old.height),
        { x: 0, y: -dy },
      );
      shift(
        siblings.filter((e: Element) => e.y + e.height <= old.y),
        { x: 0, y: dy },
      );
      for (const connection of [...(collapsed.incoming ?? []), ...(collapsed.outgoing ?? [])]) modeling.layoutConnection(connection);
      context.result = collapsed;
    }
  }

  execute() {
    return [];
  }

  revert() {
    return [];
  }
}

type Get = (name: string) => any;

function runToggle(get: Get, shape: Element): Element | null {
  const commandStack = get("commandStack");
  if (!commandStack._handlerMap?.[TOGGLE_SUBPROCESS_COMMAND]) {
    commandStack.registerHandler(TOGGLE_SUBPROCESS_COMMAND, ToggleSubProcessHandler);
  }
  const context: { shape: Element; result?: Element } = { shape };
  commandStack.execute(TOGGLE_SUBPROCESS_COMMAND, context);
  const result = context.result ?? null;
  if (result) get("selection").select(result);
  return result;
}

export function toggleSubProcess(editor: BpmnEditor, shape: Element): Element | null {
  return runToggle((name) => service(editor, name), shape);
}

const icon = (body: string) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#18181b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`,
  );
const EXPAND_ICON = icon('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>');
const COLLAPSE_ICON = icon('<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>');

class SubProcessPadProvider {
  static $inject = ["contextPad", "injector"];

  constructor(
    contextPad: { registerProvider(priority: number, provider: unknown): void },
    private injector: { get(name: string): any },
  ) {
    contextPad.registerProvider(390, this);
  }

  getContextPadEntries(element: Element) {
    const collapsed = isCollapsedSubProcess(element);
    if (!collapsed && !isExpandedSubProcess(element)) return {};
    return {
      "coframe-subprocess-toggle": {
        group: "coframe",
        imageUrl: collapsed ? EXPAND_ICON : COLLAPSE_ICON,
        title: collapsed ? "Show the content on the diagram" : "Collapse into a separate page",
        action: { click: (_event: Event, target: Element) => runToggle((name) => this.injector.get(name), target) },
      },
    };
  }
}

export const SubProcessPadModule = {
  __init__: ["coframeSubProcessPad"],
  coframeSubProcessPad: ["type", SubProcessPadProvider],
};
