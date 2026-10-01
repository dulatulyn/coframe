from tests.conftest import MakeUser, add_member, create_project, get_tree


async def setup(make_user: MakeUser):
    owner = await make_user()
    viewer = await make_user()
    await add_member(owner.workspace_id, viewer, "viewer")
    project = await create_project(owner)
    diagram_id = (await get_tree(owner, project["id"]))["diagrams"][0]["id"]
    return owner, viewer, diagram_id


async def test_threads_replies_and_resolving(make_user: MakeUser):
    owner, viewer, diagram_id = await setup(make_user)
    url = f"/api/diagrams/{diagram_id}/comments"

    r = await viewer.client.post(url, json={"body": " Who approves this? ", "elementId": "Task_1"})
    assert r.status_code == 201, r.text
    thread = r.json()
    assert (thread["body"], thread["elementId"], thread["author"]["id"]) == (
        "Who approves this?",
        "Task_1",
        str(viewer.id),
    )

    reply = (await owner.client.post(url, json={"body": "The manager", "parentId": thread["id"]})).json()
    assert (reply["parentId"], reply["elementId"]) == (thread["id"], "Task_1")
    nested = await owner.client.post(url, json={"body": "nope", "parentId": reply["id"]})
    assert nested.status_code == 404

    r = await owner.client.patch(f"/api/comments/{thread['id']}", json={"resolved": True})
    assert r.json()["resolvedBy"]["id"] == str(owner.id)
    assert (
        await owner.client.patch(f"/api/comments/{reply['id']}", json={"resolved": True})
    ).status_code == 400

    await viewer.client.post(url, json={"body": "Reopening", "parentId": thread["id"]})
    listed = (await viewer.client.get(url)).json()
    assert [c["body"] for c in listed] == ["Who approves this?", "The manager", "Reopening"]
    assert listed[0]["resolvedAt"] is None


async def test_only_authors_edit_and_editors_moderate(make_user: MakeUser):
    owner, viewer, diagram_id = await setup(make_user)
    url = f"/api/diagrams/{diagram_id}/comments"
    mine = (await owner.client.post(url, json={"body": "Owner note"})).json()
    theirs = (await viewer.client.post(url, json={"body": "Viewer note"})).json()

    assert (
        await viewer.client.patch(f"/api/comments/{mine['id']}", json={"body": "hacked"})
    ).status_code == 403
    assert (
        await viewer.client.patch(f"/api/comments/{mine['id']}", json={"resolved": True})
    ).status_code == 403
    assert (await viewer.client.delete(f"/api/comments/{mine['id']}")).status_code == 403
    assert (await viewer.client.patch(f"/api/comments/{theirs['id']}", json={"body": "Edited"})).json()[
        "body"
    ] == "Edited"

    reply = (await viewer.client.post(url, json={"body": "reply", "parentId": theirs["id"]})).json()
    assert (await owner.client.delete(f"/api/comments/{theirs['id']}")).status_code == 204
    remaining = {c["id"] for c in (await owner.client.get(url)).json()}
    assert remaining == {mine["id"]} and reply["id"] not in remaining

    stranger = await make_user()
    assert (await stranger.client.get(url)).status_code in (403, 404)
