"use client";

import { useEffect } from "react";

import { service, type BpmnEditor } from "../modeler";
import { DECISION_CREATE_EVENT, DECISION_OPEN_EVENT, isRuleTask, linkedDecisionId } from "./link";

type Element = any;

const OVERLAY = "coframe-decision";
const TABLE_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/></svg>';
const PLUS_ICON =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

export function DecisionBadges({
  editor,
  readOnly,
  version,
  names,
}: {
  editor: BpmnEditor;
  readOnly: boolean;
  version: number;
  names: Map<string, string>;
}) {
  useEffect(() => {
    const overlays = service(editor, "overlays");
    const registry = service(editor, "elementRegistry");
    const eventBus = service(editor, "eventBus");
    overlays.remove({ type: OVERLAY });
    registry.filter(isRuleTask).forEach((task: Element) => {
      const linked = linkedDecisionId(task);
      if (!linked && readOnly) return;
      const html = document.createElement("button");
      html.type = "button";
      html.className = linked ? "coframe-decision-badge" : "coframe-decision-badge is-missing";
      html.innerHTML = linked ? `${TABLE_ICON}<span>${escape(names.get(linked) ?? "Table")}</span>` : `${PLUS_ICON}<span>Decision</span>`;
      html.title = linked ? "Open the decision table" : "Create a decision table for this task";
      html.addEventListener("click", (e) => {
        e.stopPropagation();
        eventBus.fire(linked ? DECISION_OPEN_EVENT : DECISION_CREATE_EVENT, { element: task });
      });
      overlays.add(task.id, OVERLAY, { position: { bottom: 2, left: 4 }, html, show: { minZoom: 0.5 } });
    });
    return () => overlays.remove({ type: OVERLAY });
  }, [editor, readOnly, version, names]);
  return null;
}

function escape(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
