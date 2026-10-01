from pathlib import Path

import pytest
from lxml import etree

from app.bpmn.flat import flatten_xml, reconstruct_xml, sanitize
from app.bpmn.xmlsafe import InvalidXml

FIXTURES = Path(__file__).resolve().parents[2] / "shared" / "fixtures" / "bpmn"
ALL_FIXTURES = sorted(FIXTURES.glob("*.bpmn"))


def load(name: str) -> str:
    return (FIXTURES / name).read_text()


@pytest.mark.parametrize("path", ALL_FIXTURES, ids=lambda p: p.name)
def test_round_trip_is_stable(path: Path):
    entries = flatten_xml(path.read_text())
    rebuilt = reconstruct_xml(entries)
    assert flatten_xml(rebuilt) == entries
    assert reconstruct_xml(flatten_xml(rebuilt)) == rebuilt


@pytest.mark.parametrize("path", ALL_FIXTURES, ids=lambda p: p.name)
def test_reconstructed_xml_is_well_formed_bpmn(path: Path):
    root = etree.fromstring(reconstruct_xml(flatten_xml(path.read_text())).encode())
    assert etree.QName(root).localname == "definitions"


def test_entries_capture_structure_attributes_and_content():
    entries = flatten_xml(load("collaboration.bpmn"))
    task = entries["Task_check"]
    assert task["t"] == "bpmn:userTask"
    assert task["p"] == "Process_Shop"
    assert task["@name"] == "Check order"
    assert "#bpmn:incoming" not in task and "#bpmn:outgoing" not in task

    di = entries["Task_check_di"]
    assert di["p"] == "BPMNPlane_1"
    assert di["#dc:Bounds"] == '<dc:Bounds height="80" width="100" x="330" y="250"/>'

    lane = entries["Lane_sales"]
    assert lane["~bpmn:flowNodeRef|Task_check"] == "1"
    assert lane["~bpmn:flowNodeRef|StartEvent_order"] == "1"

    root = entries["Definitions_0col1ab"]
    assert root["p"] == ""
    assert root["@xmlns:bpmn"] == "http://www.omg.org/spec/BPMN/20100524/MODEL"
    assert root["@exporter"].startswith("bpmn-js")

    process_children = sorted((e["o"], k) for k, e in entries.items() if e["p"] == "Process_Shop")
    assert [k for _, k in process_children][:3] == ["LaneSet_1", "StartEvent_order", "Task_check"]


def test_special_characters_survive():
    entries = flatten_xml(load("collaboration.bpmn"))
    assert entries["StartEvent_order"]["@name"] == "Order\nreceived"
    annotation = entries["TextAnnotation_1"]["#bpmn:text"]
    assert annotation == (
        '<bpmn:text>Customers pay within 14 days &amp; get a "receipt" &lt;PDF&gt;</bpmn:text>'
    )
    rebuilt = reconstruct_xml(entries)
    assert 'name="Order&#10;received"' in rebuilt
    assert "${order.valid == false}" in rebuilt


def test_incoming_and_outgoing_are_recomputed():
    rebuilt = reconstruct_xml(flatten_xml(load("collaboration.bpmn")))
    root = etree.fromstring(rebuilt.encode())
    ns = {"bpmn": "http://www.omg.org/spec/BPMN/20100524/MODEL"}
    task = root.find(".//bpmn:userTask[@id='Task_check']", ns)
    assert [e.text for e in task.findall("bpmn:incoming", ns)] == ["Flow_1"]
    assert [e.text for e in task.findall("bpmn:outgoing", ns)] == ["Flow_2"]
    gateway = root.find(".//bpmn:exclusiveGateway[@id='Gateway_ok']", ns)
    assert sorted(e.text for e in gateway.findall("bpmn:outgoing", ns)) == ["Flow_no", "Flow_yes"]


def test_foreign_prefixes_extensions_and_cdata_are_kept():
    entries = flatten_xml(load("bpmn2-prefix.bpmn"))
    service = entries["Service_ext"]
    assert service["t"] == "bpmn2:serviceTask"
    assert service["@camunda:topic"] == "scoring"
    assert service["#bpmn2:documentation"] == (
        "<bpmn2:documentation>"
        "Calls the &lt;scoring&gt; service &amp; stores the result."
        "</bpmn2:documentation>"
    )
    assert "camunda:inputParameter" in service["#bpmn2:extensionElements"]
    assert entries["Start_ext"]["@name"] == "Request\tsubmitted"
    rebuilt = reconstruct_xml(entries)
    assert "<bpmn2:outgoing>Flow_ext_1</bpmn2:outgoing>" in rebuilt
    assert 'xmlns:camunda="http://camunda.org/schema/1.0/bpmn"' in rebuilt


def test_default_namespace_documents():
    entries = flatten_xml(load("default-namespace.bpmn"))
    assert entries["sid-manual"]["t"] == "manualTask"
    assert entries["sid-defs"]["@xmlns"] == "http://www.omg.org/spec/BPMN/20100524/MODEL"
    rebuilt = reconstruct_xml(entries)
    assert "<incoming>sid-flow-2</incoming>" in rebuilt
    assert flatten_xml(rebuilt) == entries


def test_drilldown_planes_keep_their_order():
    entries = flatten_xml(load("subprocesses.bpmn"))
    diagrams = sorted((e["o"], k) for k, e in entries.items() if e["t"] == "bpmndi:BPMNDiagram")
    assert [k for _, k in diagrams] == ["BPMNDiagram_main", "BPMNDiagram_sub"]
    assert entries["Sub_collapsed_start"]["p"] == "Sub_collapsed"


def test_sanitize_removes_everything_that_depends_on_a_deleted_task():
    entries = flatten_xml(load("collaboration.bpmn"))
    del entries["Task_check"]
    clean = sanitize(entries)
    for gone in (
        "Task_check_di",
        "Flow_1",
        "Flow_1_di",
        "Flow_2",
        "Flow_2_di",
        "Property_1",
        "DataInputAssociation_1",
        "DataInputAssociation_1_di",
        "DataOutputAssociation_1",
        "Association_1",
        "Association_1_di",
    ):
        assert gone not in clean, gone
    assert "~bpmn:flowNodeRef|Task_check" not in clean["Lane_sales"]
    assert "StartEvent_order" in clean and "TextAnnotation_1" in clean
    assert "Task_check_di" in entries
    assert sanitize(clean) == clean
    etree.fromstring(reconstruct_xml(clean).encode())


def test_sanitize_drops_orphaned_boundary_events_and_stale_defaults():
    entries = flatten_xml(load("collaboration.bpmn"))
    del entries["Task_send_invoice"]
    del entries["Flow_yes"]
    clean = sanitize(entries)
    assert "Event_timer_boundary" not in clean
    assert "Event_reminder_boundary" not in clean
    assert "Flow_4" not in clean
    assert "@default" not in clean["Gateway_ok"]


def test_sanitize_retargets_the_main_plane_and_drops_orphan_planes():
    entries = flatten_xml(load("subprocesses.bpmn"))
    del entries["Sub_collapsed"]
    clean = sanitize(entries)
    assert "BPMNDiagram_sub" not in clean and "BPMNPlane_sub" not in clean
    assert "Sub_collapsed_start" not in clean
    assert clean["BPMNPlane_main"]["@bpmnElement"] == "Process_sub"

    entries = flatten_xml(load("subprocesses.bpmn"))
    entries["BPMNPlane_main"]["@bpmnElement"] = "Missing"
    assert sanitize(entries)["BPMNPlane_main"]["@bpmnElement"] == "Process_sub"


def test_sanitize_keeps_one_di_per_element():
    entries = flatten_xml(load("collaboration.bpmn"))
    entries["Task_check_di_copy"] = {**entries["Task_check_di"], "o": entries["Task_check_di"]["o"] + "V"}
    clean = sanitize(entries)
    assert "Task_check_di" in clean and "Task_check_di_copy" not in clean


def test_unsafe_or_foreign_xml_is_rejected():
    with pytest.raises(InvalidXml):
        flatten_xml('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x>&e;</x>')
    with pytest.raises(InvalidXml):
        flatten_xml("<svg xmlns='http://www.w3.org/2000/svg'/>")
    with pytest.raises(InvalidXml):
        flatten_xml("<definitions")


@pytest.mark.parametrize("path", ALL_FIXTURES, ids=lambda p: p.name)
def test_shared_parity_fixtures_are_current(path: Path):
    import json

    flat_dir = FIXTURES.parent / "flat"
    entries = flatten_xml(path.read_text())
    assert json.loads((flat_dir / f"{path.stem}.json").read_text()) == entries
    assert (flat_dir / f"{path.stem}.xml").read_text() == reconstruct_xml(entries)
