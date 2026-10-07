import re
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


def decision_findings(graph: Graph, tables: dict[str, LinkedTable]) -> list[Finding]:
    findings: list[Finding] = []
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
        elif output and len(output.values) > 1 and gateway is None:
            findings.append(
                Finding(
                    "decision-not-routed",
                    "info",
                    f"{title} returns {', '.join(output.values)}, but the process continues the same way after "
                    f"{task.label}. Add a decision gateway if the result should change the path.",
                    [task.id],
                )
            )
        needed = [i.label or i.expression for i in decision.inputs if (i.label or i.expression)]
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
        for decision in table.decisions:
            parts.append(f"{task.id} {task.label} uses:\n{describe_decision(decision)}")
    return "\n\n".join(parts)
