from __future__ import annotations

import copy
from dataclasses import dataclass, field

from app.ai.checks import Finding, run_checks
from app.ai.graph import Flow, Graph, Node
from app.ai.ops import Op


def _kind(type_name: str) -> str:
    local = type_name.split(":", 1)[-1]
    return local[:1].lower() + local[1:]


def _rebuild_links(graph: Graph) -> None:
    for node in graph.nodes.values():
        node.incoming, node.outgoing = [], []
    for flow in graph.flows.values():
        if flow.kind != "sequence":
            continue
        if flow.source in graph.nodes:
            graph.nodes[flow.source].outgoing.append(flow.id)
        if flow.target in graph.nodes:
            graph.nodes[flow.target].incoming.append(flow.id)
        source = graph.nodes.get(flow.source)
        flow.is_default = bool(source and source.default_flow == flow.id)


def apply(graph: Graph, ops: list[Op]) -> Graph:
    result = copy.deepcopy(graph)
    counter = 0

    def new_flow(source: str, target: str) -> None:
        nonlocal counter
        counter += 1
        a, b = result.nodes.get(source), result.nodes.get(target)
        kind = "message" if a and b and a.pool != b.pool else "sequence"
        result.flows[f"__sim_{counter}"] = Flow(f"__sim_{counter}", kind, source, target)

    def add_node(op: Op, anchor: Node | None) -> Node:
        node = Node(
            id=op.ref or f"__sim_node_{len(result.nodes)}",
            kind=_kind(op.type or "bpmn:Task"),
            name=op.name or "",
            container=anchor.container if anchor else next(iter(result.containers), ""),
            pool=anchor.pool if anchor else None,
            lane=anchor.lane if anchor else None,
            event=op.event,
        )
        if node.kind == "boundaryEvent":
            node.attached_to = op.attach_to
            node.interrupting = True
        result.nodes[node.id] = node
        if node.lane and node.lane in result.lanes:
            result.lanes[node.lane].members.append(node.id)
        return node

    for op in ops:
        if op.op == "add":
            anchor = result.nodes.get(op.after or op.attach_to or "")
            node = add_node(op, anchor)
            if op.after and op.after in result.nodes:
                new_flow(op.after, node.id)
        elif op.op == "insert":
            flow = result.flows.pop(op.flow or "", None)
            if flow is None:
                continue
            node = add_node(op, result.nodes.get(flow.source))
            new_flow(flow.source, node.id)
            new_flow(node.id, flow.target)
        elif op.op == "connect":
            new_flow(op.source or "", op.target or "")
        elif op.op == "rename":
            target = op.element or ""
            if target in result.nodes:
                result.nodes[target].name = op.name or ""
            elif target in result.flows:
                result.flows[target].name = op.name or ""
            elif target in result.pools:
                result.pools[target].name = op.name or ""
            elif target in result.lanes:
                result.lanes[target].name = op.name or ""
        elif op.op == "retype":
            node = result.nodes.get(op.element or "")
            if node:
                node.kind = _kind(op.type or "bpmn:Task")
                node.event = op.event
        elif op.op == "remove":
            target = op.element or ""
            if target in result.nodes:
                del result.nodes[target]
                for fid in [f.id for f in result.flows.values() if target in (f.source, f.target)]:
                    result.flows.pop(fid, None)
                for node in list(result.nodes.values()):
                    if node.attached_to == target:
                        del result.nodes[node.id]
            else:
                result.flows.pop(target, None)
        elif op.op == "set_default":
            node = result.nodes.get(op.element or "")
            if node:
                node.default_flow = op.flow
        elif op.op == "label_flow" and op.flow in result.flows:
            result.flows[op.flow].name = op.name or ""
    _rebuild_links(result)
    return result


def _key(finding: Finding) -> tuple[str, tuple[str, ...]]:
    return finding.rule, tuple(e for e in finding.elements if not e.startswith("__sim"))


@dataclass
class Outcome:
    resolves: list[Finding] = field(default_factory=list)
    introduces: list[Finding] = field(default_factory=list)

    @property
    def breaks_model(self) -> bool:
        return any(f.severity == "error" for f in self.introduces)


def evaluate(graph: Graph, before: list[Finding], ops: list[Op]) -> Outcome:
    after = run_checks(apply(graph, ops))
    before_keys = {_key(f) for f in before}
    after_keys = {_key(f) for f in after}
    return Outcome(
        resolves=[f for f in before if _key(f) not in after_keys],
        introduces=[f for f in after if _key(f) not in before_keys],
    )
