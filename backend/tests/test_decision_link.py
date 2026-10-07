from app.bpmn.dmn import literal_values, parse_decisions
from tests.conftest import MakeUser, create_project, get_tree, new_client


def rule(rid: str, total: str, customer: str, result: str) -> str:
    return (
        f'<rule id="{rid}"><inputEntry id="{rid}a"><text>{total}</text></inputEntry>'
        f'<inputEntry id="{rid}b"><text>{customer}</text></inputEntry>'
        f'<outputEntry id="{rid}c"><text>{result}</text></outputEntry></rule>'
    )


DMN = (
    '<?xml version="1.0" encoding="UTF-8"?>'
    '<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/"'
    ' id="D" name="Approve order" namespace="x">'
    '<decision id="Decision_1" name="Approve order"><decisionTable id="T" hitPolicy="FIRST">'
    '<input id="I1" label="Order total">'
    '<inputExpression id="E1" typeRef="number"><text>total</text></inputExpression></input>'
    '<input id="I2" label="Customer type">'
    '<inputExpression id="E2" typeRef="string"><text>customer</text></inputExpression></input>'
    '<output id="O" label="Result" name="result" typeRef="string"/>'
    + rule("R1", "&lt; 1000", "-", '"approve"')
    + rule("R2", "&gt;= 1000", '"vip"', '"escalate"')
    + rule("R3", "-", "-", '"reject"')
    + "</decisionTable></decision></definitions>"
)


def process(table_id: str, extra_branch: bool = True) -> str:
    branch = '<bpmn:sequenceFlow id="f4" name="maybe" sourceRef="G" targetRef="E3"/>' if extra_branch else ""
    end = '<bpmn:endEvent id="E3" name="Unclear"/>' if extra_branch else ""
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
 xmlns:coframe="https://coframe.run/schema/bpmn/1.0" id="Defs" targetNamespace="x">
<bpmn:process id="P">
<bpmn:startEvent id="S" name="Order received"/>
<bpmn:businessRuleTask id="Rule" name="Approve order" coframe:diagram="{table_id}"/>
<bpmn:businessRuleTask id="Bare" name="Pick carrier"/>
<bpmn:exclusiveGateway id="G" name="Result?"/>
<bpmn:endEvent id="E1" name="Approved"/><bpmn:endEvent id="E2" name="Rejected"/>{end}
<bpmn:sequenceFlow id="f1" sourceRef="S" targetRef="Rule"/>
<bpmn:sequenceFlow id="f2" sourceRef="Rule" targetRef="G"/>
<bpmn:sequenceFlow id="f3a" name="approve" sourceRef="G" targetRef="E1"/>
<bpmn:sequenceFlow id="f3b" name="Reject" sourceRef="G" targetRef="E2"/>{branch}
</bpmn:process></bpmn:definitions>"""


def test_decision_tables_are_read_with_their_possible_results():
    [decision] = parse_decisions(DMN)
    assert (decision.name, decision.hit_policy) == ("Approve order", "FIRST")
    assert [i.label for i in decision.inputs] == ["Order total", "Customer type"]
    assert decision.outputs[0].values == ["approve", "escalate", "reject"] and decision.outputs[0].complete
    assert literal_values('"a","b"') == ["a", "b"] and literal_values("x > 1") is None


async def test_process_and_decision_are_checked_together(make_user: MakeUser):
    owner = await make_user()
    project = await create_project(owner)
    url = f"/api/projects/{project['id']}/diagrams"
    proc = (
        await owner.client.post(
            url, json={"name": "Orders", "xml": process("00000000-0000-0000-0000-000000000000")}
        )
    ).json()
    table = await owner.client.post(
        url, json={"kind": "dmn", "xml": DMN, "ownerId": proc["id"], "name": "Approve order"}
    )
    assert table.status_code == 201, table.text
    table = table.json()
    assert table["ownerId"] == proc["id"]

    broken = (await owner.client.get(f"/api/diagrams/{proc['id']}/check")).json()["findings"]
    assert "decision-link-broken" in {f["rule"] for f in broken}

    proc2 = (await owner.client.post(url, json={"name": "Orders 2", "xml": process(table["id"])})).json()
    findings = (await owner.client.get(f"/api/diagrams/{proc2['id']}/check")).json()["findings"]
    by_rule = {}
    for f in findings:
        by_rule.setdefault(f["rule"], []).append(f)
    assert [f["severity"] for f in by_rule["decision-missing"]] == ["warning"]
    assert by_rule["decision-missing"][0]["elements"] == ["Bare"]
    assert (
        len(by_rule["decision-output-unhandled"]) == 1
        and '"escalate"' in by_rule["decision-output-unhandled"][0]["message"]
    )
    assert by_rule["decision-branch-impossible"][0]["elements"] == ["G", "f4"]
    assert "Order total" in by_rule["decision-inputs-unmodeled"][0]["message"]


async def test_owner_rules_and_rename_sync(make_user: MakeUser):
    owner = await make_user()
    project = await create_project(owner)
    other = await create_project(owner, name="Other")
    url = f"/api/projects/{project['id']}/diagrams"
    proc = (await get_tree(owner, project["id"]))["diagrams"][0]
    foreign = (await get_tree(owner, other["id"]))["diagrams"][0]
    bad = await owner.client.post(url, json={"kind": "dmn", "ownerId": foreign["id"]})
    assert (bad.status_code, bad.json()["detail"]) == (400, "invalid_owner")
    assert (await owner.client.post(url, json={"kind": "bpmn", "ownerId": proc["id"]})).status_code == 400

    table = (await owner.client.post(url, json={"kind": "dmn", "ownerId": proc["id"]})).json()
    r = await owner.client.patch(f"/api/diagrams/{table['id']}", json={"name": "Shipping fee"})
    assert r.status_code == 200, r.text
    xml = (await owner.client.get(f"/api/diagrams/{table['id']}/xml")).text
    assert parse_decisions(xml)[0].name == "Shipping fee"
    detached = await owner.client.patch(f"/api/diagrams/{table['id']}", json={"ownerId": None})
    assert detached.json()["ownerId"] is None


async def test_public_view_carries_linked_decisions(make_user: MakeUser):
    owner = await make_user()
    project = await create_project(owner)
    url = f"/api/projects/{project['id']}/diagrams"
    table = (await owner.client.post(url, json={"kind": "dmn", "xml": DMN, "name": "Approve order"})).json()
    proc = (await owner.client.post(url, json={"name": "Orders", "xml": process(table["id"], False)})).json()
    token = (await owner.client.put(f"/api/diagrams/{proc['id']}/public-link")).json()["token"]
    async with new_client() as anonymous:
        body = (await anonymous.get(f"/api/public/{token}")).json()
    assert [d["name"] for d in body["decisions"]] == ["Approve order"]
    assert "<decisionTable" in body["decisions"][0]["xml"]
