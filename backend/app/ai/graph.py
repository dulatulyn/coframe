from __future__ import annotations

from dataclasses import dataclass, field

from lxml import etree

from app.bpmn.xmlsafe import BPMN_MODEL_NS, parse_bpmn

EVENTS = {"startEvent", "endEvent", "intermediateCatchEvent", "intermediateThrowEvent", "boundaryEvent"}
GATEWAYS = {"exclusiveGateway", "parallelGateway", "inclusiveGateway", "eventBasedGateway", "complexGateway"}
CONTAINERS = {"subProcess", "transaction", "adHocSubProcess"}
ACTIVITIES = {
    "task",
    "userTask",
    "serviceTask",
    "sendTask",
    "receiveTask",
    "manualTask",
    "businessRuleTask",
    "scriptTask",
    "callActivity",
} | CONTAINERS
DATA = {"dataObjectReference", "dataStoreReference", "dataInput", "dataOutput"}
ARTIFACTS = {"textAnnotation", "group"}
FLOW_NODES = EVENTS | GATEWAYS | ACTIVITIES


def _local(el: etree._Element) -> str:
    return etree.QName(el).localname


def _is_bpmn(el: etree._Element) -> bool:
    return isinstance(el.tag, str) and etree.QName(el).namespace == BPMN_MODEL_NS


def _children(el: etree._Element, *names: str) -> list[etree._Element]:
    return [c for c in el if _is_bpmn(c) and (not names or _local(c) in names)]


def _text(el: etree._Element | None) -> str:
    return " ".join("".join(el.itertext()).split()) if el is not None else ""


@dataclass
class Node:
    id: str
    kind: str
    name: str
    container: str
    pool: str | None = None
    lane: str | None = None
    event: str | None = None
    attached_to: str | None = None
    interrupting: bool | None = None
    triggered_by_event: bool = False
    expanded: bool = True
    loop: str | None = None
    default_flow: str | None = None
    incoming: list[str] = field(default_factory=list)
    outgoing: list[str] = field(default_factory=list)

    @property
    def is_flow_node(self) -> bool:
        return self.kind in FLOW_NODES

    @property
    def label(self) -> str:
        return f'"{self.name}"' if self.name else self.id


@dataclass
class Flow:
    id: str
    kind: str
    source: str
    target: str
    name: str = ""
    condition: str = ""
    is_default: bool = False


@dataclass
class Pool:
    id: str
    name: str
    process: str | None


@dataclass
class Lane:
    id: str
    name: str
    process: str
    parent: str | None
    members: list[str] = field(default_factory=list)


@dataclass
class Graph:
    nodes: dict[str, Node] = field(default_factory=dict)
    flows: dict[str, Flow] = field(default_factory=dict)
    pools: dict[str, Pool] = field(default_factory=dict)
    lanes: dict[str, Lane] = field(default_factory=dict)
    containers: dict[str, str] = field(default_factory=dict)

    def sequence(self) -> list[Flow]:
        return [f for f in self.flows.values() if f.kind == "sequence"]

    def in_container(self, container: str) -> list[Node]:
        return [n for n in self.nodes.values() if n.container == container]


def _event_kind(el: etree._Element) -> str | None:
    definitions = [
        _local(c).removesuffix("EventDefinition")
        for c in el
        if _is_bpmn(c) and _local(c).endswith("EventDefinition")
    ]
    if not definitions:
        return None
    return definitions[0] if len(definitions) == 1 else "multiple"


def _loop_kind(el: etree._Element) -> str | None:
    for child in _children(el):
        name = _local(child)
        if name == "standardLoopCharacteristics":
            return "loop"
        if name == "multiInstanceLoopCharacteristics":
            return "sequential" if child.get("isSequential") == "true" else "parallel"
    return None


def build_graph(xml: str | bytes) -> Graph:
    root = parse_bpmn(xml)
    graph = Graph()
    expanded = {
        el.get("bpmnElement"): el.get("isExpanded")
        for el in root.iter()
        if isinstance(el.tag, str) and _local(el) == "BPMNShape"
    }

    process_pool: dict[str, str] = {}
    for collaboration in _children(root, "collaboration"):
        for participant in _children(collaboration, "participant"):
            pid = participant.get("id", "")
            process = participant.get("processRef")
            graph.pools[pid] = Pool(pid, participant.get("name", "").strip(), process)
            if process:
                process_pool[process] = pid

    def visit(container_el: etree._Element, container_id: str, pool: str | None) -> None:
        graph.containers[container_id] = _local(container_el)
        for child in _children(container_el):
            kind = _local(child)
            cid = child.get("id")
            if not cid:
                continue
            if kind == "laneSet":
                visit_lanes(child, container_id, None)
                continue
            if kind == "sequenceFlow":
                condition = _text(next(iter(_children(child, "conditionExpression")), None))
                graph.flows[cid] = Flow(
                    cid,
                    "sequence",
                    child.get("sourceRef", ""),
                    child.get("targetRef", ""),
                    child.get("name", "").strip(),
                    condition,
                )
                continue
            if kind == "association":
                graph.flows[cid] = Flow(
                    cid, "association", child.get("sourceRef", ""), child.get("targetRef", "")
                )
                continue
            if kind not in FLOW_NODES | DATA | ARTIFACTS:
                continue
            node = Node(
                id=cid,
                kind=kind,
                name=(child.get("name") or _text(next(iter(_children(child, "text")), None))).strip(),
                container=container_id,
                pool=pool,
            )
            if kind in EVENTS:
                node.event = _event_kind(child)
            if kind == "boundaryEvent":
                node.attached_to = child.get("attachedToRef")
                node.interrupting = child.get("cancelActivity", "true") != "false"
            if kind == "startEvent":
                node.interrupting = child.get("isInterrupting", "true") != "false"
            if kind in ACTIVITIES:
                node.loop = _loop_kind(child)
            if kind in GATEWAYS | ACTIVITIES:
                node.default_flow = child.get("default")
            if kind in CONTAINERS:
                node.triggered_by_event = child.get("triggeredByEvent") == "true"
                node.expanded = expanded.get(cid) != "false"
            graph.nodes[cid] = node
            for association in _children(child, "dataInputAssociation", "dataOutputAssociation"):
                aid = association.get("id") or f"{cid}_{_local(association)}"
                sources = [_text(s) for s in _children(association, "sourceRef")]
                targets = [_text(t) for t in _children(association, "targetRef")]
                if _local(association) == "dataInputAssociation":
                    for source in sources:
                        graph.flows[f"{aid}:{source}"] = Flow(aid, "data_input", source, cid)
                else:
                    for target in targets:
                        graph.flows[f"{aid}:{target}"] = Flow(aid, "data_output", cid, target)
            if kind in CONTAINERS:
                visit(child, cid, pool)

    def visit_lanes(lane_set: etree._Element, process: str, parent: str | None) -> None:
        for lane in _children(lane_set, "lane"):
            lid = lane.get("id", "")
            members = [_text(ref) for ref in _children(lane, "flowNodeRef")]
            graph.lanes[lid] = Lane(lid, lane.get("name", "").strip(), process, parent, members)
            for child_set in _children(lane, "childLaneSet"):
                visit_lanes(child_set, process, lid)

    for process in _children(root, "process"):
        pid = process.get("id", "")
        visit(process, pid, process_pool.get(pid))

    for collaboration in _children(root, "collaboration"):
        for message_flow in _children(collaboration, "messageFlow"):
            mid = message_flow.get("id", "")
            graph.flows[mid] = Flow(
                mid,
                "message",
                message_flow.get("sourceRef", ""),
                message_flow.get("targetRef", ""),
                message_flow.get("name", "").strip(),
            )
        for association in _children(collaboration, "association"):
            aid = association.get("id", "")
            graph.flows[aid] = Flow(
                aid, "association", association.get("sourceRef", ""), association.get("targetRef", "")
            )
        for annotation in _children(collaboration, "textAnnotation"):
            tid = annotation.get("id", "")
            graph.nodes[tid] = Node(
                tid, "textAnnotation", _text(next(iter(_children(annotation, "text")), None)), ""
            )

    deepest: dict[str, tuple[int, str]] = {}

    def depth(lane_id: str) -> int:
        level, current = 0, graph.lanes[lane_id].parent
        while current:
            level += 1
            current = graph.lanes[current].parent if current in graph.lanes else None
        return level

    for lane in graph.lanes.values():
        for member in lane.members:
            level = depth(lane.id)
            if member not in deepest or level > deepest[member][0]:
                deepest[member] = (level, lane.id)
    for member, (_, lane_id) in deepest.items():
        if member in graph.nodes:
            graph.nodes[member].lane = lane_id

    for flow in graph.flows.values():
        if flow.kind != "sequence":
            continue
        if flow.source in graph.nodes:
            graph.nodes[flow.source].outgoing.append(flow.id)
            if graph.nodes[flow.source].default_flow == flow.id:
                flow.is_default = True
        if flow.target in graph.nodes:
            graph.nodes[flow.target].incoming.append(flow.id)
    return graph
