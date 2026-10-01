from __future__ import annotations

import re
from xml.sax.saxutils import escape, quoteattr

from app.ai.ops import EVENT_DEFINITIONS, EVENT_TYPES, GATEWAY_TYPES, TASK_TYPES
from app.ai.results import AiProcess

ID = re.compile(r"^[A-Za-z_][A-Za-z0-9_.-]{0,63}$")
ALLOWED = TASK_TYPES | EVENT_TYPES | GATEWAY_TYPES


class InvalidProcess(ValueError):
    pass


def _definition(event: str | None, element_id: str) -> str:
    if not event:
        return ""
    if event not in EVENT_DEFINITIONS:
        raise InvalidProcess(f"unknown event {event}")
    return f'<bpmn:{event}EventDefinition id="{element_id}_{event}"/>'


def process_xml(process: AiProcess) -> str:
    ids: set[str] = set()
    for item in [*process.nodes, *process.flows]:
        if not ID.match(item.id) or item.id in ids:
            raise InvalidProcess(f"bad or duplicate id {item.id}")
        ids.add(item.id)
    nodes = {n.id: n for n in process.nodes}
    for node in process.nodes:
        if node.type not in ALLOWED:
            raise InvalidProcess(f"type {node.type} is not allowed")
        if node.type == "bpmn:BoundaryEvent" and (
            node.attach_to not in nodes or nodes[node.attach_to].type not in TASK_TYPES
        ):
            raise InvalidProcess(f"boundary event {node.id} needs an activity")
    for flow in process.flows:
        if flow.source not in nodes or flow.target not in nodes:
            raise InvalidProcess(f"flow {flow.id} connects unknown elements")

    defaults = {flow.source: flow.id for flow in process.flows if flow.default}
    incoming: dict[str, list[str]] = {}
    outgoing: dict[str, list[str]] = {}
    for flow in process.flows:
        outgoing.setdefault(flow.source, []).append(flow.id)
        incoming.setdefault(flow.target, []).append(flow.id)
    parts = []
    for node in process.nodes:
        tag = node.type.split(":", 1)[1]
        tag = tag[:1].lower() + tag[1:]
        attrs = f" id={quoteattr(node.id)} name={quoteattr(node.name)}"
        if node.type == "bpmn:BoundaryEvent":
            attrs += f" attachedToRef={quoteattr(node.attach_to or '')}"
        if node.id in defaults and node.type in GATEWAY_TYPES | TASK_TYPES:
            attrs += f" default={quoteattr(defaults[node.id])}"
        body = "".join(f"<bpmn:incoming>{escape(f)}</bpmn:incoming>" for f in incoming.get(node.id, []))
        body += "".join(f"<bpmn:outgoing>{escape(f)}</bpmn:outgoing>" for f in outgoing.get(node.id, []))
        if node.type in EVENT_TYPES:
            body += _definition(node.event, node.id)
        parts.append(f"<bpmn:{tag}{attrs}>{body}</bpmn:{tag}>" if body else f"<bpmn:{tag}{attrs}/>")
    for flow in process.flows:
        label = f" name={quoteattr(flow.name)}" if flow.name else ""
        parts.append(
            f"<bpmn:sequenceFlow id={quoteattr(flow.id)} sourceRef={quoteattr(flow.source)} "
            f"targetRef={quoteattr(flow.target)}{label}/>"
        )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" '
        'xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" '
        'xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" '
        'xmlns:di="http://www.omg.org/spec/DD/20100524/DI" '
        'id="Definitions_generated" targetNamespace="http://bpmn.io/schema/bpmn">'
        f'<bpmn:process id="Process_generated" name={quoteattr(process.name)} isExecutable="false">'
        + "".join(parts)
        + "</bpmn:process></bpmn:definitions>"
    )


def outline(process: AiProcess) -> str:
    lines = [f"Diagram {escape(process.name)}"]
    lines += [f"- {n.id} [{n.type}{', ' + n.event if n.event else ''}] {n.name}" for n in process.nodes]
    lines += [f"- {f.id}: {f.source} -> {f.target}{' ' + f.name if f.name else ''}" for f in process.flows]
    return "\n".join(lines)
