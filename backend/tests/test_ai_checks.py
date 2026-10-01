from pathlib import Path

from app.ai.checks import run_checks
from app.ai.describe import describe
from app.ai.graph import build_graph

FIXTURES = Path(__file__).resolve().parents[2] / "shared" / "fixtures" / "bpmn"


def bpmn(body: str, collaboration: str = "") -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" '
        'targetNamespace="http://bpmn.io/schema/bpmn">'
        f"{collaboration}"
        f'<bpmn:process id="P" isExecutable="false">{body}</bpmn:process>'
        "</bpmn:definitions>"
    )


def flow(fid: str, source: str, target: str, name: str = "") -> str:
    label = f' name="{name}"' if name else ""
    return f'<bpmn:sequenceFlow id="{fid}" sourceRef="{source}" targetRef="{target}"{label}/>'


def rules(xml: str) -> dict[str, list[list[str]]]:
    found: dict[str, list[list[str]]] = {}
    for finding in run_checks(build_graph(xml)):
        found.setdefault(finding.rule, []).append(finding.elements)
    return found


LINEAR = (
    '<bpmn:startEvent id="S" name="Start"/>'
    '<bpmn:task id="A" name="Do work"/>'
    '<bpmn:endEvent id="E" name="Done"/>' + flow("f1", "S", "A") + flow("f2", "A", "E")
)


def test_a_clean_linear_process_has_no_findings():
    assert rules(bpmn(LINEAR)) == {}


def test_missing_start_and_end_events():
    found = rules(bpmn('<bpmn:task id="A" name="Alone"/>'))
    assert "start-event-required" in found
    assert "end-event-required" in found
    assert "no-disconnected" not in found


def test_disconnected_and_unreachable_elements():
    body = (
        LINEAR
        + '<bpmn:task id="Lost" name="Lost"/><bpmn:task id="Orphan" name="Orphan"/>'
        + flow("f3", "Orphan", "E")
    )
    found = rules(bpmn(body))
    assert found["no-disconnected"] == [["Lost"]]
    assert found["unreachable"] == [["Orphan"]]


def test_flow_that_stops_without_an_end_event():
    body = '<bpmn:startEvent id="S" name="Start"/><bpmn:task id="A" name="Last"/>' + flow("f1", "S", "A")
    found = rules(bpmn(body))
    assert found["no-implicit-end"] == [["A"]]
    assert "end-event-required" in found


def test_endless_loop_is_detected():
    body = (
        '<bpmn:startEvent id="S" name="Start"/><bpmn:task id="A" name="Ping"/><bpmn:task id="B" name="Pong"/>'
        '<bpmn:endEvent id="E" name="Never"/>'
        + flow("f1", "S", "A")
        + flow("f2", "A", "B")
        + flow("f3", "B", "A")
        + '<bpmn:task id="C" name="Other"/>'
        + flow("f4", "C", "E")
    )
    found = rules(bpmn(body))
    assert ["A"] in found["no-end-reachable"] and ["B"] in found["no-end-reachable"]


def test_implicit_split_and_fake_join():
    body = (
        '<bpmn:startEvent id="S" name="Start"/><bpmn:task id="A" name="Split here"/>'
        '<bpmn:task id="B" name="Left"/><bpmn:task id="C" name="Right"/><bpmn:task id="D" name="Merge here"/>'
        '<bpmn:endEvent id="E" name="Done"/>'
        + flow("f1", "S", "A")
        + flow("f2", "A", "B")
        + flow("f3", "A", "C")
        + flow("f4", "B", "D")
        + flow("f5", "C", "D")
        + flow("f6", "D", "E")
    )
    found = rules(bpmn(body))
    assert found["no-implicit-split"] == [["A"]]
    assert found["fake-join"] == [["D"]]


def test_deadlock_between_exclusive_split_and_parallel_join():
    body = (
        '<bpmn:startEvent id="S" name="Start"/>'
        '<bpmn:exclusiveGateway id="X" name="Approved?"/>'
        '<bpmn:task id="A" name="Ship"/><bpmn:task id="B" name="Refund"/>'
        '<bpmn:parallelGateway id="J"/><bpmn:endEvent id="E" name="Done"/>'
        + flow("f1", "S", "X")
        + flow("f2", "X", "A", "yes")
        + flow("f3", "X", "B", "no")
        + flow("f4", "A", "J")
        + flow("f5", "B", "J")
        + flow("f6", "J", "E")
    )
    found = rules(bpmn(body))
    assert found["deadlock"] == [["J", "X"]]


def test_parallel_branches_merged_without_synchronization():
    body = (
        '<bpmn:startEvent id="S" name="Start"/>'
        '<bpmn:parallelGateway id="P1"/>'
        '<bpmn:task id="A" name="Pack"/><bpmn:task id="B" name="Bill"/>'
        '<bpmn:exclusiveGateway id="M"/><bpmn:task id="C" name="Ship"/><bpmn:endEvent id="E" name="Done"/>'
        + flow("f1", "S", "P1")
        + flow("f2", "P1", "A")
        + flow("f3", "P1", "B")
        + flow("f4", "A", "M")
        + flow("f5", "B", "M")
        + flow("f6", "M", "C")
        + flow("f7", "C", "E")
    )
    found = rules(bpmn(body))
    assert found["lack-of-synchronization"] == [["M", "P1"]]


def test_decision_without_labels_or_default():
    body = (
        '<bpmn:startEvent id="S" name="Start"/><bpmn:exclusiveGateway id="X"/>'
        '<bpmn:endEvent id="E1" name="One"/><bpmn:endEvent id="E2" name="Two"/>'
        + flow("f1", "S", "X")
        + flow("f2", "X", "E1")
        + flow("f3", "X", "E2")
    )
    found = rules(bpmn(body))
    assert found["unlabeled-branch"] == [["X", "f2", "f3"]]
    assert found["missing-default-flow"] == [["X"]]
    assert ["X"] in found["label-required"]


def test_event_based_gateway_must_lead_to_catch_events():
    body = (
        '<bpmn:startEvent id="S" name="Start"/><bpmn:eventBasedGateway id="G" name="Wait"/>'
        '<bpmn:intermediateCatchEvent id="T" name="1 day"><bpmn:timerEventDefinition id="td"/></bpmn:intermediateCatchEvent>'
        '<bpmn:task id="A" name="Call"/><bpmn:endEvent id="E" name="Done"/>'
        + flow("f1", "S", "G")
        + flow("f2", "G", "T")
        + flow("f3", "G", "A")
        + flow("f4", "T", "E")
        + flow("f5", "A", "E")
    )
    found = rules(bpmn(body))
    assert found["event-based-gateway-target"] == [["G", "A"]]


def test_message_flow_inside_one_pool_is_an_error():
    collaboration = (
        '<bpmn:collaboration id="C"><bpmn:participant id="Pool" name="Shop" processRef="P"/>'
        '<bpmn:messageFlow id="m1" sourceRef="A" targetRef="E"/></bpmn:collaboration>'
    )
    found = rules(bpmn(LINEAR, collaboration))
    assert found["message-flow-same-pool"] == [["m1"]]


def test_unmatched_link_events_and_superfluous_gateway():
    body = (
        '<bpmn:startEvent id="S" name="Start"/><bpmn:exclusiveGateway id="G"/>'
        '<bpmn:intermediateThrowEvent id="L" name="Go to B"><bpmn:linkEventDefinition id="ld"/></bpmn:intermediateThrowEvent>'
        + flow("f1", "S", "G")
        + flow("f2", "G", "L")
        + '<bpmn:endEvent id="E" name="Done"/>'
    )
    found = rules(bpmn(body))
    assert found["link-event"] == [["L"]]
    assert found["superfluous-gateway"] == [["G"]]


def test_description_lists_every_element_and_connection():
    xml = (FIXTURES / "lanes.bpmn").read_text() if (FIXTURES / "lanes.bpmn").exists() else bpmn(LINEAR)
    graph = build_graph(xml)
    text = describe(graph, run_checks(graph))
    for node in graph.nodes.values():
        assert node.id in text
    for sequence_flow in graph.sequence():
        assert sequence_flow.id in text
    assert "Automated checks" in text


async def test_check_endpoint_reports_findings_for_a_live_diagram(make_user):
    from tests.conftest import create_project, get_tree

    owner = await make_user()
    project = await create_project(owner)
    diagram_id = (await get_tree(owner, project["id"]))["diagrams"][0]["id"]
    r = await owner.client.get(f"/api/diagrams/{diagram_id}/check")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["elementCount"] == 1
    assert {f["rule"] for f in body["findings"]} >= {"end-event-required"}

    stranger = await make_user()
    assert (await stranger.client.get(f"/api/diagrams/{diagram_id}/check")).status_code in (403, 404)
