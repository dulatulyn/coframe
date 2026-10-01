import type { GlyphKind } from "./glyphs";

export type CatalogItem = {
  id: string;
  label: string;
  glyph: GlyphKind;
  type: string;
  eventDefinition?: string;
  options?: Record<string, unknown>;
};

export type CatalogGroup = {
  id: string;
  label: string;
  glyph: GlyphKind;
  shortcut?: string;
  items: CatalogItem[];
};

export const CATALOG: CatalogGroup[] = [
  {
    id: "start",
    label: "Start event",
    glyph: "start",
    items: [
      { id: "start", label: "Start event", glyph: "start", type: "bpmn:StartEvent" },
      { id: "start-message", label: "Message start event", glyph: "start-message", type: "bpmn:StartEvent", eventDefinition: "bpmn:MessageEventDefinition" },
      { id: "start-timer", label: "Timer start event", glyph: "start-timer", type: "bpmn:StartEvent", eventDefinition: "bpmn:TimerEventDefinition" },
      { id: "start-conditional", label: "Conditional start event", glyph: "start-conditional", type: "bpmn:StartEvent", eventDefinition: "bpmn:ConditionalEventDefinition" },
      { id: "start-signal", label: "Signal start event", glyph: "start-signal", type: "bpmn:StartEvent", eventDefinition: "bpmn:SignalEventDefinition" },
    ],
  },
  {
    id: "intermediate",
    label: "Intermediate event",
    glyph: "intermediate",
    items: [
      { id: "intermediate", label: "Intermediate throw event", glyph: "intermediate", type: "bpmn:IntermediateThrowEvent" },
      { id: "message-catch", label: "Message intermediate catch event", glyph: "intermediate-message-catch", type: "bpmn:IntermediateCatchEvent", eventDefinition: "bpmn:MessageEventDefinition" },
      { id: "message-throw", label: "Message intermediate throw event", glyph: "intermediate-message-throw", type: "bpmn:IntermediateThrowEvent", eventDefinition: "bpmn:MessageEventDefinition" },
      { id: "timer-catch", label: "Timer intermediate catch event", glyph: "intermediate-timer", type: "bpmn:IntermediateCatchEvent", eventDefinition: "bpmn:TimerEventDefinition" },
      { id: "signal-throw", label: "Signal intermediate throw event", glyph: "intermediate-signal-throw", type: "bpmn:IntermediateThrowEvent", eventDefinition: "bpmn:SignalEventDefinition" },
      { id: "link-catch", label: "Link intermediate catch event", glyph: "intermediate-link-catch", type: "bpmn:IntermediateCatchEvent", eventDefinition: "bpmn:LinkEventDefinition" },
    ],
  },
  {
    id: "end",
    label: "End event",
    glyph: "end",
    items: [
      { id: "end", label: "End event", glyph: "end", type: "bpmn:EndEvent" },
      { id: "end-message", label: "Message end event", glyph: "end-message", type: "bpmn:EndEvent", eventDefinition: "bpmn:MessageEventDefinition" },
      { id: "end-error", label: "Error end event", glyph: "end-error", type: "bpmn:EndEvent", eventDefinition: "bpmn:ErrorEventDefinition" },
      { id: "end-escalation", label: "Escalation end event", glyph: "end-escalation", type: "bpmn:EndEvent", eventDefinition: "bpmn:EscalationEventDefinition" },
      { id: "end-terminate", label: "Terminate end event", glyph: "end-terminate", type: "bpmn:EndEvent", eventDefinition: "bpmn:TerminateEventDefinition" },
    ],
  },
  {
    id: "gateway",
    label: "Gateway",
    glyph: "gateway-exclusive",
    items: [
      { id: "exclusive", label: "Exclusive gateway", glyph: "gateway-exclusive", type: "bpmn:ExclusiveGateway" },
      { id: "parallel", label: "Parallel gateway", glyph: "gateway-parallel", type: "bpmn:ParallelGateway" },
      { id: "inclusive", label: "Inclusive gateway", glyph: "gateway-inclusive", type: "bpmn:InclusiveGateway" },
      { id: "event-based", label: "Event-based gateway", glyph: "gateway-event", type: "bpmn:EventBasedGateway" },
      { id: "complex", label: "Complex gateway", glyph: "gateway-complex", type: "bpmn:ComplexGateway" },
    ],
  },
  {
    id: "task",
    label: "Task",
    glyph: "task",
    items: [
      { id: "task", label: "Task", glyph: "task", type: "bpmn:Task" },
      { id: "user", label: "User task", glyph: "task-user", type: "bpmn:UserTask" },
      { id: "service", label: "Service task", glyph: "task-service", type: "bpmn:ServiceTask" },
      { id: "send", label: "Send task", glyph: "task-send", type: "bpmn:SendTask" },
      { id: "receive", label: "Receive task", glyph: "task-receive", type: "bpmn:ReceiveTask" },
      { id: "manual", label: "Manual task", glyph: "task-manual", type: "bpmn:ManualTask" },
      { id: "business-rule", label: "Business rule task", glyph: "task-business-rule", type: "bpmn:BusinessRuleTask" },
      { id: "script", label: "Script task", glyph: "task-script", type: "bpmn:ScriptTask" },
      { id: "call", label: "Call activity", glyph: "call-activity", type: "bpmn:CallActivity" },
    ],
  },
  {
    id: "subprocess",
    label: "Sub-process",
    glyph: "subprocess-collapsed",
    items: [
      { id: "sub-expanded", label: "Sub-process (expanded)", glyph: "subprocess-expanded", type: "bpmn:SubProcess", options: { isExpanded: true } },
      { id: "sub-collapsed", label: "Sub-process (collapsed)", glyph: "subprocess-collapsed", type: "bpmn:SubProcess", options: { isExpanded: false } },
      { id: "event-sub", label: "Event sub-process", glyph: "event-subprocess", type: "bpmn:SubProcess", options: { isExpanded: true, triggeredByEvent: true } },
      { id: "transaction", label: "Transaction", glyph: "transaction", type: "bpmn:Transaction", options: { isExpanded: true } },
    ],
  },
  {
    id: "data",
    label: "Data",
    glyph: "data-object",
    items: [
      { id: "data-object", label: "Data object reference", glyph: "data-object", type: "bpmn:DataObjectReference" },
      { id: "data-store", label: "Data store reference", glyph: "data-store", type: "bpmn:DataStoreReference" },
    ],
  },
  {
    id: "participant",
    label: "Pool/participant",
    glyph: "pool",
    items: [
      { id: "pool", label: "Expanded pool/participant", glyph: "pool", type: "bpmn:Participant", options: { isExpanded: true } },
      { id: "pool-empty", label: "Empty pool/participant", glyph: "pool", type: "bpmn:Participant", options: { isExpanded: false } },
    ],
  },
  {
    id: "artifact",
    label: "Artifacts",
    glyph: "text-annotation",
    items: [
      { id: "text-annotation", label: "Text annotation", glyph: "text-annotation", type: "bpmn:TextAnnotation" },
      { id: "group", label: "Group", glyph: "group", type: "bpmn:Group" },
    ],
  },
];
