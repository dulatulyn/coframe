from tests.conftest import MakeUser, create_project, get_tree

CALLER = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
 xmlns:coframe="https://coframe.run/schema/bpmn/1.0" id="D" targetNamespace="http://bpmn.io/schema/bpmn">
<bpmn:process id="P"><bpmn:callActivity id="C" name="Ship the order" coframe:diagram="{target}"/>
<bpmn:callActivity id="X" name="Broken" coframe:diagram="not-a-diagram"/></bpmn:process></bpmn:definitions>"""


async def test_map_lists_diagrams_and_call_links(make_user: MakeUser):
    owner = await make_user()
    project = await create_project(owner)
    first = (await get_tree(owner, project["id"]))["diagrams"][0]
    callee = (
        await owner.client.post(f"/api/projects/{project['id']}/diagrams", json={"name": "Shipping"})
    ).json()
    caller = (
        await owner.client.post(
            f"/api/projects/{project['id']}/diagrams",
            json={"name": "Orders", "xml": CALLER.replace("{target}", callee["id"])},
        )
    ).json()
    r = await owner.client.get(f"/api/projects/{project['id']}/map")
    assert r.status_code == 200, r.text
    body = r.json()
    assert {d["id"] for d in body["diagrams"]} == {first["id"], callee["id"], caller["id"]}
    assert body["links"] == [
        {"source": caller["id"], "target": callee["id"], "label": "Ship the order", "kind": "call"}
    ]

    stranger = await make_user()
    assert (await stranger.client.get(f"/api/projects/{project['id']}/map")).status_code in (403, 404)
