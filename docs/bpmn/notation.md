# BPMN 2.0.2 notation reference (for Coframe, built on bpmn-js)

The reference for BPMN notation in Coframe. UI labels, tooltips, validation and documentation are checked against it.

**Conventions**

- Every element uses its **official BPMN 2.0.2 name** and its **bpmn-moddle type** (e.g. `bpmn:IntermediateCatchEvent` + `bpmn:TimerEventDefinition`).
- Normative keywords (MUST / MUST NOT / MAY) are quoted from the specification unchanged.
- **"(unverified)"** marks a statement that could not be confirmed against a primary source. Everything else was checked against the sources in §13.
- **"(executed)"** marks bpmn-js behaviour that was not only read in the source but reproduced: `bpmn-modeler.development.js` 18.30.1, calling `replaceMenuProvider`, `contextPad`, `palette` and `bpmnRules` programmatically on a test diagram.

**Versions checked (as of 2026-09-30)**

| Artifact | Version | Note |
|---|---|---|
| OMG BPMN specification | 2.0.2, formal/13-12-09 | PDF, 532 pages. Tables 7.3, 7.4 and 10.93 were checked on rendered pages because they contain pictograms |
| bpmn-js | 18.30.1 (commit `6eaa691`, 2026-09-24) | modeler core |
| bpmn-js-create-append-anything | 2.1.0 | "Create element" / "Append element" menus; moved out of bpmn-js core in v12 |
| bpmn-moddle | 10.3.1 | metamodel: type and attribute names |
| diagram-js | 15.27.3 | popup menus, palette |
| bpmnlint | 11.14.0 | lint rules, `recommended` configuration |

---

## 1. What BPMN is

### 1.1. Purpose

**BPMN (Business Process Model and Notation)** is an OMG standard: a graphical notation and metamodel for business processes. Per §1.1 of the specification its goal is a notation that is understandable by all business users: analysts who sketch the first drafts, developers who implement the processes, and the business people who manage and monitor them. BPMN bridges process design and implementation and can visualize XML execution languages such as WS-BPEL.

BPMN 2.0 added a formal metamodel, formal execution semantics (Clause 13), interchange formats (XSD and XMI) and Diagram Interchange (BPMN DI) to the notation. That is why the name changed from "Business Process **Modeling** Notation" (1.x) to "Business Process **Model and** Notation" (2.x).

Out of scope for BPMN (§7.2): organizational structures and resources, functional breakdowns, data and information models, strategy, business rules models. BPMN shows the flow of data (Messages) and the association of data artifacts to Activities, but "is not a data flow language".

### 1.2. Versions and standardization

| Version | Name | OMG document | Date | Note |
|---|---|---|---|---|
| 1.0 | Business Process Modeling Notation | — | BPMI.org, May 2004; the OMG page says March 2007 | BPMI merged into OMG in June 2005; OMG released the specification document in February 2006 (per Trisotech) |
| 1.1 | Business Process Modeling Notation | formal/08-01-17 | January 2008 | |
| 1.2 | Business Process Modeling Notation | formal/09-01-03 | January 2009 | a public process was called "abstract" in 1.2 |
| 2.0 | Business Process Model and Notation | formal/11-01-03 | the OMG page says December 2010 (often cited as January 2011) | added Choreography and Conversation diagrams, non-interrupting events, Event Sub-Processes, the metamodel, XSD/XMI, DI (Annex A) |
| 2.0.1 | Business Process Model and Notation | formal/13-09-02 | September 2013 | per OMG: "formally published by ISO as the 2013 edition standard: ISO/IEC 19510" |
| **2.0.2** | Business Process Model and Notation | **formal/13-12-09** | document dated December 2013; the OMG page says January 2014 | "Version 2.0.2 contains a minor change to Clause 15" (Exchange Formats). **Current version; all references in this document point to it** |

**ISO/IEC 19510:2013** "Information technology — Object Management Group Business Process Model and Notation". According to OMG this edition corresponds to **BPMN 2.0.1**. Some secondary sources (Trisotech) name 2.0.2 (see §14). For the notation the difference is irrelevant: 2.0.2 only differs by "a minor change to Clause 15".

### 1.3. Diagram types (sub-models)

Per §7.2.1 BPMN has three basic sub-models: **Processes (Orchestration)**, **Choreographies** and **Collaborations** (a Collaboration can include Processes and/or Choreographies and "a view of Conversations"). In practice four diagram types are distinguished:

| Diagram type | Root element (bpmn-moddle) | Shows | Key elements | bpmn-js |
|---|---|---|---|---|
| **Process** (Orchestration) | `bpmn:Process` | the work flow of a single participant | Events, Activities, Gateways, Sequence Flows, Data, Lanes | yes |
| **Collaboration** | `bpmn:Collaboration` (`participants`, `messageFlows`) | message exchange between participants (Pools) | Pools, Message Flows, processes inside pools | yes |
| **Choreography** | `bpmn:Choreography` (subclass of `bpmn:Collaboration`) | the expected order of interactions between participants, without a central controller | Choreography Task, Sub-Choreography, Call Choreography, Participant Bands | **no** (§10) |
| **Conversation** | `bpmn:Collaboration` with `conversations` and `conversationLinks` | an overview of logically related message exchanges ("bird's eye view") | Conversation, Sub-Conversation, Call Conversation, Conversation Link, Pools | **no** (§10) |

Per the specification a Conversation diagram is "a particular usage of and an informal description of a Collaboration diagram".

### 1.4. Private and public processes; executable and non-executable

Per §7.2.1 and §10.2.1 there are three kinds of processes:

1. **Private non-executable (internal) Business Process**: an internal process modeled for documentation at the chosen level of detail; usually without formal execution conditions.
2. **Private executable (internal) Business Process**: an internal process modeled to be executed according to the specification's semantics.
3. **Public Process**: shows only the Activities used to communicate with other participants and the order of their Message Flows. Called "abstract" in BPMN 1.2.

`bpmn:Process` attributes:

| Attribute | Values | Meaning |
|---|---|---|
| `processType` | `None` (default), `Public`, `Private` | level of abstraction |
| `isExecutable` | boolean, optional | whether the process is executable. For public processes a missing value means `false`; `true` is not allowed for them ("MAY not be true") |
| `isClosed` | boolean, default `false` | when `true`, interactions (sending and receiving Messages and Events) not modeled in the process MAY NOT occur (§10.9) |

In bpmn-js, `modeler.createDiagram()` creates `<bpmn:process id="Process_1" isExecutable="false">` with a single Start Event (source: `lib/Modeler.js`).

When pools are used, a private process lives entirely inside one Pool: Sequence Flows do not cross the pool boundary; communication between processes is shown with Message Flows.

### 1.5. Conformance

Clause 2 defines four conformance types: **Process Modeling Conformance**, **Process Execution Conformance**, **BPEL Process Execution Conformance** and **Choreography Modeling Conformance**. Meeting all four is "BPMN Complete Conformance". Process Modeling has three subclasses:

| Subclass | Idea | Contents (summary of tables 2.1–2.4) |
|---|---|---|
| **Descriptive** | visible elements for high-level modeling ("comfortable for analysts who have used BPA flowcharting tools") | participant (pool), laneSet/lane, unconditional sequenceFlow, messageFlow, exclusiveGateway, parallelGateway, task (None), userTask, serviceTask, subProcess (expanded and collapsed), CallActivity, DataObject, TextAnnotation, association/dataAssociation, dataStoreReference, None start/end, message start/end, timer start, terminate end, documentation, Group |
| **Analytic** | Descriptive plus roughly half of the complete class | conditional and default flows, sendTask, receiveTask, loop and multi-instance, inclusive and event-based gateways, Link catch/throw, Signal start/end/catch/throw/boundary, Message catch/throw/boundary (interrupting and non-interrupting), Timer catch/boundary, Error boundary and end, Escalation (non-interrupting boundary, throw, end), Conditional start/catch/boundary, message (messageRef on messageFlow) |
| **Common Executable** | what executable models need | XML Schema (data types), WSDL (service interfaces), XPath (data access) are mandatory |

For Process Modeling Conformance: "Implementations are not expected to support Choreography modeling elements such as Choreography Task and Sub-Choreography" (§2.2.2).

### 1.6. Token

Process behaviour is explained with a **token**. A Start Event creates a token, an End Event consumes it. Tokens travel only along Sequence Flows, never along Message Flows ("it is a Message that is passed down a Message Flow"). Tools are not required to implement tokens (§7.2.1).

---

## 2. The five basic element categories

Per §7.3 elements fall into five categories.

| Category | Elements | bpmn-moddle types |
|---|---|---|
| **Flow Objects** | Events, Activities, Gateways | `bpmn:Event` and descendants, `bpmn:Activity` and descendants, `bpmn:Gateway` and descendants |
| **Data** | Data Objects, Data Inputs, Data Outputs, Data Stores. Table 7.1 lists Message as a separate basic decorator element | `bpmn:DataObject`, `bpmn:DataObjectReference`, `bpmn:DataInput`, `bpmn:DataOutput`, `bpmn:DataStore`, `bpmn:DataStoreReference`, `bpmn:Message` |
| **Connecting Objects** | Sequence Flows, Message Flows, Associations, Data Associations | `bpmn:SequenceFlow`, `bpmn:MessageFlow`, `bpmn:Association`, `bpmn:DataInputAssociation`, `bpmn:DataOutputAssociation` (abstract parent `bpmn:DataAssociation`) |
| **Swimlanes** | Pools, Lanes | `bpmn:Participant` (Pool), `bpmn:Lane` inside a `bpmn:LaneSet` |
| **Artifacts** | Group, Text Annotation. Tools may add their own Artifacts | `bpmn:Group`, `bpmn:TextAnnotation`. In the metamodel `bpmn:Association` also inherits from `bpmn:Artifact` |

All elements by category:

- **Events:** Start Event, Intermediate Event (catching and throwing; in normal flow or attached to a boundary as a Boundary Event), End Event. Triggers/results are listed in §3.3.
- **Activities:** Task (8 types), Sub-Process (embedded; collapsed and expanded), Event Sub-Process, Transaction, Ad-Hoc Sub-Process, Call Activity. Markers in §4.5.
- **Gateways:** Exclusive, Inclusive, Parallel, Complex, Event-Based, Exclusive Event-Based (instantiate), Parallel Event-Based (instantiate).
- **Data:** Data Object (single and collection), Data Object Reference, Data Input, Data Output, Data Store (via Data Store Reference), Data State, Message.
- **Connecting Objects:** Sequence Flow (normal, conditional, default, exception flow), Message Flow, Association (non-directional, directional, bi-directional; compensation association), Data Association (input and output).
- **Swimlanes:** Pool (white box and black box), Lane, nested Lanes.
- **Artifacts:** Group (with Category and CategoryValue), Text Annotation.

---

## 3. Events

### 3.1. Basics

An **Event** is something that "happens" during a process and affects its flow. Events usually have a cause (trigger) or an impact (result). The shape is a circle with an open center where the type marker goes.

By when they affect the flow there are three kinds:

| Kind | bpmn-moddle type | Border | Role |
|---|---|---|---|
| **Start Event** | `bpmn:StartEvent` | **single thin line** | starts a process (at the process level) |
| **Intermediate Event** | `bpmn:IntermediateCatchEvent`, `bpmn:IntermediateThrowEvent`, `bpmn:BoundaryEvent` | **double thin line** | between start and end |
| **End Event** | `bpmn:EndEvent` | **single thick line** | ends a path |

**Catching and throwing.** Catch events (`bpmn:CatchEvent`: Start, IntermediateCatch, Boundary) wait for a trigger. Throw events (`bpmn:ThrowEvent`: IntermediateThrow, End) produce a result.

- A **catch** marker is **outlined** (unfilled).
- A **throw** marker is **filled** (dark). Per §7.5: "the markers for "throwing" Events MUST have a dark fill".

**Interrupting and non-interrupting** apply only to Boundary Events (attribute `cancelActivity`, default `true`) and to Start Events inside an Event Sub-Process (attribute `isInterrupting`, default `true`).

- An interrupting event is drawn with a **solid** border.
- A non-interrupting event is drawn with a **dashed** border.

A **Boundary Event** is an intermediate event attached to the boundary of an Activity (`attachedToRef`). It is always a catch event.

- An interrupting boundary event cancels the activity; the flow continues on the exception flow.
- A non-interrupting boundary event does not cancel the activity; it starts a parallel path and may fire several times.

**Event Sub-Process Start Event.** A Start Event inside `bpmn:SubProcess triggeredByEvent="true"` must be typed.

- With `isInterrupting="true"` (solid border) the enclosing process is interrupted.
- With `isInterrupting="false"` (dashed border) the process continues, and several instances of the Event Sub-Process may run at the same time.

### 3.2. Visual encoding

| Position | Border | Marker | XML |
|---|---|---|---|
| Start (regular) | single thin solid | outlined | `<bpmn:startEvent>` |
| Start in Event Sub-Process, interrupting | single thin solid | outlined | `<bpmn:startEvent isInterrupting="true">` (default) |
| Start in Event Sub-Process, non-interrupting | single thin **dashed** | outlined | `<bpmn:startEvent isInterrupting="false">` |
| Intermediate catch (in flow) | double thin | outlined | `<bpmn:intermediateCatchEvent>` |
| Intermediate throw (in flow) | double thin | **filled** | `<bpmn:intermediateThrowEvent>` |
| Boundary interrupting | double thin solid | outlined | `<bpmn:boundaryEvent cancelActivity="true">` (default) |
| Boundary non-interrupting | double **dashed** | outlined | `<bpmn:boundaryEvent cancelActivity="false">` |
| End | single **thick** | filled | `<bpmn:endEvent>` |

### 3.3. Event definitions

The event type is set by a nested `eventDefinition`. **None** has no class of its own: it is an event without `eventDefinitions`. **Multiple** and **Parallel Multiple** have no classes either: they are events with two or more `eventDefinitions`; a Parallel Multiple catch event also has `parallelMultiple="true"`.

| Trigger / Result | bpmn-moddle type | Marker | Meaning | Key attributes |
|---|---|---|---|---|
| **None** | — (no `eventDefinitions`) | empty circle | no specific trigger or result | — |
| **Message** | `bpmn:MessageEventDefinition` | envelope | addressed message exchange with a participant | `messageRef` → `bpmn:Message`, `operationRef` |
| **Timer** | `bpmn:TimerEventDefinition` | clock | a point in time, a cycle or a duration | `timeDate`, `timeCycle`, `timeDuration` (Expression) |
| **Error** | `bpmn:ErrorEventDefinition` | lightning | a named error; always interrupts | `errorRef` → `bpmn:Error` (`errorCode`) |
| **Escalation** | `bpmn:EscalationEventDefinition` | upward arrowhead | escalation to a higher level; may be non-interrupting | `escalationRef` → `bpmn:Escalation` (`escalationCode`) |
| **Cancel** | `bpmn:CancelEventDefinition` | "X" | transaction cancellation | — |
| **Compensation** | `bpmn:CompensateEventDefinition` (**Compensate**, not Compensation; see §14) | two left-pointing triangles ("rewind") | triggers or handles compensation | `activityRef`, `waitForCompletion` (default `true`) |
| **Conditional** | `bpmn:ConditionalEventDefinition` | lined paper | a condition became true (false → true) | `condition` (Expression) |
| **Link** | `bpmn:LinkEventDefinition` | right arrow | a "go-to" (off-page connector) within one process level | `name`, `source`, `target` |
| **Signal** | `bpmn:SignalEventDefinition` | triangle | a broadcast signal without a specific receiver | `signalRef` → `bpmn:Signal` |
| **Terminate** | `bpmn:TerminateEventDefinition` | filled circle | ends the process level immediately and abnormally, including all multi-instance instances, without compensation or event handling. Inside a Sub-Process only that Sub-Process ends (in a multi-instance only the affected instance); higher levels are not affected (§13.5.6) | — |
| **Multiple** | — (≥ 2 `eventDefinitions`) | pentagon | catch: **one** of the triggers is enough; throw: **all** results are produced | — |
| **Parallel Multiple** | — (≥ 2 `eventDefinitions` and `parallelMultiple="true"`) | open plus sign | **all** triggers are required; catch only | `parallelMultiple` (attribute of `bpmn:CatchEvent`, default `false`) |

Message vs Signal: a Message is addressed to a specific participant; a Signal is broadcast and can be caught by any process, including other pools and other levels.

### 3.4. Allowed positions (table 10.93)

Checked against table 10.93 (rendered pages 259–260) and the BPMB poster; all sources agree. "yes" = allowed, "—" = not allowed.

| Event definition | Start: top-level | Start: Event Sub-Process, interrupting | Start: Event Sub-Process, non-interrupting | Intermediate: catching | Intermediate: boundary interrupting | Intermediate: boundary non-interrupting | Intermediate: throwing | End |
|---|---|---|---|---|---|---|---|---|
| **None** | yes | — | — | — | — | — | yes | yes |
| **Message** | yes | yes | yes | yes | yes | yes | yes | yes |
| **Timer** | yes | yes | yes | yes | yes | yes | — | — |
| **Error** | — | yes | — | — | yes | — | — | yes |
| **Escalation** | — | yes | yes | — | yes | yes | yes | yes |
| **Cancel** | — | — | — | — | yes¹ | — | — | yes¹ |
| **Compensation** | — | yes² | — | — | yes³ | — | yes | yes |
| **Conditional** | yes | yes | yes | yes | yes | yes | — | — |
| **Link** | — | — | — | yes | — | — | yes | — |
| **Signal** | yes | yes | yes | yes | yes | yes | yes | yes |
| **Terminate** | — | — | — | — | — | — | — | yes |
| **Multiple** | yes | yes | yes | yes | yes | yes | yes | yes |
| **Parallel Multiple** | yes | yes | yes | yes | yes | yes | — | — |

¹ **Cancel** only in a transaction context. A Cancel End Event is only used inside a Transaction. A Cancel boundary event MAY only be attached to a Sub-Process with the transaction flag (`bpmn:Transaction`). Always interrupting.
² A **Compensation Start Event** is only allowed for a Compensation Event Sub-Process. Table 10.93 puts it in the "Interrupting" column (solid border), but per tables 10.86 and 10.87 "This Event does not interrupt the Process since the Process has to be completed before this Event can be triggered", and `isInterrupting` does not apply to it.
³ A **Compensation boundary event** always has a solid border, but "interrupting" is nominal: compensation only happens after the activity completed, so `cancelActivity` is "N/A" for it (table 10.92). It MUST NOT have outgoing Sequence Flows; it is connected to the Compensation Activity with an Association (§4.7).

Counts stated in the specification text:

- 7 Start types for a top-level process: None, Message, Timer, Conditional, Signal, Multiple, Parallel Multiple.
- 9 Start types for an Event Sub-Process: Message, Timer, Escalation, Error, Compensation, Conditional, Signal, Multiple, Parallel Multiple.
- 10 of the 12 Intermediate types are allowed in normal flow: all except Error and Cancel.
- 10 Boundary types: Message, Timer, Error, Escalation, Cancel, Compensation, Conditional, Signal, Multiple, Parallel Multiple.
- 9 End types: None, Message, Error, Escalation, Cancel, Compensation, Signal, Terminate, Multiple.

Also:

- **A Start Event in an embedded Sub-Process is None only** (table 10.85): "the flow of the Process (a token) from the parent Process is the trigger of the Sub-Process".
- **A called (global) Process** is invoked through its None Start Event. Its other Start Events only apply when the process is started as a top-level process.
- **A None Intermediate Event is throw only** and only in normal flow; it is not allowed on a boundary.
- **Timer and Conditional are never throw.** **Link is never Start, End or Boundary.** **Terminate is End only.** **Error is not allowed in normal flow** (neither catch nor throw): only an Error End Event throws an error.
- **Escalation catching in normal flow is not allowed**: it is only caught on a boundary or by an Event Sub-Process start.

### 3.5. `cancelActivity` on Boundary Events (table 10.92)

| Trigger | Allowed `cancelActivity` values |
|---|---|
| None | N/A: cannot be attached to a boundary |
| Message, Timer, Escalation, Conditional, Signal | true / false |
| Error | true only |
| Cancel | true only |
| Compensation | N/A: the activity has already completed |
| Multiple | true / false if every trigger allows it; otherwise the stricter value (true if Error or Cancel is present) |

`isInterrupting` on a Start Event (table 10.87) only applies to Start Events in an Event Sub-Process. It is always true for Error and does not apply to Compensation.

### 3.6. Connection rules for events (normative)

**Start Event**

- MUST NOT be the target of a Sequence Flow. Exception: a Start Event on the boundary of an expanded Sub-Process MAY be the target of a parent Sequence Flow; bpmn-js does not support this construct.
- MUST be the source of a Sequence Flow. Several outgoing flows create parallel paths; their `conditionExpression` MUST be None.
- A Start Event is optional. But "If there is an End Event, then there MUST be at least one Start Event", and vice versa.
- Without a Start Event, every Flow Object without incoming Sequence Flows starts when the instance is created. Exceptions: Compensation Activities, catching Link Events, Event Sub-Processes.
- Several Start Events may exist at one level, each an independent trigger. The specification advises using this "sparingly".
- Message Flow: MAY be a target (0..n, each incoming Message Flow is a separate instantiation mechanism). MUST NOT be a source.

**End Event**

- MUST be the target of a Sequence Flow (MAY have several incoming). MUST NOT have outgoing Sequence Flows. Exception: an End Event on the boundary of an expanded Sub-Process.
- An End Event is optional. Without one, a path ends at a node without outgoing flows. The process does not end until all parallel paths have ended.
- Message Flow: MUST NOT be a target. MAY be a source (0..n). With outgoing Message Flows the result MUST be Message or Multiple; with several outgoing Message Flows it MUST be Multiple.

**Intermediate Event in normal flow**

- MUST be the target of a Sequence Flow (a change from BPMN 1.2).
- MAY have several incoming flows. This is **uncontrolled flow**: every arriving token triggers the event separately, without waiting for the others. Use a gateway to synchronize.
- MUST be the source of a Sequence Flow. Exception: a source Link Event.
- A Link Event MUST NOT be both a target and a source.

**Boundary Event**

- MUST NOT have incoming Sequence Flows. MUST have an outgoing one. Exception: a Compensation boundary event MUST NOT have outgoing Sequence Flows, only an Association.
- One or more events can be attached to any Activity.

**Message Intermediate Event:** MAY have one incoming **or** one outgoing Message Flow, not both.

**Link Events**

- Only meaningful as pairs with the same name: source (throw) → target (catch).
- A target MAY have several sources. A source MUST NOT have several targets.
- Link Events only work within **one process level**: a parent and a Sub-Process cannot be linked.

### 3.7. XML examples (bpmn-moddle / BPMN 2.0.2)

```xml
<!-- Non-interrupting timer boundary event -->
<bpmn:boundaryEvent id="Reminder" attachedToRef="Task_Approve" cancelActivity="false">
  <bpmn:timerEventDefinition>
    <bpmn:timeDuration xsi:type="bpmn:tFormalExpression">PT24H</bpmn:timeDuration>
  </bpmn:timerEventDefinition>
</bpmn:boundaryEvent>

<!-- Event Sub-Process with a non-interrupting message start event -->
<bpmn:subProcess id="ESP_Update" triggeredByEvent="true">
  <bpmn:startEvent id="ESP_Start" isInterrupting="false">
    <bpmn:messageEventDefinition messageRef="Msg_Update" />
  </bpmn:startEvent>
</bpmn:subProcess>

<!-- Parallel Multiple start event: both triggers are required -->
<bpmn:startEvent id="Start_All" parallelMultiple="true">
  <bpmn:messageEventDefinition messageRef="Msg_A" />
  <bpmn:signalEventDefinition signalRef="Sig_B" />
</bpmn:startEvent>

<!-- Link: a throw/catch pair with the same name -->
<bpmn:intermediateThrowEvent id="GoTo_A"><bpmn:linkEventDefinition name="A" /></bpmn:intermediateThrowEvent>
<bpmn:intermediateCatchEvent id="Label_A"><bpmn:linkEventDefinition name="A" /></bpmn:intermediateCatchEvent>
```

---

## 4. Activities

An **Activity** is work performed in a process: atomic (**Task**) or compound (**Sub-Process**). The shape is a rounded rectangle. Border styles are reserved:

| Border | Meaning |
|---|---|
| single thin | Task, regular Sub-Process |
| **thick** | Call Activity |
| **dotted** | Event Sub-Process; not allowed for a Task |
| **double thin** | Transaction; not allowed for a Task |

### 4.1. Task types

Per the specification: "A Task which is not further specified is called **Abstract Task** (this was referred to as the **None Task** in BPMN 1.2)". The type marker sits in the upper-left corner. Tools MAY add further types.

| Type | bpmn-moddle | Marker | Purpose and key attributes |
|---|---|---|---|
| **Task** (Abstract Task / None Task) | `bpmn:Task` | none | the kind of work is not specified |
| **Service Task** | `bpmn:ServiceTask` | gears | calls a service (web service, application). `implementation` (default `##WebService`), `operationRef` |
| **Send Task** | `bpmn:SendTask` | **filled** envelope | sends a Message to an external participant; completes once sent. `messageRef`, `operationRef`, `implementation` |
| **Receive Task** | `bpmn:ReceiveTask` | **outlined** envelope | waits for a Message; completes once received. `messageRef`, `operationRef`, `instantiate` |
| **User Task** | `bpmn:UserTask` | person | a human performs the task with the help of an application, assigned through a task list. `renderings`, `implementation` |
| **Manual Task** | `bpmn:ManualTask` | hand | performed without an engine or application |
| **Business Rule Task** | `bpmn:BusinessRuleTask` | table with a filled header | calls a business rules engine. `implementation` (default `##unspecified`) |
| **Script Task** | `bpmn:ScriptTask` | scroll with lines | a script executed by the engine. `scriptFormat` (MIME type, MUST be set if a script is present), `script`; without a script it behaves like an Abstract Task |

**Receive Task with `instantiate="true"`** creates a process instance when the message arrives. Requirements: "its instantiate attribute MUST be set to true and it MUST NOT have any incoming Sequence Flow". Its marker then looks like a Message Start Event: an outlined envelope in a thin circle. There MAY be several such tasks.

### 4.2. Sub-Processes

| Kind | bpmn-moddle | Notation | Rules |
|---|---|---|---|
| **Sub-Process (collapsed)** | `bpmn:SubProcess`, DI `isExpanded="false"` | rectangle with a "+" marker (square with a plus) at the bottom center | details hidden; in bpmn-js ≥ 9 they open on a separate plane (drill-down) |
| **Sub-Process (expanded)** | `bpmn:SubProcess`, DI `isExpanded="true"` | enlarged rectangle showing its contents | **Sequence Flows do not cross the boundary**. Start and End inside are optional ("parallel box", figure 10.27). A Start inside is None only |
| **Event Sub-Process** | `bpmn:SubProcess triggeredByEvent="true"` | thin **dotted** border. Collapsed: "+" marker at the bottom (figure 10.30), and the Start Event shown as a marker in the upper-left corner | MUST NOT have incoming or outgoing Sequence Flows. MUST have **exactly one** Start Event, which MUST be typed. Whether it interrupts the parent depends on its Start Event (§3.4) |
| **Transaction** | `bpmn:Transaction` (`method`, `protocol`) | **double** thin border | outcomes: success (normal exit), cancel (Cancel End Event inside, then the Cancel boundary after rollback and compensation), hazard (Error boundary, no compensation) |
| **Ad-Hoc Sub-Process** | `bpmn:AdHocSubProcess` (`ordering` = `Parallel` (default) or `Sequential`; `completionCondition`; `cancelRemainingInstances` = `true`) | "~" (tilde) marker at the bottom | the performers decide order and frequency. MUST contain Activities. MAY contain: Data Object, Sequence Flow, Association, Data Association, Group, Message Flow, Gateway, Intermediate Event. **MUST NOT contain: Start Event, End Event**, Conversations, Conversation Links, Choreography Activities |

A Sub-Process defines a context (scope) for data visibility, transactions, exception handling (boundary events), events and compensation.

### 4.3. Call Activity and Global Task

**Call Activity**: `bpmn:CallActivity`, attribute `calledElement` (a string in bpmn-moddle). Calls a **global Process** or a **Global Task**. Distinguished by a **thick** border.

| Called element | Notation |
|---|---|
| Global Task | Task shape with a thick border and the global task's type marker (e.g. User Task) |
| Process, details hidden | like a collapsed Sub-Process ("+") with a thick border |
| Process, details shown | like an expanded Sub-Process with a thick border |

**Call Activity vs Sub-Process**

| | Sub-Process (embedded) | Call Activity |
|---|---|---|
| Definition | inside the parent process | reference to an external `CallableElement` (Process or GlobalTask) |
| Reuse | no | yes, "may occur in completely different parent processes" (Camunda) |
| Data | shares the parent's context; no data mapping needed | explicit mapping: the Call Activity's InputOutputSpecification MUST match the called element |
| Border | thin | thick |
| BPMN 1.2 | Embedded Sub-Process | Reusable Sub-Process |

Errors and escalations from the called element propagate to the Call Activity and can be caught by its boundary events.

**Global Tasks** are reusable atomic task definitions without graphics. Types: `bpmn:GlobalTask`, `bpmn:GlobalUserTask`, `bpmn:GlobalManualTask`, `bpmn:GlobalScriptTask`, `bpmn:GlobalBusinessRuleTask`. Specification: "Only GlobalUserTask, GlobalManualTask, GlobalScriptTask, and GlobalBusinessRuleTask are defined". BPMN 1.2 Reference Tasks were removed in favour of Global Tasks (Annex A).

### 4.4. Loop and Multi-Instance

| Characteristic | bpmn-moddle | Attributes |
|---|---|---|
| Standard loop | `bpmn:StandardLoopCharacteristics` | `testBefore` (default `false`: the condition is checked after each iteration), `loopCondition` (Expression), `loopMaximum` |
| Multi-instance | `bpmn:MultiInstanceLoopCharacteristics` | `isSequential` (default `false`, i.e. parallel), `loopCardinality`, `loopDataInputRef`, `loopDataOutputRef`, `inputDataItem`, `outputDataItem`, `completionCondition`, `behavior` (None, One, All (default), Complex), `complexBehaviorDefinition`, `oneBehaviorEventRef`, `noneBehaviorEventRef` |

An Activity MAY have only one `loopCharacteristics` object, so Loop and Multi-Instance are mutually exclusive.

### 4.5. Activity markers

| Marker | Look | Model | Applies to |
|---|---|---|---|
| **Sub-Process marker** (collapsed) | square with "+" | collapsed display (DI) | collapsed Sub-Process, Ad-Hoc, Transaction, Event Sub-Process; a Call Activity calling a Process (collapsed) |
| **Loop** | arrow curving back | `StandardLoopCharacteristics` | Task, Sub-Process, Call Activity |
| **Multi-Instance, parallel** | **three vertical** lines | `MultiInstanceLoopCharacteristics isSequential="false"` | Task, Sub-Process, Call Activity |
| **Multi-Instance, sequential** | **three horizontal** lines (the marker rotated by 90°) | `MultiInstanceLoopCharacteristics isSequential="true"` | Task, Sub-Process, Call Activity |
| **Compensation** | two left-pointing triangles ("rewind") | `isForCompensation="true"` | Task, Sub-Process (Compensation Activity) |
| **Ad-Hoc** | "~" | type `bpmn:AdHocSubProcess` | Sub-Process only |

**Allowed combinations** (§10.3.3 and §10.3.5):

- **Task:** one or two markers: (Loop **or** Multi-Instance) + Compensation. Loop and Multi-Instance together are not allowed.
- **Collapsed Sub-Process:** the "+" marker plus one to three other markers in any combination except Loop and Multi-Instance together: Loop or Multi-Instance, Compensation, Ad-Hoc.
- **Placement:** all markers are grouped and centered at the bottom of the shape.
- A **Pool** with a multi-instance participant shows three vertical lines at the bottom center (§8).
- A **Data Object collection** shows three vertical lines (§6).

### 4.6. Activity behaviour in the flow

- **Several incoming Sequence Flows = uncontrolled flow (implicit merge).** Each token creates a **separate instance** of the Activity without waiting for the others. Use a gateway before the Activity to synchronize.
- **Several unconditional outgoing Sequence Flows = parallel paths** (implicit split, a "fork" through uncontrolled flow).
- An Activity without incoming Sequence Flows starts when the process instance is created. Exceptions: Compensation Activities and Event Sub-Processes.
- `startQuantity` (default 1): tokens required to start. `completionQuantity` (default 1): tokens produced on completion. Values above 1 are an "advanced type of modeling".
- `default` is the Activity's default Sequence Flow, shown with a slash (§7).
- Message Flow: an Activity MAY be a target and a source (0..n).

### 4.7. Compensation and for-compensation activities

- A **Compensation Activity** (`isForCompensation="true"`, "rewind" marker) is a Task or Sub-Process outside the normal flow, without incoming or outgoing Sequence Flows. It is not instantiated when the process starts.
- It is connected to the **Compensation boundary event** of the activity it compensates, with a **directional Association** ("compensation association"), not a Sequence Flow.
- Alternative: a **Compensation Event Sub-Process** inside a Sub-Process, started by a Compensation Start Event. It sees a "snapshot" of the data as of the Sub-Process's completion.
- Compensation is triggered by a **Compensation Intermediate Throw Event** or a **Compensation End Event**.
    - `activityRef` selects what to compensate. Without it, all successfully completed visible activities are compensated in reverse order.
    - `waitForCompletion` (default `true`): whether to wait for the handler to finish.
- Only **successfully completed** Activities can be compensated ("presumed abort principle"). A running Activity must be cancelled, not compensated.
- For an Activity to be compensable it MUST have a Compensation boundary event or a Compensation Event Sub-Process.

---

## 5. Gateways

A **Gateway** is a diamond with a single thin line. It controls diverging and converging Sequence Flows and performs no work itself. The inner marker sets the type.

| Gateway | bpmn-moddle | Marker | Diverging (split) | Converging (join/merge) |
|---|---|---|---|---|
| **Exclusive Gateway** | `bpmn:ExclusiveGateway` (`default`) | "X" **or no marker** (DI `isMarkerVisible`) | exactly one path. Conditions are evaluated in order and the first true one is taken; if none is true, the `default` flow; without a default, an exception (table 13.2) | each token passes immediately, without synchronization (simple merge) |
| **Inclusive Gateway** | `bpmn:InclusiveGateway` (`default`) | circle "O" | every path whose condition is true (from none to all; design so at least one is taken). If none is true, `default`, otherwise an exception | synchronizes only the incoming branches that are actually active (complex semantics, table 13.3) |
| **Parallel Gateway** | `bpmn:ParallelGateway` | "+" | all outgoing flows, conditions are not evaluated | waits for tokens on **all** incoming flows |
| **Complex Gateway** | `bpmn:ComplexGateway` (`activationCondition`, `default`) | "*" (asterisk) | like Inclusive, by conditions | by `activationCondition` (e.g. "3 of 5"), then reset; internal state `waitingForStart` |
| **Event-Based Gateway** | `bpmn:EventBasedGateway` (`instantiate="false"`, `eventGatewayType="Exclusive"`) | diamond with a double circle and a pentagon inside (like a catching Multiple Intermediate Event) | the path of the event that occurs first wins ("race", Deferred Choice) | passes through without synchronization |
| **Exclusive Event-Based Gateway** (instantiate) | `bpmn:EventBasedGateway instantiate="true" eventGatewayType="Exclusive"` | single circle with a pentagon (like a Multiple Start Event) | the first event that occurs **creates a process instance**. MUST NOT have incoming Sequence Flows | — |
| **Parallel Event-Based Gateway** (instantiate) | `bpmn:EventBasedGateway instantiate="true" eventGatewayType="Parallel"` | circle with "+" (like a Parallel Multiple Start Event) | the first event creates the instance; the other events are awaited in the same instance. Message triggers only, with one correlation | — |

**Gateway rules**

- **Direction.** A gateway MUST either merge (several incoming) or split (several outgoing). `gatewayDirection` is `Unspecified` (default), `Converging`, `Diverging` or `Mixed`. The specification allows a gateway that both merges and splits, but names as best practice using two consecutive gateways.
- **"X" marker.** Optional on an Exclusive Gateway. A diagram SHOULD be consistent: either always with "X" or always without.
- **Default flow.** Only on Exclusive, Inclusive and Complex Gateways and on Activities. The default flow's condition is ignored.
- **Conditions.** Outgoing Sequence Flows of Parallel and Event-Based Gateways MUST NOT have conditions. A conditional flow from a gateway is drawn **without** the mini diamond.
- **Event-Based Gateway**
    - MUST have ≥ 2 outgoing flows.
    - Outgoing flow targets: only Intermediate Catch Events with Message, Signal, Timer, Conditional or Multiple (of these) triggers, or Receive Tasks.
    - Not allowed: Error, Cancel, Compensation, Link triggers.
    - Message Intermediate Events and Receive Tasks must not be mixed in one configuration.
    - Such Receive Tasks MUST NOT have boundary events.
    - The targets MUST NOT have other incoming Sequence Flows.
    - A non-instantiating Event-Based Gateway MUST be `Exclusive`; `Parallel` is only allowed with `instantiate="true"`.
- **A gateway without incoming flows** in a process without a Start Event performs its split when the process starts.

**Typical gateway mistakes** (details in §12):

- XOR split with an AND join: **deadlock**, the parallel gateway waits for a branch that never comes.
- AND split with an XOR join: **token multiplication** after the merge.
- No default and conditions that do not cover every case: runtime exception.
- Conditions on the outgoing flows of a Parallel Gateway.
- A gateway with one incoming and one outgoing flow is useless.
- An unlabeled splitting gateway.
- Split and join in the same gateway.

---

## 6. Data

| Element | bpmn-moddle | Notation | Meaning |
|---|---|---|---|
| **Data Object** | `bpmn:DataObject` (`isCollection`, default `false`) | page with a folded corner | process or sub-process data. Lives as long as its container instance. Visible to the container, its "siblings" and their descendants |
| **Data Object Reference** | `bpmn:DataObjectReference` (`dataObjectRef`, `dataState`) | like a Data Object | shows the same Data Object again, e.g. in different states. Per §10.4.1 "Data Object Reference cannot specify item definitions, and Data Objects cannot specify states", i.e. **the state is set on the reference**. The "States" subsection of the same clause and the metamodel (`dataState` on any ItemAwareElement) also allow a state on the Data Object: an internal contradiction (§14) |
| **Data Object (Collection)** | `isCollection="true"` (or an ItemDefinition with `isCollection`) | three vertical lines at the bottom | a collection (e.g. order items) |
| **Data Input** | `bpmn:DataInput` (inside `bpmn:InputOutputSpecification`) | Data Object with an **outlined** block arrow | input of a process or called process ("input parameter") |
| **Data Output** | `bpmn:DataOutput` | Data Object with a **filled** block arrow | output of a process ("output parameter") |
| **Data Store** | `bpmn:DataStore` (root element: `name`, `capacity`, `isUnlimited`) | cylinder | data that **outlives** the process instance (database, filing cabinet) |
| **Data Store Reference** | `bpmn:DataStoreReference` (`dataStoreRef`) | cylinder | shows a Data Store on the diagram. It is the source or target of Data Associations |
| **Data State** | `bpmn:DataState` (`name`) on an ItemAwareElement | label like `Name [State]` | the state of the data. Possible values are not standardized |
| **Property** | `bpmn:Property` | not displayed | a "variable" of a Process, Activity or Event |
| **Message** | `bpmn:Message` (`name`, `itemRef`), root element | envelope | the content of a communication between two participants. In BPMN 2.0 it is a graphical **decorator**, not a flow node |

**Data Associations** (`bpmn:DataInputAssociation`, `bpmn:DataOutputAssociation`) move data between Data Objects, Properties and the inputs/outputs of Activities and Events. They are drawn like a **directional Association**: a dotted line with an open arrowhead.

- **Input:** Data Object Reference or Data Store Reference → Activity or Throw Event (the event fills a Message).
- **Output:** Activity or Catch Event → Data Object Reference or Data Store Reference (the event extracts data from the received Message).
- An Activity has two groups of associations (input and output), an Event has one.
- If at least one source is "unavailable", the association is not executed and the Activity waits.
- BPMN 1.2 drew inputs and outputs as directional Associations. 2.0 has a separate Data Association connector with the same notation.

**Message on a Message Flow.** The envelope MAY be shown in the middle of a Message Flow (`MessageFlow.messageRef`). BPMN DI sets the display through `BPMNEdge.messageVisibleKind`:

- `initiating`: the envelope is **not shaded** (initiating message);
- `non_initiating`: the envelope has a **light fill** (reply message).

The rule "the reply message MUST be shaded with a light fill" mainly concerns choreographies (§8.4.11, §12.2.3.6).

---

## 7. Connecting objects

### 7.1. Notation

| Connection | bpmn-moddle | Notation |
|---|---|---|
| **Sequence Flow** | `bpmn:SequenceFlow` | **solid** line with a **filled** arrowhead |
| **Conditional flow** | `bpmn:SequenceFlow` with `conditionExpression` | from an **Activity**: a **mini diamond** at the start of the line; from a **Gateway**: **no** mini diamond. An Activity with a conditional flow MUST have at least one more outgoing flow |
| **Default flow** | `default` reference on the source (Exclusive, Inclusive, Complex Gateway or Activity) | a **slash** at the start of the line |
| **Exception flow** | Sequence Flow leaving a Boundary Event | a normal Sequence Flow starting at the boundary event |
| **Message Flow** | `bpmn:MessageFlow` (`messageRef`) | **dashed** line, **open circle** at the start, **open (unfilled) arrowhead** at the end |
| **Association** | `bpmn:Association` (`associationDirection` = `None` (default), `One` or `Both`) | **dotted** line. `None`: no arrowheads; `One`: open arrowhead at the target; `Both`: arrowheads at both ends |
| **Compensation Association** | `bpmn:Association` (`One`) from a Compensation boundary event | directional Association to the Compensation Activity |
| **Data Association** | `bpmn:DataInputAssociation`, `bpmn:DataOutputAssociation` | like a directional Association (dotted line with an open arrowhead) |

The line styles of Sequence Flow, Message Flow and Association MUST NOT be changed or duplicated by other styles (§7.5). Recommendation from §7.6: draw Sequence Flows left to right or top to bottom, and Message Flows at 90° to them.

### 7.2. Sequence Flow rules (table 7.3 plus details)

Table 7.3 ("can the row object connect to the column object"), checked on the rendered page.

| From \ To | Start Event | Task / Activity | Sub-Process (collapsed) | Gateway | Intermediate Event | End Event |
|---|---|---|---|---|---|---|
| **Start Event** | — | yes | yes | yes | yes | yes |
| **Task / Activity** | — | yes | yes | yes | yes | yes |
| **Sub-Process** | — | yes | yes | yes | yes | yes |
| **Gateway** | — | yes | yes | yes | yes | yes |
| **Intermediate Event** | — | yes | yes | yes | yes | yes |
| **End Event** | — | — | — | — | — | — |

Pools, Lanes, Data Objects, Groups and Text Annotations are not in the table: they never have Sequence Flows.

Details:

- **A Sequence Flow cannot cross a Pool boundary** ("cannot cross the boundaries of a Pool"). A process lives entirely inside its pool.
- **A Sequence Flow cannot cross a Sub-Process boundary**: objects inside an expanded Sub-Process do not connect to objects outside. The flow is connected to the Sub-Process boundary instead.
- A Sequence Flow **can** cross Lane boundaries within one Pool.
- **Event Sub-Process:** no incoming or outgoing Sequence Flows.
- **Boundary Event:** outgoing only. A Compensation boundary event: none at all.
- **Compensation Activity** (`isForCompensation`): no incoming or outgoing Sequence Flows.
- **Link:** a throw (source) has no outgoing flows, a catch (target) has no incoming flows.
- **Event-Based Gateway:** outgoing flows only lead to allowed Intermediate Catch Events or Receive Tasks (§5).
- Every Sequence Flow has exactly one source and one target among Events, Activities and Gateways (Choreography Activities in a choreography).

### 7.3. Message Flow rules (table 7.4 plus details)

Table 7.4, checked on the rendered page.

| From \ To | Message Start Event | Pool (black box) | Task | Sub-Process | Message Intermediate Catch Event | Message End Event |
|---|---|---|---|---|---|---|
| **Message Start Event** | — | — | — | — | — | — |
| **Pool** | yes | yes | yes | yes | yes | — |
| **Task** | yes | yes | yes | yes | yes | — |
| **Sub-Process** | yes | yes | yes | yes | yes | — |
| **Message Intermediate Throw Event** | yes | yes | yes | yes | yes | — |
| **Message End Event** | yes | yes | yes | yes | yes | — |

Lanes, Gateways, Data Objects, Groups and Text Annotations are not in the table: Message Flows do not connect to them.

Details:

- **A Message Flow MUST connect two different Pools** (participants). It connects to the pool boundary or to Flow Objects inside the pool. **It MUST NOT connect two objects in the same Pool**, including objects in different Lanes of one pool.
- Sources: Pool, Activity, Message Intermediate Throw Event, Message End Event (and Multiple). Targets: Pool, Activity, Message Start Event, Message Intermediate Catch Event, Message boundary event.
- A **Start Event** is never a source. An **End Event** is never a target. **Gateways** and **Lanes** do not take part.
- A Message Flow does not carry a token.

### 7.4. Association and Data Association rules

- **Artifacts** (Group, Text Annotation) MUST NOT be the source or target of Sequence Flows or Message Flows. A Text Annotation connects to any element through an Association.
- A **Data Association** connects a Data Object Reference or Data Store Reference with an Activity or Event (directions in §6).
- **Compensation Association:** Compensation boundary event → Compensation Activity, directional.

### 7.5. Summary: what connects to what

| Source → Target | Sequence Flow | Message Flow | Association / Data Association |
|---|---|---|---|
| Flow Object → Flow Object in the **same** process at the **same** level | yes (with the exceptions in §7.2) | **no** | Association: yes (e.g. compensation) |
| Flow Object → Flow Object in **another Pool** | **no** | yes (if both ends are allowed by §7.3) | — |
| Flow Object → Flow Object **inside a Sub-Process** (another level) | **no** | no (same participant) | — |
| Pool ↔ Pool | no | yes | — |
| Any element ↔ Lane | no | no | — |
| Data Object/Store Reference ↔ Activity or Event | no | no | **Data Association** |
| Text Annotation ↔ any element | no | no | **Association** |
| Start Event (as target) | **no** | yes (Message Start) | — |
| End Event (as source) | **no** | yes (Message End) | — |
| Boundary Event (as target) | **no** | yes (Message boundary) | — |
| Gateway | yes | **no** | — |

---

## 8. Swimlanes: Pools and Lanes

| Element | bpmn-moddle | Notation and rules |
|---|---|---|
| **Pool** | `bpmn:Participant` (`processRef`, `participantMultiplicity`) inside `bpmn:Collaboration` | square-cornered rectangle, single solid line. The name MAY be placed anywhere but MUST be separated from the contents by a line; usually on the left of a horizontal pool and at the top of a vertical one. A Pool represents a Participant: a PartnerEntity (a company) or a PartnerRole (a buyer) |
| **White-box Pool** | `Participant` with `processRef` | shows the process inside; Message Flows connect to the elements inside |
| **Black-box Pool** | `Participant` **without** `processRef` | "Black Box": contents hidden, no Sequence Flows, Message Flows connect to the boundary. The name MAY be shown without a separator line |
| **Lane** | `bpmn:Lane` (`flowNodeRef`) inside the process's `bpmn:LaneSet` | a partition of a Pool (or process) spanning its full length. Its meaning is up to the modeler: role, department, system. The label MUST NOT be separated by a line, except with nested Lanes |
| **Nested Lanes** | `bpmn:Lane.childLaneSet` → `bpmn:LaneSet` | lanes inside a lane. Matrix partitions are also allowed |
| **Multi-instance Participant** | `bpmn:ParticipantMultiplicity` (`minimum` = 0, `maximum` = 1 by default) | three vertical lines at the bottom center of the pool |

Also:

- Sequence Flows cross Lanes but not Pools.
- One Pool on a diagram MAY be drawn without a boundary (the modeler's own internal process). If there are several pools, the others MUST have boundaries.
- Orientation is horizontal or vertical (BPMN DI `isHorizontal`).
- Lanes partition a single participant; they are not separate participants. Interaction between Lanes is a Sequence Flow, never a Message Flow.

---

## 9. Artifacts

| Element | bpmn-moddle | Notation and rules |
|---|---|---|
| **Group** | `bpmn:Group` (`categoryValueRef` → `bpmn:CategoryValue`) | rounded rectangle drawn with a dashed line ("solid dashed line"; bpmn-js draws dash-dot). Visually groups elements of one category. **Does not affect the flow**; may cross Pool and Lane boundaries. The label is the CategoryValue's value, optionally prefixed by the Category name. The separator differs within the specification: "." in table 8.21 and ":" in the Category description (§8.4.1), see §14 |
| **Category / CategoryValue** | `bpmn:Category` (root, `name`, `categoryValue[]`), `bpmn:CategoryValue` (`value`) | not graphical. A Group displays one CategoryValue |
| **Text Annotation** | `bpmn:TextAnnotation` (`text`, `textFormat` = `text/plain`) | an "open" rectangle (bracket) drawn with a solid line. Connected to an element with a non-directional **Association**. Does not affect the flow |

Artifacts are never connected with Sequence Flows or Message Flows. Tools MAY introduce their own Artifacts (§7.3, §7.7), but may not change the shapes of the basic Flow Objects.

---

## 10. Choreography and Conversation

### 10.1. Choreography elements (Clause 11)

| Element | bpmn-moddle | Notation |
|---|---|---|
| **Choreography Task** | `bpmn:ChoreographyTask` (`participantRef[]`, `initiatingParticipantRef`, `messageFlowRef[]`, `loopType`) | rounded rectangle: a task name band and ≥ 2 **Participant Bands** |
| **Sub-Choreography** | `bpmn:SubChoreography` | collapsed with "+" or expanded with a nested choreography. Sequence Flows do not cross the boundary |
| **Call Choreography** | `bpmn:CallChoreography` (`calledChoreographyRef`) | like a Choreography Task or Sub-Choreography, but with a **thick** border. Calls a `bpmn:GlobalChoreographyTask` or a `bpmn:Choreography` |
| **Global Choreography Task** | `bpmn:GlobalChoreographyTask` | non-graphical reusable element |
| **Participant Band** | no separate semantic type: a `BPMNShape` with `bpmnElement` = Participant, `choreographyActivityShape`, `participantBandKind` | a band with the participant's name. The band of the **non-initiating** participant MUST have a light fill. `participantBandKind`: `top_initiating`, `middle_initiating`, `bottom_initiating`, `top_non_initiating`, `middle_non_initiating`, `bottom_non_initiating` |
| Markers | `loopType`: `None`, `Standard`, `MultiInstanceSequential`, `MultiInstanceParallel` | at most one of loop, MI parallel, MI sequential at the bottom of the name band. A multi-instance participant shows three vertical lines in its band |

Events in choreographies are restricted by tables 11.6–11.8. For example:

- A Message Start Event is not used in a standalone choreography; a Choreography Task is used instead.
- Error and Escalation are not used.
- Of the End Events only None and Terminate are meaningful.

### 10.2. Conversation elements (§9.5)

| Element | bpmn-moddle | Notation |
|---|---|---|
| **Conversation** | `bpmn:Conversation` (`participantRef[]`, `messageFlowRefs[]`) | **hexagon**, thin line |
| **Sub-Conversation** | `bpmn:SubConversation` (`conversationNodes[]`) | hexagon with a "+" marker at the bottom |
| **Call Conversation** | `bpmn:CallConversation` (`calledCollaborationRef`) | hexagon with a **thick** border: without "+" when calling a GlobalConversation, with "+" when calling a Collaboration |
| **Conversation Link** | `bpmn:ConversationLink` (`sourceRef`, `targetRef`) | **double** thin line between a Conversation Node and a Pool |
| **Global Conversation** | `bpmn:GlobalConversation` | a non-graphical "empty Collaboration" for reuse |

### 10.3. bpmn-js support: **none**

- bpmn-js has no renderers for `ChoreographyTask`, `SubChoreography`, `CallChoreography`, `Conversation`, `SubConversation`, `CallConversation` or `ConversationLink`: the `BpmnRenderer.handlers` list in `lib/draw/BpmnRenderer.js` does not contain these types.
- There is no palette entry, menu or rule for them.
- Import (`lib/import/BpmnTreeWalker.js`):
    - `handleCollaboration` only handles `participants`, `messageFlows` and `artifacts`; `conversations` and `conversationLinks` are not visited (from the code; import was not run).
    - A plane root is only handled as a Process, Sub-Process or Collaboration. `bpmn:Choreography` is a Collaboration subclass and passes that check, but its `flowElements` (Choreography Activities) are not visited (from the code).
    - A Choreography Task inside a process causes an unhandled rendering error: issue #1171 "Unhandled error when opening a choreography task", open since 2019.
- Maintainers' position (issue #418, 2015): "Conversation and choreography diagrams are out of scope for this project at the moment".
- The third-party project **chor-js** (bptlab) is "An editor for BPMN 2.0 choreography diagrams based on bpmn-js". Last push: January 2021.

**Consequence for Coframe:** choreographies and conversations are not supported in the editor. Warn the user when importing such XML.

---

## 11. What bpmn-js 18.30.1 supports

### 11.1. UI entry points

| Entry point | Provided by | How to open |
|---|---|---|
| **Palette** (left) | core `PaletteProvider` | always visible |
| **Context pad** (next to the selected element) | core `ContextPadProvider` | select an element |
| **Replace menu** (popup "Change element", wrench icon `bpmn-icon-screw-wrench`) | core `ReplaceMenuProvider`, options in `ReplaceOptions.js`, labels in `PopupEntries.js` | "Change element" in the context pad or key **R** |
| **Create menu** (popup "Create element") | **separate module** `bpmn-js-create-append-anything` | "Create element" in the palette or key **N** |
| **Append menu** (popup "Append element") | the same module | "Append element" in the context pad or key **A** |

The create/append module was in core in bpmn-js 11.2–11.5 and **moved out in 12.0.0** into `bpmn-js-create-append-anything`. demo.bpmn.io includes it: the strings "Create element", "Append element", `bpmn-create`, `bpmn-append` are in its bundle `https://demo.bpmn.io/bpmn/app.js`. The bpmn-js version in the demo bundle was not checked.

Other core keys: **H** hand tool, **L** lasso, **S** space tool, **C** global connect, **E** direct editing, **Ctrl/Cmd+A** select all, **Ctrl/Cmd+F** search.

In popup menus with search (more than 5 entries), entries with `rank: -1` are **hidden until the user starts searching** (`diagram-js PopupMenuComponent`: `filter(({ rank = 0 }) => rank >= 0)`). In Create and Append this hides: Send task, Receive task, Manual task, Inclusive gateway, Complex gateway and all five non-interrupting start events.

### 11.2. Palette (exact labels; checked in source and executed)

| Key | Label (title) | Creates |
|---|---|---|
| `hand-tool` | Activate hand tool | tool (H) |
| `lasso-tool` | Activate lasso tool | tool (L) |
| `space-tool` | Activate create/remove space tool | tool (S) |
| `global-connect-tool` | Activate global connect tool | tool (C) |
| `create.start-event` | Create start event | `bpmn:StartEvent` (None) |
| `create.intermediate-event` | Create intermediate/boundary event | `bpmn:IntermediateThrowEvent` (None). Dropped on an Activity boundary it **becomes a `bpmn:BoundaryEvent` without an event definition** (executed) |
| `create.end-event` | Create end event | `bpmn:EndEvent` (None) |
| `create.exclusive-gateway` | Create gateway | `bpmn:ExclusiveGateway` with a visible "X" (`isMarkerVisible = true`, executed) |
| `create.task` | Create task | `bpmn:Task` |
| `create.data-object` | Create data object reference | `bpmn:DataObjectReference`; the `bpmn:DataObject` is created automatically |
| `create.data-store` | Create data store reference | `bpmn:DataStoreReference` without a `bpmn:DataStore` (`dataStoreRef` is not set) |
| `create.subprocess-expanded` | Create expanded sub-process | `bpmn:SubProcess` (expanded, 350×200) with a None Start Event inside |
| `create.participant-expanded` | Create pool/participant | expanded `bpmn:Participant` (600×250) with a new `bpmn:Process`. The first pool turns a process diagram into a collaboration |
| `create.group` | Create group | `bpmn:Group`. A new `bpmn:Category` and `bpmn:CategoryValue` are created right away (even without a label); the group label is stored in `CategoryValue.value` |
| `create` (create-append module) | Create element | opens the Create menu (N) |

The palette has **no** Text Annotation, Lane, Call Activity, typed events, other gateways or task types. They are available through the context pad, the replace menu or the Create menu.

### 11.3. Context pad (exact labels and conditions)

| Label | Shown for |
|---|---|
| Append end event, Append gateway, Append task, Append intermediate/boundary event | Flow Nodes, except End Event, for-compensation activity, Link intermediate throw, Event Sub-Process, Event-Based Gateway and Compensation boundary event (the last two have their own entries, below) |
| Append receive task, Append message intermediate catch event, Append timer intermediate catch event, Append conditional intermediate catch event, Append signal intermediate catch event | **Event-Based Gateway** only |
| Append compensation activity | **Compensation boundary event** only; creates `bpmn:Task isForCompensation="true"` |
| Add lane above, Add lane below, Divide into two lanes, Divide into three lanes | expanded Pool or Lane. "Divide…" is shown if the element has fewer than 2 child lanes and is at least 120 px (two lanes) or 180 px (three) high; width for vertical pools |
| Change element | everything that has replacement options (wrench icon) |
| Add text annotation | Flow Nodes, Participants, Data Object/Store References, Sequence Flow, Message Flow, Group |
| Connect to other element | Flow Nodes and Participants. The connection type is chosen by the rules (§11.8) |
| Connect using association | Text Annotation |
| Connect using data input association | Data Object Reference, Data Store Reference |
| Delete | every deletable element |
| Append element (create-append module) | everything except End Event, Group, Text Annotation, Lane, Participant, Data Object/Store Reference, connections, for-compensation activity, Link throw and Event Sub-Process |

### 11.4. Replace menu "Change element" (exact labels; executed)

The current type is not listed.

| Selected element | Entries | Toggles in the menu header |
|---|---|---|
| Start Event in a process (top level) | Start event, Intermediate throw event, End event, Message start event, Timer start event, Conditional start event, Signal start event, plus same-type variants (e.g. for a Message start: Message intermediate catch event, Message intermediate throw event, Message end event) | — |
| Start Event in a regular Sub-Process | Start event, Intermediate throw event, End event. Typed starts are not offered | — |
| Start Event in an Event Sub-Process | Message start event, Timer start event, Conditional start event, Signal start event, Error start event, Escalation start event, Compensation start event, Message start event (non-interrupting), Timer start event (non-interrupting), Conditional start event (non-interrupting), Signal start event (non-interrupting), Escalation start event (non-interrupting), plus same-type variants | **Toggle non-interrupting** (for Message, Timer, Conditional, Signal, Escalation) |
| Intermediate catch or throw | Start event, Intermediate throw event, End event, Message intermediate catch event, Message intermediate throw event, Timer intermediate catch event, Escalation intermediate throw event, Conditional intermediate catch event, Link intermediate catch event, Link intermediate throw event, Compensation intermediate throw event, Signal intermediate catch event, Signal intermediate throw event, same-type variants | — |
| End Event | Start event, Intermediate throw event, End event, Message end event, Escalation end event, Error end event, **Cancel end event (only inside a Transaction)**, Compensation end event, Signal end event, Terminate end event, same-type variants | — |
| Boundary Event | Message boundary event, Timer boundary event, Escalation boundary event, Conditional boundary event, Error boundary event, **Cancel boundary event (only on a Transaction)**, Signal boundary event, Compensation boundary event, Message boundary event (non-interrupting), Timer boundary event (non-interrupting), Escalation boundary event (non-interrupting), Conditional boundary event (non-interrupting), Signal boundary event (non-interrupting) | **Toggle non-interrupting** (for Message, Timer, Conditional, Signal, Escalation) |
| Gateway | Exclusive gateway, Parallel gateway, Inclusive gateway, Complex gateway, Event-based gateway | — |
| Task, Call Activity and other tasks | Task, User task, Service task, Send task, Receive task, Manual task, Business rule task, Script task, Call activity, Sub-process (collapsed), Sub-process (expanded), Ad-hoc sub-process (collapsed), Ad-hoc sub-process (expanded) | **Parallel multi-instance**, **Sequential multi-instance**, **Loop** |
| Sub-Process (expanded) | Transaction, Event sub-process, Ad-hoc sub-process, Sub-process (collapsed) | Parallel multi-instance, Sequential multi-instance, Loop |
| Sub-Process (collapsed) | all tasks, Call activity, Sub-process (expanded), Ad-hoc sub-process (collapsed) (from the code) | same |
| Ad-Hoc Sub-Process (expanded) | Sub-process, Transaction, Event sub-process, Ad-hoc sub-process (collapsed) | same |
| Ad-Hoc Sub-Process (collapsed) | all tasks, Call activity, Sub-process (collapsed), Ad-hoc sub-process (expanded) (from the code) | same |
| Transaction | Sub-process, Ad-hoc sub-process, Event sub-process | Parallel multi-instance, Sequential multi-instance, Loop |
| Event Sub-Process | Transaction, Sub-process, Ad-hoc sub-process | **none** (loop markers are not offered for Event Sub-Processes) |
| Data Object Reference | Data store reference | **Collection** |
| Data Store Reference | Data object reference (not for a reference placed directly in the collaboration root) | — |
| Expanded Pool | Empty pool/participant (removes content). The suffix is added if the pool has content | **Participant multiplicity** |
| Empty Pool | Expanded pool/participant | **Participant multiplicity** |
| Sequence Flow | Sequence flow (to go back from default or conditional); Default flow (if the source is an Exclusive, Inclusive or Complex Gateway or an Activity and the flow is not yet the default); **Conditional flow** (only if the source is an **Activity** and there is no condition yet) | — |

The **Compensation** marker cannot be toggled in the menu header. `isForCompensation` is set when a Compensation boundary event is connected to an Activity with an association, or through "Append compensation activity".

### 11.5. Create menu "Create element" and Append menu "Append element" (exact labels)

Labels come from `PopupEntries.js` (core), the composition from `CreateOptionsUtil.js` (module). An asterisk marks an entry hidden until search (`rank: -1`).

| Group | Entries |
|---|---|
| **Tasks** | Task, User task, Service task, Send task\*, Receive task\*, Manual task\*, Business rule task, Script task |
| **Gateways** | Exclusive gateway, Parallel gateway, Inclusive gateway\* (also found by "or"), Complex gateway\*, Event-based gateway |
| **Sub-processes** | Call activity, Transaction, Event sub-process, Sub-process (collapsed), Sub-process (expanded), Ad-hoc sub-process (collapsed), Ad-hoc sub-process (expanded) |
| **Events** (None) | Start event, Intermediate throw event, Boundary event, End event |
| **Events** (Start) | Message start event, Timer start event, Conditional start event, Signal start event, Message start event (non-interrupting)\*, Timer start event (non-interrupting)\*, Conditional start event (non-interrupting)\*, Signal start event (non-interrupting)\*, Escalation start event (non-interrupting)\* |
| **Events** (Intermediate) | Message intermediate catch event, Message intermediate throw event, Timer intermediate catch event, Escalation intermediate throw event, Conditional intermediate catch event, Link intermediate catch event, Link intermediate throw event, Compensation intermediate throw event, Signal intermediate catch event, Signal intermediate throw event |
| **Events** (Boundary) | Message boundary event, Timer boundary event, Escalation boundary event, Conditional boundary event, Error boundary event, Cancel boundary event, Signal boundary event, Compensation boundary event, Message boundary event (non-interrupting), Timer boundary event (non-interrupting), Escalation boundary event (non-interrupting), Conditional boundary event (non-interrupting), Signal boundary event (non-interrupting) |
| **Events** (End) | Message end event, Escalation end event, Error end event, Cancel end event, Compensation end event, Signal end event, Terminate end event |
| **Data** | Data store reference, Data object reference |
| **Participants** | Expanded pool/participant (also found by "Non-empty pool/participant"), Empty pool/participant (also found by "Collapsed pool/participant") |

The **Append menu** has the same list **without** any start events, without Participants and without the untyped "Boundary event".

- On click, a typed boundary event is attached to the source Activity automatically, if it has no boundary events yet and attaching is allowed.
- Event sub-processes, boundary events and Link catch events are not placed automatically: they must be dragged.

**Corrections on create** (`ReplaceElementBehaviour` + `BpmnRules.canReplace`):

- non-interrupting starts, and Error, Escalation and Compensation starts outside an Event Sub-Process, are replaced with a None Start Event;
- a typed start inside a regular Sub-Process is replaced with None;
- a Cancel end or Cancel boundary outside a Transaction is replaced with a None end or None boundary.

### 11.6. Event matrix: bpmn-js labels per table 10.93 cell

"not in UI": allowed by the specification but not created by bpmn-js. "—": forbidden by the specification. **"deviation"**: bpmn-js allows what the specification forbids (§11.9).

| Definition | Start top-level | Start ESP interrupting | Start ESP non-interrupting | Catching | Boundary interrupting | Boundary non-interrupting | Throwing | End |
|---|---|---|---|---|---|---|---|---|
| None | Start event | — | — | — | — (**deviation**: "Boundary event") | — | Intermediate throw event | End event |
| Message | Message start event | Message start event | Message start event (non-interrupting) | Message intermediate catch event | Message boundary event | Message boundary event (non-interrupting) | Message intermediate throw event | Message end event |
| Timer | Timer start event | Timer start event | Timer start event (non-interrupting) | Timer intermediate catch event | Timer boundary event | Timer boundary event (non-interrupting) | — | — |
| Error | — (**deviation**: "Error start event" variant of an Error end event) | Error start event | — | — | Error boundary event | — | — | Error end event |
| Escalation | — (**deviation**: "Escalation start event" variant) | Escalation start event | Escalation start event (non-interrupting) | — | Escalation boundary event | Escalation boundary event (non-interrupting) | Escalation intermediate throw event | Escalation end event |
| Cancel | — | — | — | — | Cancel boundary event (on a Transaction only) | — | — | Cancel end event (inside a Transaction only) |
| Compensation | — (**deviation**: "Compensation start event" variant) | Compensation start event | — | — | Compensation boundary event | — | Compensation intermediate throw event | Compensation end event |
| Conditional | Conditional start event | Conditional start event | Conditional start event (non-interrupting) | Conditional intermediate catch event | Conditional boundary event | Conditional boundary event (non-interrupting) | — | — |
| Link | — | — | — | Link intermediate catch event | — | — | Link intermediate throw event | — |
| Signal | Signal start event | Signal start event | Signal start event (non-interrupting) | Signal intermediate catch event | Signal boundary event | Signal boundary event (non-interrupting) | Signal intermediate throw event | Signal end event |
| Terminate | — | — | — | — | — | — | — | Terminate end event |
| Multiple | not in UI | not in UI | not in UI | not in UI | not in UI | not in UI | not in UI | not in UI |
| Parallel Multiple | not in UI | not in UI | not in UI | not in UI | not in UI | not in UI | — | — |

Multiple and Parallel Multiple **are rendered** on import: several `eventDefinitions` give a pentagon, `parallelMultiple="true"` gives a "+" (issue #1090, fixed in 2019). They cannot be created or switched in the UI.

### 11.7. Complete element support map

Status:

- **Palette**: in the core palette.
- **Menu**: available through the Create, Append or Replace menu or the context pad.
- **Import only**: rendered and preserved on XML import, but not created in the UI.
- **No**: not supported.

| BPMN element | bpmn-moddle | Status | How to create (exact labels) |
|---|---|---|---|
| Start Event (None) | `bpmn:StartEvent` | Palette | Create start event; Create: Start event; Replace: Start event |
| Typed Start Events | `bpmn:StartEvent` + definition | Menu | Create or Replace: "… start event" (§11.6) |
| Intermediate Throw Event (None) | `bpmn:IntermediateThrowEvent` | Palette | Create intermediate/boundary event; Append intermediate/boundary event; Intermediate throw event |
| Typed Intermediate Catch/Throw | `bpmn:IntermediateCatchEvent`/`ThrowEvent` + definition | Menu | "… intermediate catch/throw event" |
| Boundary Event (typed) | `bpmn:BoundaryEvent` + definition | Menu | "… boundary event", "… (non-interrupting)"; or drop an intermediate event on an Activity boundary |
| End Event | `bpmn:EndEvent` | Palette | Create end event; Append end event; End event; "… end event" |
| Multiple / Parallel Multiple Event | several `eventDefinitions` / `parallelMultiple` | Import only | — |
| Task (Abstract) | `bpmn:Task` | Palette | Create task; Append task; Task |
| Service, Send, Receive, User, Manual, Business Rule, Script Task | `bpmn:ServiceTask` etc. | Menu | Service task, Send task, Receive task, User task, Manual task, Business rule task, Script task |
| Receive Task (instantiate) | `bpmn:ReceiveTask instantiate="true"` | Import only | rendered as an envelope in a circle; no toggle |
| Sub-Process (collapsed) | `bpmn:SubProcess`, `isExpanded=false` | Menu | Sub-process (collapsed). Drill-down: the "Open {element}" button |
| Sub-Process (expanded) | `bpmn:SubProcess`, `isExpanded=true` | Palette | Create expanded sub-process; Sub-process (expanded) |
| Event Sub-Process | `bpmn:SubProcess triggeredByEvent="true"` | Menu | Event sub-process, expanded only. Collapsed: import only, rendered with the start event icon |
| Transaction | `bpmn:Transaction` | Menu | Transaction, expanded only. Collapsed: import only |
| Ad-Hoc Sub-Process | `bpmn:AdHocSubProcess` | Menu | Ad-hoc sub-process (collapsed), Ad-hoc sub-process (expanded); "Ad-hoc sub-process" when replacing an expanded one |
| Call Activity | `bpmn:CallActivity` | Menu | Call activity. Always drawn collapsed: thick border and "+"; no expanded Call Activity and no Global Task markers |
| Global Task | `bpmn:GlobalTask` etc. | No | non-graphical element, no UI |
| Loop / MI parallel / MI sequential | `StandardLoopCharacteristics` / `MultiInstanceLoopCharacteristics` | Menu | toggles Loop, Parallel multi-instance, Sequential multi-instance |
| Compensation marker (for-compensation) | `isForCompensation` | Menu | Append compensation activity; connecting a Compensation boundary → Activity |
| Ad-Hoc marker | `bpmn:AdHocSubProcess` | Menu | replace with Ad-hoc sub-process |
| Exclusive Gateway (with "X") | `bpmn:ExclusiveGateway` | Palette | Create gateway; Append gateway; Exclusive gateway |
| Exclusive Gateway without "X" | DI `isMarkerVisible=false` | Import only | new gateways always have the "X" |
| Parallel, Inclusive, Complex, Event-based Gateway | corresponding types | Menu | Parallel gateway, Inclusive gateway, Complex gateway, Event-based gateway |
| Exclusive / Parallel Event-Based Gateway (instantiate) | `instantiate="true"`, `eventGatewayType` | Import only | entries are commented out in `ReplaceOptions.js` ("deactivated until issue #194") |
| Data Object | `bpmn:DataObject` | Menu (implicit) | created automatically with a Data Object Reference |
| Data Object Reference | `bpmn:DataObjectReference` | Palette | Create data object reference; Data object reference |
| Collection | `isCollection` | Menu | Collection toggle |
| Data Input / Data Output | `bpmn:DataInput` / `bpmn:DataOutput` | Import only | can only be moved within their original container |
| Data Store Reference | `bpmn:DataStoreReference` | Palette | Create data store reference; Data store reference. Can be placed outside pools; semantically it goes to the first pool with a process |
| Data Store (root) | `bpmn:DataStore` | No (core) | `dataStoreRef` is not created |
| Data State | `bpmn:DataState` | No | bpmn-js neither shows nor edits the state (`lib` has no mention of `dataState`) |
| Message (root) | `bpmn:Message` | No (core) | core does not create Messages. The envelope on a Message Flow is rendered on import with `messageRef` |
| Sequence Flow | `bpmn:SequenceFlow` | Menu | Connect to other element, global connect tool |
| Conditional flow | `conditionExpression` | Menu | Conditional flow (from an Activity only) |
| Default flow | `default` on the source | Menu | Default flow |
| Message Flow | `bpmn:MessageFlow` | Menu | Connect to other element: the rules choose it when the elements are in different pools |
| Association (None) | `bpmn:Association` | Menu | Add text annotation; Connect using association |
| Association (One) | `associationDirection="One"` | Menu | only the compensation association (automatic) |
| Association (Both) | `associationDirection="Both"` | Import only | rendered with arrowheads at both ends |
| Data Input / Output Association | `bpmn:DataInputAssociation` / `bpmn:DataOutputAssociation` | Menu | Connect using data input association or Connect to other element: the direction determines the type |
| Pool (white box) | `bpmn:Participant` + `processRef` | Palette | Create pool/participant; Expanded pool/participant |
| Pool (black box) | `bpmn:Participant` without `processRef` | Menu | Empty pool/participant |
| Lane, nested Lanes | `bpmn:Lane`, `childLaneSet` | Menu | Add lane above, Add lane below, Divide into two lanes, Divide into three lanes |
| Participant multiplicity | `bpmn:ParticipantMultiplicity` | Menu | Participant multiplicity toggle |
| Vertical Pool/Lane | DI `isHorizontal=false` | Import only for creation; editing works | vertical lanes render and work since v16. The palette creates horizontal pools |
| Group | `bpmn:Group` (+ `bpmn:Category`/`CategoryValue`) | Palette | Create group |
| Text Annotation | `bpmn:TextAnnotation` | Menu | Add text annotation (context pad). Not in the palette or the Create menu |
| Choreography (all elements) | `bpmn:ChoreographyTask` etc. | No | §10.3 |
| Conversation (all elements) | `bpmn:Conversation` etc. | No | §10.3 |

Exact labels: bpmn-js has no standalone "Group" label (it is "**Create group**" in the palette) and no standalone "Text annotation" label (it is "**Add text annotation**" in the context pad). These exist verbatim: "Message intermediate catch event", "Exclusive gateway", "Sub-process (collapsed)", "Event sub-process", "Transaction", "Ad-hoc sub-process", "Call activity", "Data object reference", "Data store reference", "Empty pool/participant".

### 11.8. bpmn-js connection rules (`BpmnRules.canConnect`, executed)

| Pair | bpmn-js result | Specification |
|---|---|---|
| Task → Task (same process) | `bpmn:SequenceFlow` | yes |
| Task → Start Event | not allowed | not allowed |
| Task → Start Event inside a Sub-Process | not allowed (other scope) | not allowed |
| Boundary Event → Task | `bpmn:SequenceFlow` | yes |
| Task → Boundary Event | not allowed | not allowed |
| Event Sub-Process ↔ Task | not allowed | not allowed |
| Event-Based Gateway → Task | not allowed | not allowed |
| Event-Based Gateway → Message Intermediate Catch | `bpmn:SequenceFlow` | yes |
| Task → another participant's Pool | `bpmn:MessageFlow` | yes |
| Pool → Sub-Process or Call Activity | `bpmn:MessageFlow` | yes (Activity) |
| Pool → Gateway | not allowed | not allowed |
| Pool → Timer Boundary Event | not allowed | not allowed |
| Pool → Message Intermediate Catch | `bpmn:MessageFlow` | yes |
| Pool → **None Start Event** | `bpmn:MessageFlow` | the specification treats an incoming Message Flow as a start trigger, so the event should be a Message Start (**more lenient than the specification**) |
| **None End Event** or **None Intermediate Throw** → Pool | `bpmn:MessageFlow` | an End Event with an outgoing Message Flow MUST have a Message or Multiple result (**more lenient than the specification**) |
| Error End Event or Escalation End Event → Pool | not allowed | not allowed |
| Start Event → Pool; Pool → End Event; Pool → Data Object Reference | not allowed | not allowed |
| Data Object or Data Store Reference → Task / End Event | `bpmn:DataInputAssociation` | yes |
| Task or Message Catch Event → Data Object Reference | `bpmn:DataOutputAssociation` | yes |
| Compensation Boundary → another Activity | `bpmn:Association`, `associationDirection="One"` | yes (compensation association) |

Attaching to a boundary (`canAttach`, executed):

- allowed: a None intermediate throw (becomes an untyped boundary event) and Message, Timer, Signal, Conditional catch events;
- not allowed: Link catch, Escalation throw;
- nothing can be attached to an Event Sub-Process, a for-compensation activity or a Receive Task after an Event-Based Gateway.

### 11.9. bpmn-js deviations from the specification (important for validation)

1. **Untyped Boundary Event.** The palette's "Create intermediate/boundary event" dropped on a boundary and the Create menu's "Boundary event" create a `bpmn:BoundaryEvent` without an event definition (executed). Per table 10.92 None is not allowed on a boundary. Require choosing a type or check it with the linter.
2. **Invalid top-level Start Events through same-type variants.**
    - For an Error End Event at the process root the menu offers "Error start event".
    - For an Escalation End Event: "Escalation start event" and "Escalation intermediate throw event".
    - For a Compensation Intermediate Throw Event: "Compensation start event" and "Compensation end event".
    - The menu was checked by execution. The replacement is not corrected: `ReplaceElementBehaviour` on `shape.replace` only fixes attachers (from the code).
    - Per the specification Error, Escalation and Compensation starts are only allowed in an Event Sub-Process.
3. **Message Flows to None events.** A None Start as target and a None End or None Intermediate Throw as source are allowed; the event type is not changed.
4. **No Multiple or Parallel Multiple** in the UI, no instantiating Event-Based Gateways, no `instantiate` toggle on Receive Tasks.
5. **Call Activity is always drawn collapsed** with "+". Calling a Global Task with a task type marker is not supported.
6. **Event Sub-Processes and Transactions cannot be collapsed** through the menu. Loop and MI are not available for Event Sub-Processes.
7. **The non-initiating Message envelope** on a Message Flow is drawn with a **dark fill** in the line color, whereas the specification requires a "light fill". The envelope is shown for any `messageRef`, even without `messageVisibleKind`; per the specification `messageVisibleKind` decides whether to show it (from the `BpmnRenderer` code).
8. **Data State is not supported.** Core does not create Data Stores or Messages as root elements.
9. **Choreography and Conversation are not supported** (§10.3).
10. A Start or End Event on the boundary of an expanded Sub-Process (the exception in §10.5.2 and §10.5.3) is not supported by the bpmn-js rules.

---

## 12. Modeling rules and common mistakes

### 12.1. bpmnlint `recommended` rules (bpmnlint 11.14.0)

| Rule | Level | Checks | Relation to the specification |
|---|---|---|---|
| `ad-hoc-sub-process` | error | no Start or End Events in an Ad-Hoc Sub-Process. The rule docs also mention "every intermediate catch event has an outgoing Sequence Flow", but the 11.14.0 code does not implement it | matches §10.3.5 |
| `conditional-flows` | error | if a split has a default or at least one condition, the other outgoing flows have conditions too | best practice |
| `end-event-required` | error | every Process and Sub-Process (except Ad-Hoc) has an End Event | **stricter** than the specification (End Events are optional) |
| `event-based-gateway` | error | ≥ 2 outgoing flows, no conditions | matches §10.6.6 |
| `event-sub-process-typed-start-event` | error | the Start Event of an Event Sub-Process is typed | matches |
| `fake-join` | warn | an Activity or Event has more than one incoming Sequence Flow ("fake join") | allowed by the specification (uncontrolled flow); the rule catches a common misunderstanding |
| `global` | warn | Errors, Escalations, Messages and Signals are named, used and uniquely named | best practice |
| `label-required` | error | Flow Nodes (except Parallel and Event-Based Gateways, merging gateways, Sub-Processes), conditional Sequence Flows, Participants and Lanes are labeled | best practice |
| `link-event` | error | Link events are named; every throw has a catch with the same name in the same scope; no duplicate catches | matches §10.5.4 |
| `no-bpmndi` | error | visual elements have BPMN DI | file integrity |
| `no-complex-gateway` | error | forbids Complex Gateways | **stylistic** restriction |
| `no-disconnected` | error | Tasks, Gateways, Sub-Processes and Events are connected by Sequence Flows (except Event Sub-Processes, compensation, Ad-Hoc contents) | best practice |
| `no-duplicate-sequence-flows` | error | no duplicate Sequence Flows (same source, target and condition) | best practice |
| `no-gateway-join-fork` | error | a gateway does not both merge and split | the specification allows `Mixed` but recommends separating |
| `no-implicit-split` | error | no implicit split: ≥ 2 unconditional non-default outgoing flows from an Activity or Event | allowed by the specification (uncontrolled flow) |
| `no-implicit-end` | error | no nodes without outgoing flows, except End Events and exceptions | the specification allows implicit ends |
| `no-implicit-start` | error | no nodes without incoming flows, except Start, Boundary, Event Sub-Process, Link catch, compensation, Ad-Hoc contents | the specification allows implicit starts |
| `no-inclusive-gateway` | warn | warns about Inclusive Gateways (complex semantics) | stylistic |
| `no-overlapping-elements` | warn | elements do not overlap | layout |
| `single-blank-start-event` | error | at most one None Start Event per Process or Sub-Process | best practice |
| `single-event-definition` | error | at most one eventDefinition per event | **effectively forbids Multiple and Parallel Multiple**, which the specification allows |
| `start-event-required` | error | every Process and Sub-Process (except Ad-Hoc) has a Start Event | **stricter** than the specification |
| `sub-process-blank-start-event` | error | a Start Event in a regular Sub-Process is None | matches table 10.85 |
| `superfluous-gateway` | warn | a gateway with one incoming and one outgoing flow | matches ("MUST merge or split") |
| `superfluous-label` | warn | a label on an unconditional Sequence Flow (except default flows and XOR/OR split outputs) | stylistic |
| `superfluous-termination` | warn | a Terminate End Event when there is nothing to terminate | best practice |

Outside `recommended`: `conditional-event` (in `correctness` and `all`: a Conditional Event in an executable process has a condition) and `standard-size` (only in `all`: standard shape sizes).

### 12.2. Classic mistakes

| Mistake | Why it is wrong | Correct approach |
|---|---|---|
| Message Flow inside one Pool (e.g. between Lanes) | a Message Flow MUST NOT connect objects of one pool | Sequence Flow inside a pool; Message Flow only between different participants |
| Sequence Flow across a Pool boundary | a process lives entirely inside its pool | Message Flow between pools |
| Sequence Flow into or out of an expanded Sub-Process | flows do not cross a Sub-Process boundary | connect to the boundary; inside, use its own None Start and End |
| Implicit split: several unconditional outputs from a task | per the specification this is a parallel split, but it reads badly and is often mistaken for a choice | an explicit Parallel Gateway, or an Exclusive Gateway with conditions |
| Implicit merge: several inputs into a task instead of synchronizing | uncontrolled flow: every token starts the task again | a Parallel or Inclusive Gateway before the task; Exclusive for a simple merge |
| XOR split, then AND join | deadlock: the AND waits for a branch that never comes | the join type matches the split type |
| AND split, then XOR join | several tokens continue after the XOR; tasks run several times | AND join |
| One gateway both merges and splits | hard to read, ambiguous | two consecutive gateways |
| No default flow on an XOR or OR with incomplete conditions | runtime exception when no condition is true (tables 13.2, 13.3) | a default flow (slash) or conditions covering every case |
| Unlabeled splitting gateway and unlabeled outputs | the decision logic is unclear | label the gateway as a question and the outputs as answers/conditions |
| Conditions on the outputs of a Parallel or Event-Based Gateway | MUST NOT | remove the conditions or change the gateway type |
| A regular task, Error Event or Link after an Event-Based Gateway | targets can only be Message, Signal, Timer, Conditional, Multiple catch events or Receive Tasks | fix the targets; do not mix Receive Tasks and Message Events |
| Error or Cancel Intermediate Event in normal flow | not allowed (table 10.89) | an Error End Event inside a Sub-Process and an Error boundary outside |
| Timer or Conditional as throw | timers and conditions are only caught | a catch event |
| Cancel End or Cancel boundary outside a Transaction | Cancel is only for Transactions | use a Transaction or Error |
| Typed Start in a regular Sub-Process | only None is allowed there | a None Start; typed starts belong in an Event Sub-Process |
| Untyped Start in an Event Sub-Process, or more than one Start in it | it MUST have exactly one typed Start | one typed Start |
| Sequence Flow into or out of an Event Sub-Process | MUST NOT | an Event Sub-Process is started by its own Start Event |
| Incoming Sequence Flow into a Start Event or Boundary Event; outgoing from an End Event | not allowed | rearrange the events |
| Compensation boundary with Sequence Flows; for-compensation activity in the flow | compensation is only connected with an Association | an Association to the Compensation Activity |
| Link Events without names, with different names or across process levels | pairs match by name and only on one level | identical names, one target per name |
| Message Flow to a Gateway, Lane or Data Object; from a Start Event; into an End Event | invalid ends (table 7.4) | connect to Pools, Activities or Message Events |
| Confusing Signal and Message | a Signal is broadcast, a Message is addressed | Message for a specific participant, Signal for "everyone interested" |
| Association instead of Data Association (or vice versa) | a non-directional Association is for annotations, a Data Association for data flow | data: Data Object Reference ↔ Activity or Event with a directional Data Association |
| Group used as a "sub-process" | a Group does not affect the flow and creates no scope | a Sub-Process when a scope for events and data is needed |
| Superfluous Terminate End Event | misleading when there is nothing to terminate | a regular None End Event |
| Several None Start Events in one process | ambiguous start | one None Start; type the other starts |
| Boundary Event on a Receive Task after an Event-Based Gateway | MUST NOT (§10.6.6); bpmn-js removes such events itself | move the timeout into the gateway configuration (Timer Intermediate Catch) |
| Untyped Boundary Event (a frequent bpmn-js artifact) | None is not allowed on a boundary | choose a type with "Change element" |

---

## 13. Sources

**Primary source (OMG specification)**

- OMG BPMN 2.0.2, formal/13-12-09: https://www.omg.org/spec/BPMN/2.0.2/ and PDF https://www.omg.org/spec/BPMN/2.0.2/PDF (downloaded and parsed in full: Clauses 1–2, 7, 8.3–8.4, 9, 10, 11, 12, 13, Annex A; tables 7.3, 7.4 and 10.93 checked on rendered pages)
- OMG version history: https://www.omg.org/spec/BPMN/ , https://www.omg.org/spec/BPMN/2.0/ , https://www.omg.org/spec/BPMN/2.0.1/ , https://www.omg.org/spec/BPMN/1.2/ , https://www.omg.org/spec/BPMN/1.1/ , https://www.omg.org/spec/BPMN/1.0/

**Secondary sources for cross-checking**

- Camunda BPMN reference: https://camunda.com/bpmn/reference/
- Camunda BPMN coverage: https://docs.camunda.io/docs/components/modeler/bpmn/bpmn-coverage/
- BPMN 2.0 Poster (Berliner BPM-Offensive, formerly bpmb.de/poster): https://bpm-conference.org/BPMNPoster , EN: https://bpm-conference.org/assets/docs/bpmn-poster/BPMN2_0_Poster_EN.pdf
- Trisotech BPMN Quick Guide, Intermediate Event: https://cloud.trisotech.com/bpmnquickguide/bpmn-quick-guide/intermediate-event.html
- Trisotech, BPMN Introduction and History: https://www.trisotech.com/bpmn-introduction-and-history/

**bpmn-js and ecosystem (source code)**

- bpmn-js 18.30.1, commit `6eaa6917b1a61f9fe527c7ac31ed0855204c1bec`: https://github.com/bpmn-io/bpmn-js . Files:
    - menus and palette: `lib/features/palette/PaletteProvider.js`, `lib/features/popup-menu/PopupEntries.js`, `lib/features/popup-menu/ReplaceMenuProvider.js`, `lib/features/replace/ReplaceOptions.js`, `lib/features/replace/BpmnReplace.js`, `lib/features/context-pad/ContextPadProvider.js`;
    - rules: `lib/features/rules/BpmnRules.js`;
    - behaviours in `lib/features/modeling/behavior/`: AttachEventBehavior, DetachEventBehavior, BoundaryEventBehavior, EventBasedGatewayBehavior, CompensateBoundaryEventBehavior, CreateDataObjectBehavior, CreateParticipantBehavior, DataStoreBehavior, GroupBehavior, NonInterruptingBehavior, ReplaceConnectionBehavior, ReplaceElementBehaviour, SubProcessStartEventBehavior, `util/NonInterruptingUtil.js`;
    - model and utilities: `lib/features/modeling/ElementFactory.js`, `lib/util/DiUtil.js`, `lib/util/ElementSizeUtil.js`, `lib/util/LabelUtil.js`;
    - rendering and import: `lib/draw/BpmnRenderer.js`, `lib/import/BpmnTreeWalker.js`;
    - other: `lib/features/keyboard/BpmnKeyboardBindings.js`, `lib/Modeler.js`, `CHANGELOG.md`, `test/spec/features/popup-menu/ReplaceMenuProviderSpec.js`
- UMD build used for the executed checks: https://unpkg.com/bpmn-js@18.30.1/dist/bpmn-modeler.development.js
- bpmn-js-create-append-anything 2.1.0: https://github.com/bpmn-io/bpmn-js-create-append-anything . Files: `lib/util/CreateOptionsUtil.js`, `lib/util/PopupMenuEntriesUtil.js`, `lib/create-append-anything/create-menu/CreateMenuProvider.js`, `…/create-menu/CreatePaletteProvider.js`, `…/append-menu/AppendMenuProvider.js`, `…/append-menu/AppendRules.js`, `…/append-menu/AppendContextPadProvider.js`, `…/keyboard-bindings/KeyboardBindings.js`, `CHANGELOG.md`
- bpmn-moddle 10.3.1: https://github.com/bpmn-io/bpmn-moddle . Files: `resources/bpmn/json/bpmn.json`, `resources/bpmn/json/bpmndi.json`
- diagram-js 15.27.3: https://github.com/bpmn-io/diagram-js . File: `lib/features/popup-menu/PopupMenuComponent.js`
- bpmnlint 11.14.0: https://github.com/bpmn-io/bpmnlint . Files: `config/recommended.js`, `config/correctness.js`, `config/all.js`, `docs/rules/*.md`, `rules/*.js`
- bpmn-js issues: https://github.com/bpmn-io/bpmn-js/issues/418 , https://github.com/bpmn-io/bpmn-js/issues/1171 , https://github.com/bpmn-io/bpmn-js/issues/194 , https://github.com/bpmn-io/bpmn-js/issues/1090
- chor-js: https://github.com/bptlab/chor-js
- demo.bpmn.io (UI strings checked in the bundle): https://demo.bpmn.io/new , https://demo.bpmn.io/bpmn/app.js
- Context7, library `/bpmn-io/bpmn-js` (documentation and excerpts of `PopupEntries.js`, `PaletteProvider.js`; consistent with the source)

---

## 14. Discrepancies between sources and unverified points

1. **ISO/IEC 19510:2013 and the BPMN version.** The OMG page for 2.0.1 says "formally published by ISO as the 2013 edition standard: ISO/IEC 19510". Trisotech writes that ISO published 2.0.2. OMG (2.0.1) is taken as correct. iso.org returned 403 and was not checked.
2. **BPMN 2.0 date.** OMG says "December 2010" (formal/11-01-03); many sources say January 2011. **BPMN 1.0:** BPMI.org, May 2004 (Trisotech); the OMG page says March 2007.
3. **Event Sub-Process start triggers.** The text of §10.3.5 lists "Message, Error, Escalation, Compensation, Conditional, Signal, and Multiple", without Timer and Parallel Multiple. Table 10.86, table 10.93, the BPMB poster and Camunda include **Timer** and **Parallel Multiple**. Decision: 9 types, per the tables.
4. **Compensation Start Event in an Event Sub-Process.** Table 10.93 puts it in the "Interrupting" column. The text of tables 10.86 and 10.87 says it does not interrupt and `isInterrupting` does not apply. Camunda lists it as "Interrupting only". The drawing (solid border) is the same everywhere.
5. **Typo in table 7.2 of the specification.** For sequential multi-instance it says "three vertical lines". Normative §10.3.8: parallel is vertical, sequential is horizontal. Decision: per §10.3.8.
6. **Compensation class name.** The specification text says `CompensationEventDefinition`; the XSD and bpmn-moddle use `compensateEventDefinition` / `bpmn:CompensateEventDefinition`. XML and code use **Compensate**.
7. **`isUnlimited` on Data Store.** Table 10.55 of the specification gives `= false`; bpmn-moddle defaults to `true`. No default was found in the specification's XSD fragment (unverified).
8. **Trisotech Quick Guide** shows "Catch - Escalation Intermediate Event" in normal flow. Tables 10.89 and 10.93 and the BPMB poster have **no** escalation catch in normal flow. Decision: per the specification.
9. **Fork / implicit split.** Table 7.2 of the specification calls several unconditional outgoing flows the "preferred method for most situations". bpmnlint (`no-implicit-split`, error) and common practice require an explicit gateway. Recommendation for Coframe: use the bpmnlint rule as a best practice and say it is not a violation of the standard.
10. **`single-event-definition` (bpmnlint recommended)** forbids Multiple and Parallel Multiple, which are valid in the specification. **`start-event-required` and `end-event-required`** are stricter than the specification.
11. **bpmn-js:** items 1–3 of §11.9 were checked by execution in the 18.30.1 build. The result of the replacement in item 2 (the final event type after choosing an entry) was derived from the code and not executed separately. The import behaviour for Conversation diagrams was derived from the `BpmnTreeWalker` code and not run.
12. **demo.bpmn.io.** The presence of the create/append module was confirmed by strings in the bundle. The exact bpmn-js version of the demo was not checked.
13. **bpmn-js-properties-panel** was not researched. "No UI" statements in §11 refer to bpmn-js core and the create/append module (unverified for the properties panel).
14. **Data states.** §10.4.1 says both "Data Objects cannot specify states" and, in its "States" subsection, "Data Object elements can optionally reference a DataState element". The metamodel (`ItemAwareElement.dataState`) allows both. Decision: states are shown on Data Object References.
15. **Group label separator.** Table 8.21: the Category name and the CategoryValue value are "separated by delineator "."". The Category description in §8.4.1: "optionally prepended by the Category name and delineator ":"". There is no normative choice.
16. **bpmnlint `ad-hoc-sub-process`.** `docs/rules/ad-hoc-sub-process.md` describes two checks (no Start or End; every intermediate catch event has an outgoing flow). `rules/ad-hoc-sub-process.js` (11.14.0) implements only the first.
