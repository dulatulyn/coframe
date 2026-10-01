from __future__ import annotations

from app.ai.checks import Finding
from app.ai.graph import Graph, Node


def _node_line(node: Node) -> str:
    details = [node.kind]
    if node.event:
        details.append(f"{node.event} trigger")
    if node.attached_to:
        details.append(f"attached to {node.attached_to}")
        if node.interrupting is False:
            details.append("non-interrupting")
    if node.loop:
        details.append(f"{node.loop} loop")
    if node.triggered_by_event:
        details.append("event sub-process")
    if node.kind in {"subProcess", "transaction", "adHocSubProcess"} and not node.expanded:
        details.append("collapsed")
    name = f' "{node.name}"' if node.name else " (no name)"
    return f"- {node.id} [{', '.join(details)}]{name}"


def describe(graph: Graph, findings: list[Finding] | None = None) -> str:
    lines: list[str] = []
    placed: set[str] = set()

    def render_container(container: str, indent: str) -> None:
        members = [n for n in graph.in_container(container) if n.kind != "textAnnotation"]
        lanes = [lane for lane in graph.lanes.values() if lane.process == container and lane.parent is None]
        if lanes:
            for lane in lanes:
                render_lane(lane.id, container, indent)
        for node in members:
            if node.id not in placed:
                placed.add(node.id)
                lines.append(f"{indent}{_node_line(node)}")
                if node.kind in {"subProcess", "transaction", "adHocSubProcess"}:
                    render_container(node.id, indent + "    ")

    def render_lane(lane_id: str, container: str, indent: str) -> None:
        lane = graph.lanes[lane_id]
        lines.append(f'{indent}Lane {lane.id} "{lane.name or "(no name)"}":')
        children = [child for child in graph.lanes.values() if child.parent == lane_id]
        for child in children:
            render_lane(child.id, container, indent + "  ")
        for member in lane.members:
            node = graph.nodes.get(member)
            if node and node.container == container and node.id not in placed and node.lane == lane_id:
                placed.add(node.id)
                lines.append(f"{indent}  {_node_line(node)}")
                if node.kind in {"subProcess", "transaction", "adHocSubProcess"}:
                    render_container(node.id, indent + "      ")

    processes = [cid for cid, kind in graph.containers.items() if kind == "process"]
    pooled = {pool.process for pool in graph.pools.values() if pool.process}
    for pool in graph.pools.values():
        if pool.process:
            lines.append(f'Pool {pool.id} "{pool.name or "(no name)"}" (process {pool.process}):')
            render_container(pool.process, "  ")
        else:
            lines.append(f'Pool {pool.id} "{pool.name or "(no name)"}" (black box, no internal process)')
    for process in processes:
        if process not in pooled:
            lines.append(f"Process {process}:")
            render_container(process, "  ")

    sequence = graph.sequence()
    if sequence:
        lines.append("")
        lines.append("Sequence flows:")
        for flow in sequence:
            extra = []
            if flow.name:
                extra.append(f'label "{flow.name}"')
            if flow.condition:
                extra.append(f"condition `{flow.condition}`")
            if flow.is_default:
                extra.append("default")
            suffix = f" ({'; '.join(extra)})" if extra else ""
            lines.append(f"- {flow.id}: {flow.source} -> {flow.target}{suffix}")

    others = [f for f in graph.flows.values() if f.kind != "sequence"]
    if others:
        lines.append("")
        lines.append("Other connections:")
        for flow in others:
            label = f' "{flow.name}"' if flow.name else ""
            lines.append(f"- {flow.kind}: {flow.source} -> {flow.target}{label}")

    annotations = [n for n in graph.nodes.values() if n.kind == "textAnnotation"]
    if annotations:
        lines.append("")
        lines.append("Text annotations:")
        lines.extend(f'- {n.id}: "{n.name}"' for n in annotations)

    if findings is not None:
        lines.append("")
        lines.append("Automated checks (exact, computed from the model):")
        if not findings:
            lines.append("- no problems found")
        for finding in findings:
            where = f" [{', '.join(finding.elements)}]" if finding.elements else ""
            lines.append(f"- {finding.severity} {finding.rule}: {finding.message}{where}")
    return "\n".join(lines)
