from tests.conftest import MakeUser, create_project, get_tree, new_client


async def test_decision_tables_are_created_saved_and_versioned(make_user: MakeUser, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "version_interval", 0)
    owner = await make_user()
    project = await create_project(owner)
    r = await owner.client.post(f"/api/projects/{project['id']}/diagrams", json={"kind": "dmn"})
    assert r.status_code == 201, r.text
    decision = r.json()
    assert (decision["kind"], decision["name"]) == ("dmn", "Untitled decision")

    xml = (await owner.client.get(f"/api/diagrams/{decision['id']}/xml")).text
    assert "<decisionTable" in xml and 'name="Untitled decision"' in xml
    changed = xml.replace('label="Input"', 'label="Order total"')
    r = await owner.client.put(f"/api/diagrams/{decision['id']}/content", json={"xml": changed})
    assert r.status_code == 200, r.text
    assert "Order total" in (await owner.client.get(f"/api/diagrams/{decision['id']}/xml")).text
    versions = (await owner.client.get(f"/api/diagrams/{decision['id']}/versions")).json()
    assert len(versions) == 1

    bad = await owner.client.put(f"/api/diagrams/{decision['id']}/content", json={"xml": "<definitions/>"})
    assert bad.status_code == 400
    copy = (await owner.client.post(f"/api/diagrams/{decision['id']}/duplicate")).json()
    assert copy["kind"] == "dmn"
    kinds = {d["id"]: d["kind"] for d in (await get_tree(owner, project["id"]))["diagrams"]}
    assert kinds[decision["id"]] == "dmn" and list(kinds.values()).count("bpmn") == 1
    assert (await owner.client.put(f"/api/diagrams/{decision['id']}/public-link")).status_code == 400


async def test_process_diagrams_are_not_saved_through_content(make_user: MakeUser):
    owner = await make_user()
    project = await create_project(owner)
    diagram_id = (await get_tree(owner, project["id"]))["diagrams"][0]["id"]
    xml = (await owner.client.get(f"/api/diagrams/{diagram_id}/xml")).text
    r = await owner.client.put(f"/api/diagrams/{diagram_id}/content", json={"xml": xml})
    assert r.status_code == 400
    r = await owner.client.post(f"/api/projects/{project['id']}/diagrams", json={"kind": "dmn", "xml": xml})
    assert (r.status_code, r.json()["detail"]) == (400, "invalid_dmn")
    async with new_client() as anonymous:
        assert (
            await anonymous.put(f"/api/diagrams/{diagram_id}/content", json={"xml": xml})
        ).status_code == 401
