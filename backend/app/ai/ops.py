from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.ai.graph import ACTIVITIES, EVENTS, GATEWAYS, Graph

OpKind = Literal["add", "insert", "connect", "rename", "retype", "remove", "set_default", "label_flow"]

TASK_TYPES = {
    "bpmn:Task",
    "bpmn:UserTask",
    "bpmn:ServiceTask",
    "bpmn:SendTask",
    "bpmn:ReceiveTask",
    "bpmn:ManualTask",
    "bpmn:BusinessRuleTask",
    "bpmn:ScriptTask",
    "bpmn:CallActivity",
    "bpmn:SubProcess",
}
EVENT_TYPES = {
    "bpmn:StartEvent",
    "bpmn:EndEvent",
    "bpmn:IntermediateCatchEvent",
    "bpmn:IntermediateThrowEvent",
    "bpmn:BoundaryEvent",
}
GATEWAY_TYPES = {
    "bpmn:ExclusiveGateway",
    "bpmn:ParallelGateway",
    "bpmn:InclusiveGateway",
    "bpmn:EventBasedGateway",
}
OTHER_TYPES = {"bpmn:DataObjectReference", "bpmn:DataStoreReference", "bpmn:TextAnnotation"}
ALLOWED_TYPES = TASK_TYPES | EVENT_TYPES | GATEWAY_TYPES | OTHER_TYPES
EVENT_DEFINITIONS = {
    "message",
    "timer",
    "error",
    "escalation",
    "signal",
    "conditional",
    "compensate",
    "link",
    "terminate",
    "cancel",
}


class Op(BaseModel):
    op: OpKind = Field(description="The kind of change.")
    ref: str | None = Field(
        default=None, description="add: a new temporary id for the created element, e.g. new1."
    )
    type: str | None = Field(
        default=None, description="add/retype: BPMN type such as bpmn:UserTask or bpmn:ExclusiveGateway."
    )
    event: str | None = Field(
        default=None,
        description="add/retype of events: trigger such as message, timer, error; omit for none.",
    )
    name: str | None = Field(default=None, description="add/rename/label_flow: the label text.")
    after: str | None = Field(
        default=None,
        description="add: id of the element the new one follows; it is placed and connected after it.",
    )
    attach_to: str | None = Field(default=None, description="add of a bpmn:BoundaryEvent: the activity id.")
    source: str | None = Field(default=None, description="connect: id of the source element.")
    target: str | None = Field(default=None, description="connect: id of the target element.")
    element: str | None = Field(
        default=None, description="rename/retype/remove/set_default: id of the element to change."
    )
    flow: str | None = Field(
        default=None, description="insert/set_default/label_flow: id of the sequence flow."
    )


def _family(type_name: str) -> str:
    if type_name in TASK_TYPES:
        return "activity"
    if type_name in EVENT_TYPES:
        return "event"
    if type_name in GATEWAY_TYPES:
        return "gateway"
    return "other"


def _node_family(kind: str) -> str:
    if kind in ACTIVITIES:
        return "activity"
    if kind in EVENTS:
        return "event"
    if kind in GATEWAYS:
        return "gateway"
    return "other"


class InvalidOps(ValueError):
    pass


def validate_ops(ops: list[Op], graph: Graph) -> list[Op]:
    nodes = dict(graph.nodes)
    flows = {f.id: f for f in graph.flows.values()}
    renamable = set(nodes) | set(flows) | set(graph.pools) | set(graph.lanes)
    created: dict[str, str] = {}

    def node_or_ref(value: str | None, what: str) -> str:
        if not value:
            raise InvalidOps(f"{what} is missing")
        if value not in nodes and value not in created:
            raise InvalidOps(f"{what} {value} does not exist")
        return value

    for index, op in enumerate(ops):
        where = f"op {index + 1} ({op.op})"
        if op.op == "add":
            if not op.ref or op.ref in nodes or op.ref in flows or op.ref in created:
                raise InvalidOps(f"{where}: needs a new unique ref")
            if op.type not in ALLOWED_TYPES:
                raise InvalidOps(f"{where}: type {op.type} is not allowed")
            if op.event and (op.type not in EVENT_TYPES or op.event not in EVENT_DEFINITIONS):
                raise InvalidOps(f"{where}: event {op.event} does not fit {op.type}")
            if op.type == "bpmn:BoundaryEvent":
                host = node_or_ref(op.attach_to, f"{where}: attach_to")
                if host in nodes and nodes[host].kind not in ACTIVITIES:
                    raise InvalidOps(f"{where}: boundary events attach to activities only")
            if op.after:
                node_or_ref(op.after, f"{where}: after")
            created[op.ref] = op.type
        elif op.op == "insert":
            if not op.ref or op.ref in nodes or op.ref in flows or op.ref in created:
                raise InvalidOps(f"{where}: needs a new unique ref")
            if op.type not in TASK_TYPES | GATEWAY_TYPES | {
                "bpmn:IntermediateCatchEvent",
                "bpmn:IntermediateThrowEvent",
            }:
                raise InvalidOps(f"{where}: {op.type} cannot be inserted into a flow")
            if op.event and op.event not in EVENT_DEFINITIONS:
                raise InvalidOps(f"{where}: unknown event {op.event}")
            flow = flows.get(op.flow or "")
            if not flow or flow.kind != "sequence":
                raise InvalidOps(f"{where}: flow {op.flow} is not a sequence flow")
            created[op.ref] = op.type
        elif op.op == "connect":
            source = node_or_ref(op.source, f"{where}: source")
            target = node_or_ref(op.target, f"{where}: target")
            if source == target:
                raise InvalidOps(f"{where}: cannot connect an element to itself")
        elif op.op == "rename":
            if not op.element or (op.element not in renamable and op.element not in created):
                raise InvalidOps(f"{where}: element {op.element} does not exist")
            if not op.name or len(op.name) > 200:
                raise InvalidOps(f"{where}: needs a name")
        elif op.op == "retype":
            target = node_or_ref(op.element, f"{where}: element")
            if op.type not in ALLOWED_TYPES:
                raise InvalidOps(f"{where}: type {op.type} is not allowed")
            current = _node_family(nodes[target].kind) if target in nodes else _family(created[target])
            if current != _family(op.type):
                raise InvalidOps(f"{where}: cannot turn a {current} into {op.type}")
            if op.event and op.event not in EVENT_DEFINITIONS:
                raise InvalidOps(f"{where}: unknown event {op.event}")
        elif op.op == "remove":
            if not op.element or (op.element not in nodes and op.element not in flows):
                raise InvalidOps(f"{where}: element {op.element} does not exist")
        elif op.op == "set_default":
            gateway = node_or_ref(op.element, f"{where}: element")
            if (
                gateway in nodes
                and nodes[gateway].kind
                not in {"exclusiveGateway", "inclusiveGateway", "complexGateway"} | ACTIVITIES
            ):
                raise InvalidOps(f"{where}: only decisions and activities have default flows")
            flow = flows.get(op.flow or "")
            if not flow or flow.source != gateway:
                raise InvalidOps(f"{where}: flow {op.flow} does not leave {gateway}")
        elif op.op == "label_flow":
            if not op.flow or op.flow not in flows:
                raise InvalidOps(f"{where}: flow {op.flow} does not exist")
            if not op.name:
                raise InvalidOps(f"{where}: needs a name")
    return ops
