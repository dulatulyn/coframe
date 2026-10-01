import secrets

_ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz"

_BLANK_DIAGRAM = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" \
xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" \
xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" \
xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" \
xmlns:di="http://www.omg.org/spec/DD/20100524/DI" \
id="{definitions}" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="{process}" isExecutable="false">
    <bpmn:startEvent id="{start_event}" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="{diagram}">
    <bpmndi:BPMNPlane id="{plane}" bpmnElement="{process}">
      <bpmndi:BPMNShape id="{start_event}_di" bpmnElement="{start_event}">
        <dc:Bounds x="182" y="162" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
"""


def random_id(prefix: str) -> str:
    return f"{prefix}_" + "".join(secrets.choice(_ID_ALPHABET) for _ in range(7))


def new_diagram_xml() -> str:
    return _BLANK_DIAGRAM.format(
        definitions=random_id("Definitions"),
        process=random_id("Process"),
        start_event=random_id("StartEvent"),
        diagram=random_id("BPMNDiagram"),
        plane=random_id("BPMNPlane"),
    )
