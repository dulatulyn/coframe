from app.ai.decisions import LinkedTable, decision_findings, decisions_text
from app.ai.graph import build_graph
from app.bpmn.dmn import parse_decisions


def table(did: str, name: str, inputs: list[tuple[str, str]], output: str, requires: list[str]) -> str:
    reqs = "".join(
        f'<informationRequirement id="IR_{did}_{r}"><requiredDecision href="#{r}"/></informationRequirement>'
        for r in requires
    )
    cols = "".join(
        f'<input id="I_{did}_{i}" label="{label}"><inputExpression id="E_{did}_{i}" typeRef="string">'
        f"<text>{expr}</text></inputExpression></input>"
        for i, (label, expr) in enumerate(inputs)
    )
    entries = "".join(f'<inputEntry id="X_{did}_{i}"><text>-</text></inputEntry>' for i in range(len(inputs)))
    return (
        f'<decision id="{did}" name="{name}">{reqs}<decisionTable id="T_{did}">{cols}'
        f'<output id="O_{did}" name="{output}" typeRef="string"/>'
        f'<rule id="R_{did}">{entries}<outputEntry id="Y_{did}"><text>"ok"</text></outputEntry></rule>'
        "</decisionTable></decision>"
    )


DRD = (
    '<?xml version="1.0" encoding="UTF-8"?>'
    '<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" id="D" name="Loan" namespace="x">'
    + table(
        "Main",
        "Approve loan",
        [("Risk", "risk"), ("Affordability", "affordable")],
        "approval",
        ["Sub1", "Sub2"],
    )
    + table("Sub1", "Assess risk", [("Credit score", "score")], "risk", ["Sub3"])
    + table("Sub2", "Check affordability", [("Income", "income"), ("Debt", "debt")], "affordable", [])
    + table("Sub3", "Score applicant", [("History", "history")], "score", [])
    + "</definitions>"
)

TABLE_ID = "11111111-1111-1111-1111-111111111111"


def process(order: list[tuple[str, str]]) -> str:
    tasks = "".join(
        f'<bpmn:businessRuleTask id="{tid}" name="{tid}" '
        f'coframe:diagram="{TABLE_ID}" coframe:decision="{ref}"/>'
        for tid, ref in order
    )
    ids = ["S", *(t for t, _ in order), "E"]
    flows = "".join(
        f'<bpmn:sequenceFlow id="f{i}" sourceRef="{a}" targetRef="{b}"/>'
        for i, (a, b) in enumerate(zip(ids, ids[1:], strict=False))
    )
    return (
        '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" '
        'xmlns:coframe="https://coframe.run/schema/bpmn/1.0" id="Defs" targetNamespace="x">'
        '<bpmn:process id="P">'
        f'<bpmn:startEvent id="S"/>{tasks}<bpmn:endEvent id="E"/>{flows}</bpmn:process></bpmn:definitions>'
    )


def findings(order: list[tuple[str, str]]):
    tables = {TABLE_ID: LinkedTable(TABLE_ID, "Loan", parse_decisions(DRD))}
    graph = build_graph(process(order))
    return graph, tables, decision_findings(graph, tables)


def test_requirements_are_read_from_the_drd():
    decisions = {d.id: d for d in parse_decisions(DRD)}
    assert decisions["Main"].requires == ["Sub1", "Sub2"]
    assert decisions["Sub1"].requires == ["Sub3"]
    assert decisions["Sub2"].requires == []


def test_a_task_uses_the_decision_it_points_to():
    graph, tables, found = findings([("Risk", "Sub1")])
    assert "decision-ref-broken" not in {f.rule for f in found}
    text = decisions_text(graph, tables)
    assert 'Decision "Assess risk"' in text and 'Decision "Score applicant"' in text
    assert 'Decision "Approve loan"' not in text
    assert "uses the results of: Score applicant" in text


def test_a_missing_decision_is_reported():
    _, _, found = findings([("Risk", "Gone")])
    assert "decision-ref-broken" in {f.rule for f in found}


def test_subdecisions_in_the_right_order_pass():
    _, _, found = findings([("Score", "Sub3"), ("Risk", "Sub1"), ("Afford", "Sub2"), ("Approve", "Main")])
    assert "decision-order" not in {f.rule for f in found}
    assert "decision-not-routed" not in {f.rule for f in found}
    asked = {f.elements[0]: f.message for f in found if f.rule == "decision-inputs-unmodeled"}
    assert set(asked) == {"Score", "Afford"}
    assert "History" in asked["Score"] and "Income" in asked["Afford"]


def test_a_decision_before_its_subdecision_is_flagged():
    _, _, found = findings([("Approve", "Main"), ("Risk", "Sub1"), ("Afford", "Sub2")])
    order = [f for f in found if f.rule == "decision-order"]
    assert len(order) == 2
    assert all(f.elements[0] == "Approve" for f in order)
    assert any("Assess risk" in f.message for f in order)


def test_inputs_from_subdecisions_are_not_asked_for():
    _, _, found = findings([("Approve", "Main")])
    [missing] = [f for f in found if f.rule == "decision-inputs-unmodeled"]
    assert "History" in missing.message and "Income" in missing.message
    assert "Risk" not in missing.message and "Affordability" not in missing.message
