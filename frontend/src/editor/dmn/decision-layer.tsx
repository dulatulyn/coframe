"use client";

import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";

import { errorMessage } from "@/lib/api/client";
import { useCreateDiagram, useTree, useUpdateDiagram } from "@/lib/api/hooks";
import type { Diagram, Project } from "@/lib/api/types";

import { service, type BpmnEditor } from "../modeler";
import { DecisionBadges } from "./decision-badges";
import { DecisionPanel } from "./decision-panel";
import { DECISION_CREATE_EVENT, DECISION_OPEN_EVENT, isRuleTask, linkedDecisionId } from "./link";

type Element = any;

const RENAME_DELAY_MS = 900;

export function DecisionLayer({
  editor,
  diagram,
  project,
  readOnly,
  version,
  openTask,
  onOpen,
  onClose,
  panelClassName,
}: {
  editor: BpmnEditor;
  diagram: Diagram;
  project: Project;
  readOnly: boolean;
  version: number;
  openTask: string | null;
  onOpen: (taskId: string) => void;
  onClose: () => void;
  panelClassName: string;
}) {
  const { data: tree } = useTree(project.id);
  const create = useCreateDiagram(project.id);
  const rename = useUpdateDiagram(project.id);
  const names = useMemo(
    () => new Map((tree?.diagrams ?? []).filter((d) => d.kind === "dmn").map((d) => [d.id, d.name])),
    [tree],
  );
  const handlers = useRef<{ onOpen: (taskId: string) => void; create: (task: Element) => Promise<void> }>({
    onOpen,
    create: async () => {},
  });

  useEffect(() => {
    handlers.current.onOpen = onOpen;
    handlers.current.create = async (task: Element) => {
      if (readOnly) return;
      if (linkedDecisionId(task)) {
        onOpen(task.id);
        return;
      }
      try {
        const name = task.businessObject?.name?.trim() || "Decision";
        const table = await create.mutateAsync({ kind: "dmn", name, ownerId: diagram.id, folderId: diagram.folderId });
        const current = service(editor, "elementRegistry").get(task.id);
        if (!current) return;
        service(editor, "modeling").updateProperties(current, { "coframe:diagram": table.id });
        onOpen(task.id);
      } catch (error) {
        toast.error(errorMessage(error));
      }
    };
  });

  useEffect(() => {
    const eventBus = service(editor, "eventBus");
    const open = ({ element }: { element: Element }) => handlers.current.onOpen(element.id);
    const make = ({ element }: { element: Element }) => void handlers.current.create(element);
    eventBus.on(DECISION_OPEN_EVENT, open);
    eventBus.on(DECISION_CREATE_EVENT, make);
    return () => {
      eventBus.off(DECISION_OPEN_EVENT, open);
      eventBus.off(DECISION_CREATE_EVENT, make);
    };
  }, [editor]);

  const known = useRef(new Map<string, string>());
  const pending = useRef(new Map<string, string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renameRef = useRef(rename.mutate);
  useEffect(() => {
    renameRef.current = rename.mutate;
  });

  useEffect(() => {
    if (readOnly) return;
    const eventBus = service(editor, "eventBus");
    const registry = service(editor, "elementRegistry");
    const snapshot = () => {
      const next = new Map<string, string>();
      registry.filter(isRuleTask).forEach((task: Element) => {
        const linked = linkedDecisionId(task);
        if (linked) next.set(task.id, `${linked}|${task.businessObject?.name ?? ""}`);
      });
      return next;
    };
    known.current = snapshot();
    const onCommand = () => {
      const next = snapshot();
      for (const [taskId, value] of next) {
        const before = known.current.get(taskId);
        const [tableId, name] = value.split("|");
        if (before && before !== value && before.startsWith(`${tableId}|`) && name.trim()) pending.current.set(tableId, name.trim());
      }
      known.current = next;
      if (!pending.current.size) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        for (const [id, name] of pending.current) renameRef.current({ id, name });
        pending.current.clear();
      }, RENAME_DELAY_MS);
    };
    eventBus.on("commandStack.changed", onCommand);
    return () => {
      eventBus.off("commandStack.changed", onCommand);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [editor, readOnly]);

  useEffect(() => {
    if (!openTask) return;
    const canvas = service(editor, "canvas");
    const element = service(editor, "elementRegistry").get(openTask);
    if (!element) return;
    service(editor, "contextPad").close?.();
    const frame = requestAnimationFrame(() => {
      const container = canvas.getContainer() as HTMLElement;
      const panel = container.parentElement?.querySelector("[data-decision-panel]") as HTMLElement | null;
      const free = panel ? panel.getBoundingClientRect().left - container.getBoundingClientRect().left : container.clientWidth / 2;
      const vb = canvas.viewbox();
      const gateway = (element.outgoing ?? []).map((c: Element) => c.target).find((t: Element) => /Gateway$/.test(t?.type ?? ""));
      const right = gateway ? gateway.x + gateway.width : element.x + element.width;
      const centerX = (element.x + right) / 2;
      const target = 340 / vb.scale + Math.max(0, free - 340) / vb.scale / 2;
      canvas.viewbox({ ...vb, x: centerX - target, y: element.y + element.height / 2 - vb.height / 2 });
    });
    return () => cancelAnimationFrame(frame);
  }, [editor, openTask]);

  const task = openTask ? service(editor, "elementRegistry").get(openTask) : null;
  const tableId = task ? linkedDecisionId(task) : null;
  const table = tree?.diagrams.find((d) => d.id === tableId && d.kind === "dmn") ?? null;

  return (
    <>
      <DecisionBadges editor={editor} readOnly={readOnly} version={version} names={names} />
      {openTask && (
        <DecisionPanel
          key={`${openTask}:${tableId}`}
          editor={editor}
          taskId={openTask}
          table={table}
          projectId={project.id}
          readOnly={readOnly}
          version={version}
          onClose={onClose}
          className={panelClassName}
        />
      )}
    </>
  );
}
