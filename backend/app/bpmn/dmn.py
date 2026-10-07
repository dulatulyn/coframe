import json
import re
from dataclasses import dataclass, field

from lxml import etree

from app.bpmn.xmlsafe import DMN_NAMESPACES, InvalidXml, parse_dmn


@dataclass
class DecisionInput:
    label: str
    expression: str
    type_ref: str


@dataclass
class DecisionOutput:
    name: str
    label: str
    type_ref: str
    values: list[str] = field(default_factory=list)
    complete: bool = True


@dataclass
class Decision:
    id: str
    name: str
    hit_policy: str
    inputs: list[DecisionInput]
    outputs: list[DecisionOutput]
    rules: list[tuple[list[str], list[str]]]


LITERAL = re.compile(r'^\s*(?:"((?:[^"\\]|\\.)*)"|(-?\d+(?:\.\d+)?)|(true|false))\s*$')


def literal_values(text: str) -> list[str] | None:
    text = (text or "").strip()
    if text in ("", "-"):
        return []
    values = []
    for part in re.findall(r'"(?:[^"\\]|\\.)*"|[^,]+', text):
        match = LITERAL.match(part)
        if not match:
            return None
        values.append(
            json.loads(f'"{match.group(1)}"') if match.group(1) is not None else match.group(0).strip()
        )
    return values


def _children(element: etree._Element, local: str) -> list[etree._Element]:
    return [c for c in element if isinstance(c.tag, str) and etree.QName(c).localname == local]


def _text(element: etree._Element | None) -> str:
    if element is None:
        return ""
    texts = _children(element, "text")
    return (texts[0].text or "").strip() if texts else ""


def _decisions(root: etree._Element) -> list[etree._Element]:
    return [
        el
        for el in root
        if isinstance(el.tag, str)
        and etree.QName(el).localname == "decision"
        and etree.QName(el).namespace in DMN_NAMESPACES
    ]


def parse_decisions(xml: str) -> list[Decision]:
    try:
        root = parse_dmn(xml)
    except InvalidXml:
        return []
    result = []
    for element in _decisions(root):
        tables = _children(element, "decisionTable")
        if not tables:
            result.append(Decision(element.get("id", ""), element.get("name", "").strip(), "", [], [], []))
            continue
        table = tables[0]
        inputs = []
        for item in _children(table, "input"):
            expressions = _children(item, "inputExpression")
            expression = expressions[0] if expressions else None
            inputs.append(
                DecisionInput(
                    label=(item.get("label") or "").strip(),
                    expression=_text(expression),
                    type_ref=(expression.get("typeRef") if expression is not None else "") or "",
                )
            )
        outputs = [
            DecisionOutput(
                name=(item.get("name") or "").strip(),
                label=(item.get("label") or "").strip(),
                type_ref=item.get("typeRef") or "",
            )
            for item in _children(table, "output")
        ]
        rules = []
        for rule in _children(table, "rule"):
            rules.append(
                (
                    [_text(entry) for entry in _children(rule, "inputEntry")],
                    [_text(entry) for entry in _children(rule, "outputEntry")],
                )
            )
        for index, (item, output) in enumerate(zip(_children(table, "output"), outputs, strict=True)):
            declared = _children(item, "outputValues")
            declared_values = literal_values(_text(declared[0])) if declared else None
            if declared_values:
                output.values = declared_values
                continue
            seen: list[str] = []
            for _, entries in rules:
                values = literal_values(entries[index]) if index < len(entries) else []
                if values is None:
                    output.complete = False
                    continue
                for value in values:
                    if value not in seen:
                        seen.append(value)
            output.values = seen
        result.append(
            Decision(
                id=element.get("id", ""),
                name=(element.get("name") or "").strip(),
                hit_policy=table.get("hitPolicy") or "UNIQUE",
                inputs=inputs,
                outputs=outputs,
                rules=rules,
            )
        )
    return result


def rename_single_decision(xml: str, name: str) -> str | None:
    try:
        root = parse_dmn(xml)
    except InvalidXml:
        return None
    decisions = _decisions(root)
    if len(decisions) != 1:
        return None
    decisions[0].set("name", name)
    root.set("name", name)
    return etree.tostring(root, xml_declaration=True, encoding="UTF-8").decode("utf-8")


def describe_decision(decision: Decision) -> str:
    lines = [f'Decision "{decision.name or decision.id}" (hit policy {decision.hit_policy or "-"})']
    for item in decision.inputs:
        lines.append(
            f"  input: {item.label or item.expression} = {item.expression or '?'} ({item.type_ref or 'any'})"
        )
    for item in decision.outputs:
        values = ", ".join(item.values) if item.values else "any"
        lines.append(f"  output: {item.label or item.name} ({item.type_ref or 'any'}) values: {values}")

    def column(i: int) -> str:
        if i >= len(decision.inputs):
            return "?"
        return decision.inputs[i].label or decision.inputs[i].expression

    for index, (ins, outs) in enumerate(decision.rules[:40], start=1):
        when = " and ".join(f"{column(i)} {v}" for i, v in enumerate(ins) if v and v != "-")
        lines.append(f"  rule {index}: when {when or 'always'} then {', '.join(outs)}")
    return "\n".join(lines)
