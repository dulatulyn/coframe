import re
from collections import deque
from dataclasses import dataclass

from app.ai.checks import Finding
from app.ai.graph import Graph, Node
from app.bpmn.dmn import Decision, DecisionOutput, describe_decision

ROUTING_GATEWAYS = {"exclusiveGateway", "inclusiveGateway"}
QUOTED = re.compile(r'"((?:[^"\\]|\\.)*)"')


@dataclass
class LinkedTable:
    diagram_id: str
    name: str
    decisions: list[Decision]


def normalize(text: str) -> str:
    return " ".join(text.strip().strip('"').strip("'").lower().split())


def branch_values(name: str, condition: str) -> set[str]:
    values = {normalize(name)} if name.strip() else set()
    values |= {normalize(v) for v in QUOTED.findall(condition)}
    return {v for v in values if v}


def pick_decision(task: Node, table: LinkedTable) -> Decision | None:
    if task.decision_ref:
        return next((d for d in table.decisions if d.id == task.decision_ref), None)
    usable = [d for d in table.decisions if d.outputs]
    if not usable:
        return None
    named = [d for d in usable if normalize(d.name) == normalize(task.name)]
    return (named or usable)[0]


def routing_gateway(graph: Graph, task: Node) -> Node | None:
    targets = [
        graph.nodes.get(f.target) for f in graph.sequence() if f.source == task.id and f.target in graph.nodes
    ]
    if len(targets) != 1 or targets[0] is None or targets[0].kind not in ROUTING_GATEWAYS:
        return None
    return targets[0]


def primary_output(decision: Decision) -> DecisionOutput | None:
    return next((o for o in decision.outputs if o.values), decision.outputs[0] if decision.outputs else None)


def required_chain(decision: Decision, table: LinkedTable, stop: set[str] | None = None) -> list[Decision]:
    by_id = {d.id: d for d in table.decisions}
    seen: set[str] = {decision.id}
    queue = deque(decision.requires)
    chain = []
    while queue:
        rid = queue.popleft()
        if rid in seen or rid not in by_id:
            continue
        seen.add(rid)
        chain.append(by_id[rid])
        if stop is None or rid not in stop:
            queue.extend(by_id[rid].requires)
    return chain


def provided_names(chain: list[Decision]) -> set[str]:
    names = set()
    for decision in chain:
        names |= {normalize(n) for n in [decision.name, *(o.name for o in decision.outputs)] if n}
    return names


def reachable_from(graph: Graph, start: str) -> set[str]:
    seen: set[str] = set()
    queue = deque([start])
    while queue:
        node = graph.nodes.get(queue.popleft())
        if node is None:
            continue
        targets = [graph.flows[f].target for f in node.outgoing if f in graph.flows]
        targets += [n.id for n in graph.nodes.values() if n.attached_to == node.id]
        for target in targets:
            if target not in seen:
                seen.add(target)
                queue.append(target)
    return seen


def computed_decisions(
    graph: Graph, tables: dict[str, LinkedTable]
) -> tuple[dict[tuple[str, str], list[Node]], list[tuple[Node, LinkedTable, Decision]]]:
    computed: dict[tuple[str, str], list[Node]] = {}
    picked: list[tuple[Node, LinkedTable, Decision]] = []
    for task in graph.nodes.values():
        if task.kind != "businessRuleTask" or not task.decision or task.decision not in tables:
            continue
        table = tables[task.decision]
        decision = pick_decision(task, table)
        if decision is None:
            continue
        computed.setdefault((task.decision, decision.id), []).append(task)
        picked.append((task, table, decision))
    return computed, picked


def order_findings(graph: Graph, tables: dict[str, LinkedTable]) -> list[Finding]:
    computed, picked = computed_decisions(graph, tables)
    findings = []
    for task, table, decision in picked:
        by_id = {d.id: d for d in table.decisions}
        for rid in decision.requires:
            earlier = computed.get((table.diagram_id, rid), [])
            if not earlier or rid not in by_id:
                continue
            if any(task.id in reachable_from(graph, other.id) for other in earlier):
                continue
            required = by_id[rid]
            findings.append(
                Finding(
                    "decision-order",
                    "warning",
                    f'"{decision.name or decision.id}" in {task.label} uses the result of '
                    f'"{required.name or required.id}", but {earlier[0].label}, which decides it, '
                    "does not come before it in the process.",
                    [task.id, *(t.id for t in earlier)],
                )
            )
    return findings


def decision_findings(graph: Graph, tables: dict[str, LinkedTable]) -> list[Finding]:
    findings: list[Finding] = order_findings(graph, tables)
    computed, _ = computed_decisions(graph, tables)
    for task in graph.nodes.values():
        if task.kind != "businessRuleTask":
            continue
        if not task.decision:
            findings.append(
                Finding(
                    "decision-missing",
                    "warning",
                    f"Business rule task {task.label} has no decision table, so its rules are not written down.",
                    [task.id],
                )
            )
            continue
        table = tables.get(task.decision)
        if table is None:
            findings.append(
                Finding(
                    "decision-link-broken",
                    "error",
                    f"Business rule task {task.label} points to a decision table that no longer exists.",
                    [task.id],
                )
            )
            continue
        decision = pick_decision(task, table)
        if decision is None:
            if task.decision_ref:
                findings.append(
                    Finding(
                        "decision-ref-broken",
                        "error",
                        f'Business rule task {task.label} points to a decision that is no longer in "{table.name}".',
                        [task.id],
                    )
                )
            continue
        output = primary_output(decision)
        gateway = routing_gateway(graph, task)
        title = f'"{decision.name or table.name}"'
        if gateway and output and output.values:
            branches = [f for f in graph.sequence() if f.source == gateway.id]
            covered: set[str] = set()
            for flow in branches:
                covered |= branch_values(flow.name, flow.condition)
            has_default = bool(gateway.default_flow)
            for value in output.values:
                if normalize(value) in covered:
                    continue
                findings.append(
                    Finding(
                        "decision-output-unhandled",
                        "info" if has_default else "warning",
                        f'{title} can return "{value}", but {gateway.label} has no branch for it'
                        + (
                            " and it would take the default flow."
                            if has_default
                            else "; the process would get stuck."
                        ),
                        [task.id, gateway.id],
                    )
                )
            if output.complete:
                known = {normalize(v) for v in output.values}
                for flow in branches:
                    labels = branch_values(flow.name, flow.condition)
                    if not labels or flow.id == gateway.default_flow or labels & known:
                        continue
                    findings.append(
                        Finding(
                            "decision-branch-impossible",
                            "warning",
                            f'The branch "{flow.name or flow.condition}" of {gateway.label} can never be taken: '
                            f"{title} only returns {', '.join(output.values)}.",
                            [gateway.id, flow.id],
                        )
                    )
        elif (
            output
            and len(output.values) > 1
            and gateway is None
            and not any(decision.id in d.requires for d in table.decisions)
        ):
            findings.append(
                Finding(
                    "decision-not-routed",
                    "info",
                    f"{title} returns {', '.join(output.values)}, but the process continues the same way after "
                    f"{task.label}. Add a decision gateway if the result should change the path.",
                    [task.id],
                )
            )
        elsewhere = {
            rid for (tid, rid), owners in computed.items() if tid == table.diagram_id and task not in owners
        }
        chain = required_chain(decision, table, elsewhere)
        inner = provided_names(chain)
        needed = []
        for item in [i for d in [decision, *(c for c in chain if c.id not in elsewhere)] for i in d.inputs]:
            label = item.label or item.expression
            if label and normalize(item.expression) not in inner and label not in needed:
                needed.append(label)
        if not needed:
            continue
        provided = [
            graph.nodes[f.source].name
            for f in graph.flows.values()
            if f.kind == "data_input" and f.target == task.id and f.source in graph.nodes
        ]
        if not provided:
            findings.append(
                Finding(
                    "decision-inputs-unmodeled",
                    "info",
                    f"{title} needs {', '.join(needed)}. Connect data objects to {task.label} to show where they come from.",
                    [task.id],
                )
            )
            continue
        names = [normalize(p) for p in provided if p]
        for item in needed:
            key = normalize(item)
            if any(key in n or n in key for n in names):
                continue
            findings.append(
                Finding(
                    "decision-input-missing",
                    "info",
                    f'{title} needs "{item}", but none of the data connected to {task.label} provides it.',
                    [task.id],
                )
            )
    return findings


def decisions_text(graph: Graph, tables: dict[str, LinkedTable]) -> str:
    parts = []
    for task in graph.nodes.values():
        if task.kind != "businessRuleTask" or not task.decision or task.decision not in tables:
            continue
        table = tables[task.decision]
        decision = pick_decision(task, table)
        shown = [decision, *required_chain(decision, table)] if decision else table.decisions
        by_id = {d.id: d for d in table.decisions}
        for item in shown:
            required = [by_id[r].name or r for r in item.requires if r in by_id]
            parts.append(f"{task.id} {task.label} uses:\n{describe_decision(item, required)}")
    return "\n\n".join(parts)
