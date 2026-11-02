import io
import zipfile

from tests.conftest import MakeUser, create_diagram, create_folder, create_project, get_tree


async def _zip(user, project_id: str) -> zipfile.ZipFile:
    r = await user.client.get(f"/api/projects/{project_id}/export")
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/zip"
    assert "attachment" in r.headers["content-disposition"]
    return zipfile.ZipFile(io.BytesIO(r.content))


async def test_export_project_lays_files_out_by_folder(make_user: MakeUser):
    owner = await make_user()
    project = await create_project(owner, "Onboarding")
    specs = await create_folder(owner, project["id"], "Specs")
    nested = await create_folder(owner, project["id"], "Done/Old", parent_id=specs["id"])
    await create_diagram(owner, project["id"], "Hiring", folder_id=specs["id"])
    await create_diagram(owner, project["id"], "Hiring", folder_id=specs["id"])
    await create_diagram(owner, project["id"], "Archive", folder_id=nested["id"])
    r = await owner.client.post(
        f"/api/projects/{project['id']}/diagrams", json={"name": "Pricing", "kind": "dmn"}
    )
    assert r.status_code == 201, r.text

    archive = await _zip(owner, project["id"])
    names = set(archive.namelist())
    assert {
        "Untitled diagram.bpmn",
        "Pricing.dmn",
        "Specs/",
        "Specs/Hiring.bpmn",
        "Specs/Hiring (2).bpmn",
        "Specs/Done Old/",
        "Specs/Done Old/Archive.bpmn",
    } == names
    assert b"startEvent" in archive.read("Specs/Hiring.bpmn")
    assert b"definitions" in archive.read("Pricing.dmn")


async def test_export_skips_trash_and_needs_access(make_user: MakeUser):
    owner = await make_user()
    stranger = await make_user()
    project = await create_project(owner)
    doomed = await create_diagram(owner, project["id"], "Doomed")
    assert (await owner.client.delete(f"/api/diagrams/{doomed['id']}")).status_code == 204

    archive = await _zip(owner, project["id"])
    assert archive.namelist() == ["Untitled diagram.bpmn"]
    assert len((await get_tree(owner, project["id"]))["diagrams"]) == 1

    r = await stranger.client.get(f"/api/projects/{project['id']}/export")
    assert r.status_code == 404
