"use client";

import { Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { service, type BpmnEditor } from "../modeler";
import { highlight, useDiagramVersion } from "./paths-panel";
import { ViewPanel } from "./view-panel";

type Element = any;
type Letter = "R" | "A" | "C" | "I";
type Role = { id: string; name: string };
type Row = { element: Element; name: string; home: string | null; cells: Record<string, Letter> };

const CYCLE: (Letter | null)[] = [null, "R", "A", "C", "I"];
const ACTIVITY = /Task$|^bpmn:SubProcess$|^bpmn:CallActivity$/;
const TONE: Record<Letter, string> = {
  R: "bg-cobalt text-paper",
  A: "bg-ink text-paper",
  C: "bg-[#f5a524]/25 text-[#8a5a00]",
  I: "bg-fog-strong text-slate",
};
const MEANING: Record<Letter, string> = { R: "Responsible", A: "Accountable", C: "Consulted", I: "Informed" };

export function parseRaci(value: string | undefined): Record<string, Letter> {
  const out: Record<string, Letter> = {};
  for (const part of (value ?? "").split(";")) {
    const [role, letter] = part.split("=");
    if (role && ["R", "A", "C", "I"].includes(letter)) out[role] = letter as Letter;
  }
  return out;
}

function leafLanes(registry: Element): Element[] {
  return registry.filter((e: Element) => e.type === "bpmn:Lane" && !(e.businessObject?.childLaneSet?.lanes?.length));
}

function readMatrix(editor: BpmnEditor): { roles: Role[]; rows: Row[] } {
  const registry = service(editor, "elementRegistry");
  const lanes = leafLanes(registry);
  const pools = registry.filter((e: Element) => e.type === "bpmn:Participant" && e.businessObject?.processRef);
  const roles: Role[] = (lanes.length ? lanes : pools).map((e: Element) => ({ id: e.id, name: e.businessObject?.name || "Unnamed" }));
  const laneOf = new Map<string, string>();
  for (const lane of lanes) for (const ref of lane.businessObject?.flowNodeRef ?? []) laneOf.set(ref.id, lane.id);
  const poolOf = (element: Element): string | null => {
    let parent = element.parent;
    while (parent) {
      if (parent.type === "bpmn:Participant") return parent.id;
      parent = parent.parent;
    }
    return null;
  };
  const rows: Row[] = registry
    .filter((e: Element) => ACTIVITY.test(e.type) && e.type !== "label")
    .sort((a: Element, b: Element) => a.y - b.y || a.x - b.x)
    .map((element: Element) => {
      const home = lanes.length ? laneOf.get(element.id) ?? null : poolOf(element);
      const stored = parseRaci(element.businessObject?.get?.("coframe:raci"));
      const cells: Record<string, Letter> = Object.keys(stored).length ? stored : home ? { [home]: "R" } : {};
      return { element, name: element.businessObject?.name || "Unnamed step", home, cells };
    });
  return { roles, rows };
}

export function RolesPanel({ editor, readOnly }: { editor: BpmnEditor; readOnly: boolean }) {
  const version = useDiagramVersion(editor);
  const [focus, setFocus] = useState<string | null>(null);
  const { roles, rows } = useMemo(() => {
    void version;
    return readMatrix(editor);
  }, [editor, version]);

  useEffect(() => {
    if (!focus) return highlight(editor, null);
    const ids = rows.filter((r) => r.cells[focus]).map((r) => r.element.id);
    highlight(editor, ids);
  }, [editor, focus, rows]);

  useEffect(() => () => highlight(editor, null), [editor]);

  const cycle = (row: Row, role: string) => {
    if (readOnly) return;
    const next = CYCLE[(CYCLE.indexOf(row.cells[role] ?? null) + 1) % CYCLE.length];
    const cells = { ...row.cells };
    if (next) cells[role] = next;
    else delete cells[role];
    const value = Object.entries(cells)
      .map(([id, letter]) => `${id}=${letter}`)
      .join(";");
    service(editor, "modeling").updateProperties(row.element, { "coframe:raci": value || undefined });
  };

  const exportCsv = () => {
    const quote = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const lines = [["Step", ...roles.map((r) => r.name)].map(quote).join(",")];
    for (const row of rows) lines.push([row.name, ...roles.map((r) => row.cells[r.id] ?? "")].map(quote).join(","));
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: "responsibilities.csv" });
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ViewPanel
      title="Who does what"
      subtitle={
        readOnly
          ? "R is the lane that does the step. Hover a role to see its steps."
          : "R comes from the lane. Click a cell to switch R → A → C → I. Hover a role to see its steps."
      }
      className="md:w-[min(560px,calc(100%-32px))]"
    >
      {roles.length === 0 ? (
        <p className="px-2 py-3 text-[13px] leading-5 text-slate">
          Add lanes (or pools) for the roles in this process to see who does what.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto px-2">
            <table className="w-full border-separate border-spacing-0 text-[13px]">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-paper py-1.5 pr-2 text-left font-medium text-slate">Step</th>
                  {roles.map((role) => (
                    <th
                      key={role.id}
                      onMouseEnter={() => setFocus(role.id)}
                      onMouseLeave={() => setFocus(null)}
                      className={cn(
                        "min-w-16 px-1 py-1.5 text-center font-medium",
                        focus === role.id ? "text-ink" : "text-slate",
                      )}
                    >
                      <span className="line-clamp-2">{role.name}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.element.id} className="group">
                    <td
                      className="sticky left-0 max-w-44 truncate border-t border-hairline bg-paper py-1.5 pr-2"
                      onMouseEnter={() => highlight(editor, [row.element.id])}
                      onMouseLeave={() => highlight(editor, null)}
                    >
                      {row.name}
                    </td>
                    {roles.map((role) => {
                      const letter = row.cells[role.id];
                      return (
                        <td key={role.id} className="border-t border-hairline px-1 py-1 text-center">
                          <button
                            type="button"
                            disabled={readOnly}
                            onClick={() => cycle(row, role.id)}
                            title={letter ? MEANING[letter] : readOnly ? undefined : "Set responsibility"}
                            className={cn(
                              "mx-auto grid size-7 place-items-center rounded-lg text-[12px] font-semibold transition-colors",
                              letter ? TONE[letter] : "text-slate-soft hover:bg-fog",
                            )}
                          >
                            {letter ?? "·"}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 px-2 text-[12px] text-slate">
            {(Object.keys(MEANING) as Letter[]).map((l) => (
              <span key={l} className="flex items-center gap-1.5">
                <span className={cn("grid size-5 place-items-center rounded-md text-[11px] font-semibold", TONE[l])}>{l}</span>
                {MEANING[l]}
              </span>
            ))}
            <Button variant="ghost" size="sm" className="ml-auto h-8" onClick={exportCsv}>
              <Download /> CSV
            </Button>
          </div>
        </>
      )}
    </ViewPanel>
  );
}
