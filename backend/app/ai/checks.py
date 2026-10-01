from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from typing import Literal

from app.ai.graph import ACTIVITIES, CONTAINERS, EVENTS, GATEWAYS, Graph, Node

Severity = Literal["error", "warning", "info"]
SEVERITY_ORDER = {"error": 0, "warning": 1, "info": 2}
SPLITTING = {"exclusiveGateway", "inclusiveGateway", "complexGateway"}


@dataclass
class Finding:
    rule: str
    severity: Severity
    message: str
    elements: list[str] = field(default_factory=list)


def _name(node: Node) -> str:
    return node.label


def _scopes(graph: Graph) -> list[str]:
    scopes = []
    for container_id, kind in graph.containers.items():
        if kind == "process":
            scopes.append(container_id)
        elif container_id in graph.nodes:
            node = graph.nodes[container_id]
            if node.expanded and node.kind != "adHocSubProcess":
                scopes.append(container_id)
    return scopes


def _flow_nodes(graph: Graph, scope: str) -> list[Node]:
    return [n for n in graph.in_container(scope) if n.is_flow_node]


def _successors(graph: Graph, node: Node) -> list[str]:
    targets = [graph.flows[f].target for f in node.outgoing if f in graph.flows]
    targets += [n.id for n in graph.nodes.values() if n.attached_to == node.id]
    return [t for t in targets if t in graph.nodes]


def _predecessors(graph: Graph, node: Node) -> list[str]:
    return [
        graph.flows[f].source
        for f in node.incoming
        if f in graph.flows and graph.flows[f].source in graph.nodes
    ]


def _entry_points(graph: Graph, scope: str) -> list[Node]:
    nodes = _flow_nodes(graph, scope)
    entries = [n for n in nodes if n.kind == "startEvent"]
    if not entries:
        entries = [n for n in nodes if not n.incoming and n.kind != "boundaryEvent"]
    return entries


def _reachable(graph: Graph, starts: list[str]) -> set[str]:
    seen = set(starts)
    queue = deque(starts)
    while queue:
        for nxt in _successors(graph, graph.nodes[queue.popleft()]):
            if nxt not in seen:
                seen.add(nxt)
                queue.append(nxt)
    return seen


def _reaches_end(graph: Graph, scope_nodes: list[Node]) -> set[str]:
    good = {
        n.id for n in scope_nodes if n.kind == "endEvent" or (not n.outgoing and n.kind != "boundaryEvent")
    }
    changed = True
    while changed:
        changed = False
        for node in scope_nodes:
            if node.id in good:
                continue
            if any(nxt in good for nxt in _successors(graph, node)):
                good.add(node.id)
                changed = True
    return good


def _branch_origin(graph: Graph, flow_id: str) -> tuple[str | None, str | None]:
    flow = graph.flows.get(flow_id)
    seen: set[str] = set()
    while flow is not None and flow.source in graph.nodes and flow.source not in seen:
        source = graph.nodes[flow.source]
        seen.add(source.id)
        if len(source.outgoing) > 1:
            return source.id, flow.id
        if len(source.incoming) != 1:
            return None, None
        flow = graph.flows.get(source.incoming[0])
    return None, None


def run_checks(graph: Graph) -> list[Finding]:
    findings: list[Finding] = []

    def add(rule: str, severity: Severity, message: str, *elements: str) -> None:
        findings.append(Finding(rule, severity, message, [e for e in elements if e]))

    scopes = _scopes(graph)
    for scope in scopes:
        nodes = _flow_nodes(graph, scope)
        if not nodes:
            continue
        scope_node = graph.nodes.get(scope)
        where = f"sub-process {_name(scope_node)}" if scope_node else "the process"
        starts = [n for n in nodes if n.kind == "startEvent"]
        ends = [n for n in nodes if n.kind == "endEvent"]
        if not starts and not (scope_node and scope_node.triggered_by_event):
            add("start-event-required", "error", f"There is no start event in {where}.", scope)
        if not ends:
            add("end-event-required", "error", f"There is no end event in {where}.", scope)

        blank_starts = [n for n in starts if n.event is None]
        if len(blank_starts) > 1:
            add(
                "single-blank-start-event",
                "warning",
                f"{where.capitalize()} has {len(blank_starts)} start events without a trigger; it is unclear which one starts it.",
                *[n.id for n in blank_starts],
            )
        if scope_node and not scope_node.triggered_by_event:
            for start in starts:
                if start.event is not None:
                    add(
                        "sub-process-blank-start-event",
                        "error",
                        f"The start event {_name(start)} of a sub-process must not have a trigger ({start.event}).",
                        start.id,
                    )
        if scope_node and scope_node.triggered_by_event:
            for start in starts:
                if start.event is None:
                    add(
                        "event-sub-process-typed-start",
                        "error",
                        f"The event sub-process {_name(scope_node)} needs a start event with a trigger (message, timer, error…).",
                        start.id,
                    )

        reachable = _reachable(graph, [n.id for n in _entry_points(graph, scope)])
        event_subprocess_nodes = {
            n.id
            for n in graph.nodes.values()
            if n.container in graph.nodes and graph.nodes[n.container].triggered_by_event
        }
        for node in nodes:
            if node.id in event_subprocess_nodes or (node.kind in CONTAINERS and node.triggered_by_event):
                continue
            if node.kind == "boundaryEvent":
                continue
            if not node.incoming and not node.outgoing:
                if len(nodes) > 1:
                    add("no-disconnected", "error", f"{_name(node)} is not connected to the flow.", node.id)
                continue
            if node.id not in reachable:
                add(
                    "unreachable",
                    "warning",
                    f"{_name(node)} can never be reached from a start event.",
                    node.id,
                )

        to_end = _reaches_end(graph, nodes)
        for node in nodes:
            if node.kind in CONTAINERS and node.triggered_by_event:
                continue
            if node.kind not in {"endEvent", "boundaryEvent"} and not node.outgoing and node.incoming:
                add(
                    "no-implicit-end",
                    "warning",
                    f"The flow stops after {_name(node)} without an end event.",
                    node.id,
                )
            elif node.id not in to_end and node.outgoing and node.id in reachable:
                add(
                    "no-end-reachable",
                    "warning",
                    f"From {_name(node)} the process can never reach an end event (endless loop).",
                    node.id,
                )

    for node in graph.nodes.values():
        if not node.is_flow_node:
            continue
        outgoing = [graph.flows[f] for f in node.outgoing if f in graph.flows]
        incoming = [graph.flows[f] for f in node.incoming if f in graph.flows]

        if node.kind == "startEvent" and incoming:
            add(
                "start-event-incoming",
                "error",
                f"The start event {_name(node)} has incoming sequence flows.",
                node.id,
            )
        if node.kind == "endEvent" and outgoing:
            add(
                "end-event-outgoing",
                "error",
                f"The end event {_name(node)} has outgoing sequence flows.",
                node.id,
            )
        if node.kind == "boundaryEvent" and not outgoing and node.event != "compensate":
            add(
                "boundary-event-outgoing",
                "warning",
                f"The boundary event {_name(node)} has no outgoing flow, so nothing happens when it fires.",
                node.id,
            )

        if node.kind in ACTIVITIES | EVENTS and node.kind != "boundaryEvent":
            plain = [f for f in outgoing if not f.condition and not f.is_default]
            if len(outgoing) > 1 and len(plain) > 1:
                add(
                    "no-implicit-split",
                    "warning",
                    f"{_name(node)} has {len(outgoing)} outgoing flows without a gateway. Use a parallel or exclusive gateway to make the split explicit.",
                    node.id,
                )
            if len(incoming) > 1 and node.kind in ACTIVITIES:
                add(
                    "fake-join",
                    "warning",
                    f"{_name(node)} has {len(incoming)} incoming flows without a gateway. Add a gateway to state whether the paths are merged or synchronized.",
                    node.id,
                )

        if node.kind in GATEWAYS:
            if len(incoming) > 1 and len(outgoing) > 1:
                add(
                    "no-gateway-join-fork",
                    "warning",
                    f"The gateway {_name(node)} both joins and splits; use two gateways to keep the meaning clear.",
                    node.id,
                )
            if len(incoming) <= 1 and len(outgoing) <= 1 and node.kind != "eventBasedGateway":
                add(
                    "superfluous-gateway",
                    "warning",
                    f"The gateway {_name(node)} neither splits nor joins.",
                    node.id,
                )
            if node.kind in SPLITTING and len(outgoing) > 1:
                unnamed = [f for f in outgoing if not f.name and not f.condition and not f.is_default]
                if unnamed:
                    add(
                        "unlabeled-branch",
                        "warning",
                        f"The decision {_name(node)} has {len(unnamed)} outgoing flow(s) without a condition or label.",
                        node.id,
                        *[f.id for f in unnamed],
                    )
                if not any(f.is_default for f in outgoing) and node.kind == "exclusiveGateway":
                    add(
                        "missing-default-flow",
                        "info",
                        f"The decision {_name(node)} has no default flow; if no condition matches, the process gets stuck.",
                        node.id,
                    )
                if not node.name:
                    add(
                        "label-required",
                        "warning",
                        "A splitting decision gateway should be labeled with its question.",
                        node.id,
                    )
            if node.kind == "eventBasedGateway":
                for flow in outgoing:
                    target = graph.nodes.get(flow.target)
                    if target and not (
                        target.kind == "receiveTask"
                        or (target.kind == "intermediateCatchEvent" and target.event)
                    ):
                        add(
                            "event-based-gateway-target",
                            "error",
                            f"An event-based gateway can only lead to catching events or receive tasks, not to {_name(target)}.",
                            node.id,
                            target.id,
                        )
            if node.kind == "complexGateway":
                add(
                    "no-complex-gateway",
                    "info",
                    f"The complex gateway {_name(node)} is hard to read; prefer simpler gateways.",
                    node.id,
                )

        if node.kind in ACTIVITIES and not node.name:
            add("label-required", "warning", f"A {node.kind} has no name.", node.id)
        if node.kind in {"startEvent", "endEvent"} and not node.name and node.container in graph.containers:
            add(
                "label-required",
                "info",
                "Name start and end events with the state they represent, e.g. “Order received”.",
                node.id,
            )

    seen_pairs: dict[tuple[str, str], str] = {}
    for flow in graph.sequence():
        pair = (flow.source, flow.target)
        if pair in seen_pairs:
            add(
                "no-duplicate-sequence-flows",
                "warning",
                "Two sequence flows connect the same elements.",
                seen_pairs[pair],
                flow.id,
            )
        seen_pairs[pair] = flow.id
        source, target = graph.nodes.get(flow.source), graph.nodes.get(flow.target)
        if source and target and source.pool and target.pool and source.pool != target.pool:
            add(
                "sequence-flow-across-pools",
                "error",
                "A sequence flow crosses pools; use a message flow between pools.",
                flow.id,
            )

    for flow in (f for f in graph.flows.values() if f.kind == "message"):
        source_pool = graph.nodes[flow.source].pool if flow.source in graph.nodes else flow.source
        target_pool = graph.nodes[flow.target].pool if flow.target in graph.nodes else flow.target
        if source_pool and source_pool == target_pool:
            add(
                "message-flow-same-pool",
                "error",
                "A message flow connects elements inside the same pool; use a sequence flow instead.",
                flow.id,
            )

    for gateway in (
        n for n in graph.nodes.values() if n.kind in GATEWAYS | ACTIVITIES and len(n.incoming) > 1
    ):
        origins: dict[str, list[str]] = {}
        for flow_id in gateway.incoming:
            origin, _ = _branch_origin(graph, flow_id)
            if origin:
                origins.setdefault(origin, []).append(flow_id)
        for origin_id, flows in origins.items():
            if len(flows) < 2:
                continue
            origin = graph.nodes[origin_id]
            if gateway.kind == "parallelGateway" and origin.kind in {"exclusiveGateway", "eventBasedGateway"}:
                add(
                    "deadlock",
                    "error",
                    f"Deadlock: the parallel gateway {_name(gateway)} waits for all branches, but {_name(origin)} takes only one of them.",
                    gateway.id,
                    origin.id,
                )
            elif gateway.kind in {"exclusiveGateway"} | ACTIVITIES and origin.kind == "parallelGateway":
                add(
                    "lack-of-synchronization",
                    "warning",
                    f"Branches started in parallel at {_name(origin)} merge at {_name(gateway)} without waiting for each other, so the steps after it run more than once.",
                    gateway.id,
                    origin.id,
                )

    links: dict[str, dict[str, list[str]]] = {}
    for node in graph.nodes.values():
        if node.event == "link":
            role = "throw" if node.kind == "intermediateThrowEvent" else "catch"
            links.setdefault(node.name, {"throw": [], "catch": []})[role].append(node.id)
    for name, roles in links.items():
        if roles["throw"] and not roles["catch"]:
            add("link-event", "error", f'The link "{name}" is thrown but never caught.', *roles["throw"])
        if roles["catch"] and not roles["throw"]:
            add("link-event", "warning", f'The link "{name}" is caught but never thrown.', *roles["catch"])

    for pool in graph.pools.values():
        if pool.process and not any(n.pool == pool.id and n.is_flow_node for n in graph.nodes.values()):
            add("empty-pool", "info", f'The pool "{pool.name or pool.id}" is empty.', pool.id)
        if not pool.name:
            add("label-required", "warning", "A pool has no name.", pool.id)
    for lane in graph.lanes.values():
        if not lane.name:
            add("label-required", "info", "A lane has no name.", lane.id)

    unique: dict[tuple[str, tuple[str, ...]], Finding] = {}
    for finding in findings:
        unique.setdefault((finding.rule, tuple(finding.elements)), finding)
    return sorted(unique.values(), key=lambda f: (SEVERITY_ORDER[f.severity], f.rule))
