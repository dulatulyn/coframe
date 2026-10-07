"use client";

import { FlaskConical, Table2, X } from "lucide-react";
import { useMemo, useState } from "react";

import { parseDmn, pickDecision } from "@/lib/dmn";
import { cn } from "@/lib/utils";

import { service, type BpmnEditor } from "../modeler";
import { TryIt } from "./decision-panel";
import { DecisionTableView } from "./decision-table-view";

export function DecisionPreview({
  editor,
  taskId,
  name,
  xml,
  onClose,
  className,
}: {
  editor: BpmnEditor;
  taskId: string;
  name: string;
  xml: string | null;
  onClose: () => void;
  className?: string;
}) {
  const [tab, setTab] = useState<"table" | "try">("table");
  const task = service(editor, "elementRegistry").get(taskId);
  const taskName: string = task?.businessObject?.name ?? "";
  const decisions = useMemo(() => (xml ? parseDmn(xml) : []), [xml]);
  const main = pickDecision(decisions, taskName);
  return (
    <aside data-decision-panel className={cn("flex flex-col overflow-hidden", className)}>
      <header className="flex items-start gap-3 border-b border-hairline px-4 py-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-fog">
          <Table2 className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{name}</p>
          <p className="truncate text-[12px] text-slate">Decision table of “{taskName || "business rule task"}”</p>
        </div>
        <button type="button" aria-label="Close decision table" onClick={onClose} className="grid size-8 place-items-center rounded-full hover:bg-fog">
          <X className="size-4" />
        </button>
      </header>
      {main?.kind === "table" && task && (
        <div className="mx-4 mt-3 grid w-fit grid-cols-2 rounded-full bg-fog p-1 text-[13px] font-medium">
          {(
            [
              ["table", "Table", Table2],
              ["try", "Try it", FlaskConical],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5", tab === id ? "bg-paper shadow-sm" : "text-slate hover:text-ink")}
            >
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </div>
      )}
      {tab === "try" && main && task ? (
        <TryIt decision={main} task={task} />
      ) : (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {!xml && <p className="text-[13px] text-slate">This decision table isn&apos;t available.</p>}
          {decisions.map((decision) => (
            <div key={decision.id}>
              {decisions.length > 1 && <p className="mb-1.5 text-[13px] font-semibold">{decision.name || decision.id}</p>}
              <DecisionTableView decision={decision} />
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
