from tests.conftest import MakeUser, create_project, get_tree, new_client


async def test_public_link_shares_a_read_only_copy(make_user: MakeUser):
    owner = await make_user()
    project = await create_project(owner, name="Sales")
    diagram_id = (await get_tree(owner, project["id"]))["diagrams"][0]["id"]

    r = await owner.client.put(f"/api/diagrams/{diagram_id}/public-link")
    assert r.status_code == 200, r.text
    token = r.json()["token"]
    assert (await owner.client.put(f"/api/diagrams/{diagram_id}/public-link")).json()["token"] == token
    assert (await owner.client.get(f"/api/diagrams/{diagram_id}")).json()["publicToken"] == token

    async with new_client() as anonymous:
        r = await anonymous.get(f"/api/public/{token}")
        assert r.status_code == 200, r.text
        assert r.json()["projectName"] == "Sales" and "<bpmn:definitions" in r.json()["xml"].replace(
            "bpmn2:", "bpmn:"
        )
        assert (await anonymous.put(f"/api/diagrams/{diagram_id}/public-link")).status_code == 401
        assert (await anonymous.get("/api/public/not-a-real-token")).status_code == 404

    assert (await owner.client.delete(f"/api/diagrams/{diagram_id}/public-link")).status_code == 204
    async with new_client() as anonymous:
        assert (await anonymous.get(f"/api/public/{token}")).status_code == 404


async def test_only_editors_manage_public_links_and_trash_hides_them(make_user: MakeUser):
    owner = await make_user()
    stranger = await make_user()
    project = await create_project(owner)
    diagram_id = (await get_tree(owner, project["id"]))["diagrams"][0]["id"]
    assert (await stranger.client.put(f"/api/diagrams/{diagram_id}/public-link")).status_code in (403, 404)

    token = (await owner.client.put(f"/api/diagrams/{diagram_id}/public-link")).json()["token"]
    assert (await owner.client.delete(f"/api/diagrams/{diagram_id}")).status_code == 204
    async with new_client() as anonymous:
        assert (await anonymous.get(f"/api/public/{token}")).status_code == 404
