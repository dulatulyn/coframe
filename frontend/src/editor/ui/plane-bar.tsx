"use client";

import { ArrowLeft, Maximize2 } from "lucide-react";
import { useEffect, useState } from "react";

import { service, type BpmnEditor } from "../modeler";
import { isCollapsedSubProcess, toggleSubProcess } from "../subprocess";

type Element = any;

function rootOf(element: Element): Element {
  let current = element;
  while (current?.parent) current = current.parent;
  return current;
}

export function PlaneBar({ editor, readOnly }: { editor: BpmnEditor; readOnly: boolean }) {
  const [root, setRoot] = useState<Element | null>(() => service(editor, "canvas").getRootElement());

  useEffect(() => {
    const eventBus = service(editor, "eventBus");
    const onRoot = ({ element }: { element: Element }) => {
      setRoot(element);
      if (!element?.id?.endsWith("_plane")) return;
      requestAnimationFrame(() => {
        const canvas = service(editor, "canvas");
        canvas.zoom("fit-viewport", "auto");
        const { scale } = canvas.viewbox();
        canvas.zoom(Math.min(1, scale * 0.85), "auto");
      });
    };
    eventBus.on("root.set", onRoot);
    return () => eventBus.off("root.set", onRoot);
  }, [editor]);

  const planeId: string | undefined = root?.id;
  if (!planeId?.endsWith("_plane")) return null;
  const registry = service(editor, "elementRegistry");
  const shape = registry.get(planeId.replace(/_plane$/, ""));
  if (!shape) return null;
  const outer = rootOf(shape);
  const name = shape.businessObject?.name || "Sub-process";
  const parentName = shape.parent?.businessObject?.name || outer?.businessObject?.name || "the process";

  const back = () => {
    const canvas = service(editor, "canvas");
    canvas.setRootElement(outer);
    service(editor, "selection").select(shape);
    canvas.scrollToElement(shape);
  };

  return (
    <div className="absolute left-1/2 top-[76px] z-30 flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-1.5 rounded-full border border-hairline bg-paper py-1.5 pl-1.5 pr-1.5 shadow-pop sm:top-20">
      <button
        type="button"
        onClick={back}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-ink px-3 text-[13px] font-medium text-paper hover:bg-ink/85"
      >
        <ArrowLeft className="size-3.5" /> Back to {parentName}
      </button>
      <span className="min-w-0 truncate px-2 text-[13px] text-slate">
        Inside <span className="font-medium text-ink">{name}</span>
      </span>
      {!readOnly && isCollapsedSubProcess(shape) && (
        <button
          type="button"
          onClick={() => {
            back();
            toggleSubProcess(editor, shape);
          }}
          title="Show this content inside the sub-process on the main diagram"
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium hover:bg-fog"
        >
          <Maximize2 className="size-3.5" /> Show on diagram
        </button>
      )}
    </div>
  );
}
