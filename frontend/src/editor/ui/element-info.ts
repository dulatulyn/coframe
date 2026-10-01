import { CATALOG } from "@/components/bpmn/catalog";
import type { GlyphKind } from "@/components/bpmn/glyphs";

type Bo = any;

const DEFINITION_NAMES: Record<string, string> = {
  "bpmn:MessageEventDefinition": "Message",
  "bpmn:TimerEventDefinition": "Timer",
  "bpmn:ErrorEventDefinition": "Error",
  "bpmn:EscalationEventDefinition": "Escalation",
  "bpmn:CancelEventDefinition": "Cancel",
  "bpmn:CompensateEventDefinition": "Compensation",
  "bpmn:ConditionalEventDefinition": "Conditional",
  "bpmn:LinkEventDefinition": "Link",
  "bpmn:SignalEventDefinition": "Signal",
  "bpmn:TerminateEventDefinition": "Terminate",
};

function sentence(type: string): string {
  const local = type.replace(/^bpmn:/, "");
  const words = local.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function catalogMatch(type: string, definition?: string) {
  for (const group of CATALOG) {
    for (const item of group.items) {
      if (item.type === type && item.eventDefinition === definition && !item.options) return item;
    }
  }
  return null;
}

export function describe(element: any): { label: string; glyph: GlyphKind } {
  const target = element?.type === "label" ? element.labelTarget : element;
  const bo: Bo = target?.businessObject;
  if (!bo) return { label: "Element", glyph: "task" };
  const type: string = bo.$type;
  const definitions: Bo[] = bo.eventDefinitions ?? [];
  const definition: string | undefined = definitions.length === 1 ? definitions[0].$type : undefined;
  const defName = definition ? DEFINITION_NAMES[definition] : undefined;

  if (definitions.length > 1) {
    return { label: bo.parallelMultiple ? "Parallel multiple event" : "Multiple event", glyph: "intermediate" };
  }
  if (type === "bpmn:BoundaryEvent") {
    const suffix = bo.cancelActivity === false ? " (non-interrupting)" : "";
    return { label: defName ? `${defName} boundary event${suffix}` : "Boundary event", glyph: "intermediate-timer" };
  }
  if (type === "bpmn:StartEvent" && bo.isInterrupting === false) {
    return { label: `${defName ?? ""} start event (non-interrupting)`.trim(), glyph: "start" };
  }
  const match = catalogMatch(type, definition);
  if (match) return { label: match.label, glyph: match.glyph };
  if (defName) {
    const kind = type === "bpmn:IntermediateCatchEvent" ? "intermediate catch event" : type === "bpmn:IntermediateThrowEvent" ? "intermediate throw event" : type === "bpmn:StartEvent" ? "start event" : "end event";
    return { label: `${defName} ${kind}`, glyph: type === "bpmn:EndEvent" ? "end" : type === "bpmn:StartEvent" ? "start" : "intermediate" };
  }
  switch (type) {
    case "bpmn:SubProcess":
      if (bo.triggeredByEvent) return { label: "Event sub-process", glyph: "event-subprocess" };
      return target.collapsed || target.di?.isExpanded === false
        ? { label: "Sub-process (collapsed)", glyph: "subprocess-collapsed" }
        : { label: "Sub-process (expanded)", glyph: "subprocess-expanded" };
    case "bpmn:AdHocSubProcess":
      return { label: "Ad-hoc sub-process", glyph: "subprocess-collapsed" };
    case "bpmn:Transaction":
      return { label: "Transaction", glyph: "transaction" };
    case "bpmn:Participant":
      return bo.processRef ? { label: "Expanded pool/participant", glyph: "pool" } : { label: "Empty pool/participant", glyph: "pool" };
    case "bpmn:Lane":
      return { label: "Lane", glyph: "lane" };
    case "bpmn:SequenceFlow":
      if (bo.conditionExpression) return { label: "Conditional flow", glyph: "sequence-flow" };
      if (bo.sourceRef?.default === bo) return { label: "Default flow", glyph: "sequence-flow" };
      return { label: "Sequence flow", glyph: "sequence-flow" };
    case "bpmn:MessageFlow":
      return { label: "Message flow", glyph: "message-flow" };
    case "bpmn:Association":
      return { label: "Association", glyph: "association" };
    case "bpmn:DataInputAssociation":
      return { label: "Data input association", glyph: "association" };
    case "bpmn:DataOutputAssociation":
      return { label: "Data output association", glyph: "association" };
    case "bpmn:Process":
      return { label: "Process", glyph: "pool" };
    case "bpmn:Collaboration":
      return { label: "Collaboration", glyph: "pool" };
  }
  return { label: sentence(type), glyph: "task" };
}

export function isActivity(element: { businessObject?: Bo } | null | undefined): boolean {
  const bo = element?.businessObject;
  if (!bo?.$instanceOf) return false;
  return bo.$instanceOf("bpmn:Activity") && !(bo.$type === "bpmn:SubProcess" && bo.triggeredByEvent);
}

export const COLORS: { label: string; fill?: string; stroke?: string }[] = [
  { label: "Default" },
  { label: "Blue", fill: "#BBDEFB", stroke: "#0D4372" },
  { label: "Orange", fill: "#FFE0B2", stroke: "#6B3C00" },
  { label: "Green", fill: "#C8E6C9", stroke: "#205022" },
  { label: "Red", fill: "#FFCDD2", stroke: "#831311" },
  { label: "Purple", fill: "#E1BEE7", stroke: "#5B176D" },
];
