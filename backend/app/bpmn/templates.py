import secrets
from xml.sax.saxutils import quoteattr

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


_BLANK_DECISION = """<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" \
xmlns:dmndi="https://www.omg.org/spec/DMN/20191111/DMNDI/" \
xmlns:dc="http://www.omg.org/spec/DMN/20180521/DC/" \
id="{definitions}" name={name} namespace="https://coframe.run/dmn">
  <decision id="{decision}" name={name}>
    <decisionTable id="{table}" hitPolicy="UNIQUE">
      <input id="{input}" label="Input">
        <inputExpression id="{expression}" typeRef="string">
          <text></text>
        </inputExpression>
      </input>
      <output id="{output}" label="Result" name="result" typeRef="string" />
      <rule id="{rule}">
        <inputEntry id="{input_entry}">
          <text></text>
        </inputEntry>
        <outputEntry id="{output_entry}">
          <text></text>
        </outputEntry>
      </rule>
    </decisionTable>
  </decision>
  <dmndi:DMNDI>
    <dmndi:DMNDiagram id="{diagram}">
      <dmndi:DMNShape id="{shape}" dmnElementRef="{decision}">
        <dc:Bounds height="80" width="180" x="160" y="100" />
      </dmndi:DMNShape>
    </dmndi:DMNDiagram>
  </dmndi:DMNDI>
</definitions>
"""


def new_decision_xml(name: str) -> str:
    return _BLANK_DECISION.format(
        name=quoteattr(name),
        definitions=random_id("Definitions"),
        decision=random_id("Decision"),
        table=random_id("DecisionTable"),
        input=random_id("Input"),
        expression=random_id("InputExpression"),
        output=random_id("Output"),
        rule=random_id("Rule"),
        input_entry=random_id("InputEntry"),
        output_entry=random_id("OutputEntry"),
        diagram=random_id("DMNDiagram"),
        shape=random_id("DMNShape"),
    )
