"use client";

import { ArrowLeftRight, Copy, ExternalLink, Plus, Table2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Glyph } from "@/components/bpmn/glyphs";
import { useTree } from "@/lib/api/hooks";
import { cn } from "@/lib/utils";

import { DECISION_CREATE_EVENT, DECISION_OPEN_EVENT } from "../dmn/link";
import { service, type BpmnEditor } from "../modeler";
import { isCollapsedSubProcess, isExpandedSubProcess, toggleSubProcess } from "../subprocess";
import { COLORS, describe, isActivity } from "./element-info";

type Shape = any;

type Marker = "none" | "loop" | "parallel" | "sequential";

function markerOf(element: Shape): Marker {
  const lc = element.businessObject?.loopCharacteristics;
  if (!lc) return "none";
  if (lc.$type === "bpmn:StandardLoopCharacteristics") return "loop";
  return lc.isSequential ? "sequential" : "parallel";
}

function documentationOf(element: Shape): string {
  return element.businessObject?.documentation?.[0]?.text ?? "";
}

function nameOf(element: Shape): string {
  const bo = element.businessObject;
  if (!bo) return "";
  if (bo.$type === "bpmn:TextAnnotation") return bo.text ?? "";
  if (bo.$type === "bpmn:Group") return bo.categoryValueRef?.value ?? "";
  return bo.name ?? "";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] text-slate">{label}</span>
      {children}
    </div>
  );
}

function LinkField({
  editor,
  element,
  readOnly,
  projectId,
  diagramId,
  label,
  empty,
  kind,
}: {
  editor: BpmnEditor;
  element: Shape;
  readOnly: boolean;
  projectId: string;
  diagramId: string;
  label: string;
  empty: string;
  kind: "bpmn" | "dmn";
}) {
  const { data: tree } = useTree(projectId);
  const router = useRouter();
  const linked: string = element.businessObject?.get?.("coframe:diagram") ?? "";
  const options = (tree?.diagrams ?? []).filter((d) => d.id !== diagramId && (d.kind ?? "bpmn") === kind);
  const target = options.find((d) => d.id === linked);
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <select
          data-inspector-field
          value={linked}
          disabled={readOnly}
          onChange={(e) => service(editor, "modeling").updateProperties(element, { "coframe:diagram": e.target.value || undefined })}
          className="h-10 min-w-0 flex-1 rounded-xl bg-fog px-3 text-[14px] outline-none focus:ring-2 focus:ring-cobalt"
        >
          <option value="">{empty}</option>
          {options.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
          {linked && !target && <option value={linked}>Missing diagram</option>}
        </select>
        {target && kind === "bpmn" && (
          <button
            type="button"
            onClick={() => router.push(`/p/${projectId}/${target.id}`)}
            title={`Open ${target.name}`}
            className="grid size-10 shrink-0 place-items-center rounded-xl border border-hairline hover:bg-fog"
          >
            <ExternalLink className="size-4" />
          </button>
        )}
      </div>
      {kind === "dmn" && (
        <div className="mt-2 flex gap-2">
          {target ? (
            <button
              type="button"
              onClick={() => service(editor, "eventBus").fire(DECISION_OPEN_EVENT, { element })}
              className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-ink text-[13px] font-medium text-paper hover:bg-ink/85"
            >
              <Table2 className="size-4" /> Open table
            </button>
          ) : (
            !readOnly && (
              <button
                type="button"
                onClick={() => service(editor, "eventBus").fire(DECISION_CREATE_EVENT, { element })}
                className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-soft text-[13px] font-medium hover:border-ink"
              >
                <Plus className="size-4" /> Create decision table
              </button>
            )
          )}
        </div>
      )}
    </Field>
  );
}

export function EditorInspector({
  editor,
  element,
  readOnly,
  onClose,
  className,
  projectId,
  diagramId,
}: {
  editor: BpmnEditor;
  element: Shape;
  readOnly: boolean;
  onClose: () => void;
  className?: string;
  projectId: string;
  diagramId: string;
}) {
  const [name, setName] = useState(nameOf(element));
  const [doc, setDoc] = useState(documentationOf(element));
  const [, setVersion] = useState(0);
  const info = describe(element);

  useEffect(() => {
    const eventBus = service(editor, "eventBus");
    const onChanged = ({ elements }: { elements: Shape[] }) => {
      if (elements.some((e) => e.id === element.id)) {
        setVersion((v) => v + 1);
        if (!document.activeElement?.closest?.("[data-inspector-field]")) {
          setName(nameOf(element));
          setDoc(documentationOf(element));
        }
      }
    };
    eventBus.on("elements.changed", onChanged);
    return () => eventBus.off("elements.changed", onChanged);
  }, [editor, element]);

  const modeling = readOnly ? null : service(editor, "modeling");

  const commitName = () => {
    if (!modeling || name === nameOf(element)) return;
    modeling.updateLabel(element, name);
  };

  const commitDoc = () => {
    if (!modeling || doc === documentationOf(element)) return;
    const moddle = service(editor, "moddle");
    const documentation = doc.trim() ? [moddle.create("bpmn:Documentation", { text: doc })] : [];
    modeling.updateModdleProperties(element, element.businessObject, { documentation });
  };

  const setMarker = (marker: Marker) => {
    if (!modeling) return;
    const moddle = service(editor, "moddle");
    const loopCharacteristics =
      marker === "none"
        ? undefined
        : marker === "loop"
          ? moddle.create("bpmn:StandardLoopCharacteristics")
          : moddle.create("bpmn:MultiInstanceLoopCharacteristics", { isSequential: marker === "sequential" });
    modeling.updateProperties(element, { loopCharacteristics });
  };

  const openReplace = (event: React.MouseEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    service(editor, "popupMenu").open(element, "bpmn-replace", { x: rect.left, y: rect.bottom + 6 }, {
      title: "Change element",
      width: 300,
      search: true,
    });
  };

  const colorOf = element.di?.get?.("color:background-color") ?? element.di?.get?.("bioc:fill") ?? null;
  const activity = isActivity(element);
  const connection = !!element.waypoints;

  return (
    <section className={cn("flex flex-col", className)} data-inspector>
      <header className="flex items-start gap-3 p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-hairline bg-paper">
          <Glyph kind={info.glyph} size={24} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] text-slate">{info.label}</div>
          <div className="truncate text-[15px] font-semibold tracking-tight">{nameOf(element) || "Untitled"}</div>
        </div>
        <button
          type="button"
          aria-label="Close properties"
          onClick={onClose}
          className="grid size-8 place-items-center rounded-full text-slate hover:bg-fog hover:text-ink"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="flex flex-col gap-4 px-4 pb-4">
        <Field label={element.businessObject?.$type === "bpmn:TextAnnotation" ? "Text" : "Name"}>
          <textarea
            data-inspector-field
            value={name}
            readOnly={readOnly}
            rows={name.length > 32 ? 2 : 1}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                commitName();
                (e.target as HTMLTextAreaElement).blur();
              }
              if (e.key === "Escape") {
                setName(nameOf(element));
                (e.target as HTMLTextAreaElement).blur();
              }
            }}
            placeholder="Add a name"
            className="min-h-10 resize-none rounded-xl bg-fog px-3 py-2.5 text-[14px] leading-5 outline-none focus:bg-paper focus:ring-2 focus:ring-cobalt"
          />
        </Field>

        {!readOnly && !connection && (
          <Field label="Type">
            <button
              type="button"
              onClick={openReplace}
              className="flex h-10 items-center gap-2.5 rounded-xl border border-hairline px-3 text-left text-[14px] hover:bg-fog"
            >
              <Glyph kind={info.glyph} size={18} />
              <span className="flex-1 truncate">{info.label}</span>
              <ArrowLeftRight className="size-4 text-slate" />
            </button>
          </Field>
        )}

        {activity && (
          <Field label="Markers">
            <div className="grid grid-cols-4 rounded-xl bg-fog p-1 text-[12px] font-medium">
              {(
                [
                  ["none", "None"],
                  ["loop", "Loop"],
                  ["parallel", "Parallel"],
                  ["sequential", "Sequential"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  disabled={readOnly}
                  title={id === "parallel" ? "Parallel multi-instance" : id === "sequential" ? "Sequential multi-instance" : undefined}
                  onClick={() => setMarker(id)}
                  className={cn(
                    "rounded-lg py-1.5 text-center transition-colors",
                    markerOf(element) === id ? "bg-paper shadow-sm" : "text-slate hover:text-ink",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>
        )}

        {(isCollapsedSubProcess(element) || isExpandedSubProcess(element)) && (
          <Field label="Content">
            <div className="grid grid-cols-2 rounded-xl bg-fog p-1 text-[12px] font-medium">
              {(
                [
                  [true, "On the diagram"],
                  [false, "Separate page"],
                ] as const
              ).map(([expanded, label]) => (
                <button
                  key={label}
                  type="button"
                  disabled={readOnly}
                  onClick={() => expanded !== isExpandedSubProcess(element) && toggleSubProcess(editor, element)}
                  className={cn(
                    "rounded-lg py-1.5 text-center transition-colors",
                    isExpandedSubProcess(element) === expanded ? "bg-paper shadow-sm" : "text-slate hover:text-ink",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>
        )}

        {element.type === "bpmn:CallActivity" && (
          <LinkField
            editor={editor}
            element={element}
            readOnly={readOnly}
            projectId={projectId}
            diagramId={diagramId}
            label="Calls diagram"
            empty="Not linked"
            kind="bpmn"
          />
        )}

        {element.type === "bpmn:BusinessRuleTask" && (
          <LinkField
            editor={editor}
            element={element}
            readOnly={readOnly}
            projectId={projectId}
            diagramId={diagramId}
            label="Decision table"
            empty="Not linked"
            kind="dmn"
          />
        )}

        <Field label="Documentation">
          <textarea
            data-inspector-field
            value={doc}
            readOnly={readOnly}
            rows={3}
            onChange={(e) => setDoc(e.target.value)}
            onBlur={commitDoc}
            placeholder="What happens here, who does it, which rules apply"
            className="resize-none rounded-xl bg-fog px-3 py-2 text-[14px] leading-5 outline-none focus:bg-paper focus:ring-2 focus:ring-cobalt"
          />
        </Field>

        {!readOnly && !connection && (
          <Field label="Color">
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  aria-label={c.label}
                  title={c.label}
                  onClick={() => modeling?.setColor([element], { fill: c.fill, stroke: c.stroke })}
                  className={cn(
                    "size-7 rounded-full border border-hairline transition-transform hover:scale-110",
                    (colorOf ?? undefined)?.toLowerCase?.() === c.fill?.toLowerCase() || (!colorOf && !c.fill)
                      ? "ring-2 ring-ink ring-offset-2"
                      : "",
                  )}
                  style={{ background: c.fill ?? "#ffffff" }}
                />
              ))}
            </div>
          </Field>
        )}
      </div>

      <footer className="mt-auto flex items-center justify-between border-t border-hairline px-4 py-3">
        <span className="truncate font-mono text-[12px] text-slate">{element.id}</span>
        <button
          type="button"
          aria-label="Copy ID"
          onClick={async () => {
            await navigator.clipboard.writeText(element.id);
            toast("ID copied");
          }}
          className="grid size-7 place-items-center rounded-full text-slate hover:bg-fog"
        >
          <Copy className="size-3.5" />
        </button>
      </footer>
    </section>
  );
}
