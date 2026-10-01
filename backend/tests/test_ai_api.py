import uuid

import pytest
from sqlalchemy import func, select

from app.ai.graph import build_graph
from app.ai.llm import Usage, pick_latest, set_provider
from app.ai.ops import InvalidOps, Op, validate_ops
from app.ai.results import AiCommand, AiProcess, AiReview, AiSuggestions
from app.config import settings
from app.db import utcnow
from app.models import AiUsage
from tests.conftest import MakeUser, create_project, get_tree, new_client
from tests.test_ai_checks import LINEAR, bpmn


class FakeProvider:
    def __init__(self) -> None:
        self.review: dict = {"summary": "", "verdict": "solid", "issues": [], "improvements": []}
        self.suggestions: dict = {"suggestions": []}
        self.commands: list[dict] = []
        self.processes: list[dict] = []
        self.prompts: list[str] = []

    async def generate_json(self, tier, system, prompt, schema, thinking=None):
        self.prompts.append(prompt)
        if schema is AiProcess:
            return schema.model_validate(self.processes.pop(0)), Usage("gemini-test-pro", 1000, 1200)
        if schema is AiCommand:
            return schema.model_validate(self.commands.pop(0)), Usage("gemini-test-pro", 1500, 300)
        data = self.review if schema is AiReview else self.suggestions
        return schema.model_validate(data), Usage(
            f"gemini-test-{'pro' if tier == 'smart' else 'flash'}", 2000, 800
        )


@pytest.fixture
def fake_ai(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "gcp_project", "test-project")
    fake = FakeProvider()
    set_provider(fake)
    yield fake
    set_provider(None)


async def diagram_with_start(user):
    project = await create_project(user)
    diagram_id = (await get_tree(user, project["id"]))["diagrams"][0]["id"]
    xml = (await user.client.get(f"/api/diagrams/{diagram_id}/xml")).text
    start = next(n.id for n in build_graph(xml).nodes.values() if n.kind == "startEvent")
    return diagram_id, start


async def test_guests_cannot_use_ai(fake_ai, make_user: MakeUser):
    owner = await make_user()
    diagram_id, _ = await diagram_with_start(owner)
    async with new_client() as guest:
        await guest.post("/api/auth/guest")
        r = await guest.post(f"/api/diagrams/{diagram_id}/ai/review", json={})
        assert r.status_code in (403, 404)
        status = (await guest.get("/api/ai/status")).json()
        assert (status["available"], status["reason"]) == (False, "sign_up_for_ai")


async def test_ai_is_off_without_a_cloud_project(make_user: MakeUser, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "gcp_project", None)
    monkeypatch.setattr(settings, "gemini_api_key", None)
    owner = await make_user()
    diagram_id, _ = await diagram_with_start(owner)
    r = await owner.client.post(f"/api/diagrams/{diagram_id}/ai/review", json={})
    assert (r.status_code, r.json()["detail"]) == (503, "ai_not_configured")


async def test_review_keeps_valid_fixes_and_drops_invalid_ones(fake_ai, make_user: MakeUser, db):
    owner = await make_user()
    diagram_id, start = await diagram_with_start(owner)
    fake_ai.review = {
        "summary": "A process that only starts.",
        "verdict": "broken",
        "issues": [
            {
                "title": "No end",
                "severity": "error",
                "explanation": "The process never finishes.",
                "elements": [start, "Ghost_1"],
                "fix": {
                    "title": "Add an end event",
                    "ops": [
                        {"op": "add", "ref": "new1", "type": "bpmn:EndEvent", "name": "Done", "after": start}
                    ],
                },
            },
            {
                "title": "Broken fix",
                "severity": "warning",
                "explanation": "Refers to nothing.",
                "elements": [],
                "fix": {"title": "Rename", "ops": [{"op": "rename", "element": "Missing", "name": "X"}]},
            },
        ],
        "improvements": [
            {
                "title": "Name the start",
                "rationale": "Clear names help.",
                "ops": [{"op": "rename", "element": start, "name": "Order received"}],
            },
            {
                "title": "Impossible",
                "rationale": "Turns an event into a task.",
                "ops": [{"op": "retype", "element": start, "type": "bpmn:UserTask"}],
            },
        ],
    }
    r = await owner.client.post(f"/api/diagrams/{diagram_id}/ai/review", json={"language": "Russian"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["verdict"] == "broken"
    first, second = body["issues"]
    assert first["elements"] == [start]
    assert first["fix"]["ops"][0]["op"] == "add"
    assert second["fix"] is None
    assert [i["title"] for i in body["improvements"]] == ["Name the start"]
    assert {f["rule"] for f in body["findings"]} >= {"end-event-required"}
    assert "Write the review in Russian." in fake_ai.prompts[-1]
    assert start in fake_ai.prompts[-1]

    row = await db.scalar(select(AiUsage).where(AiUsage.user_id == uuid.UUID(owner.id)))
    assert (row.kind, row.input_tokens, row.output_tokens) == ("review", 2000, 800)
    assert float(row.cost_usd) > 0


async def test_monthly_budget_and_daily_limits(
    fake_ai, make_user: MakeUser, db, monkeypatch: pytest.MonkeyPatch
):
    owner = await make_user()
    diagram_id, _ = await diagram_with_start(owner)
    monkeypatch.setattr(settings, "ai_daily_reviews", 1)
    assert (await owner.client.post(f"/api/diagrams/{diagram_id}/ai/review", json={})).status_code == 200
    r = await owner.client.post(f"/api/diagrams/{diagram_id}/ai/review", json={})
    assert (r.status_code, r.json()["detail"]) == (429, "ai_daily_limit")

    db.add(
        AiUsage(
            user_id=None,
            kind="review",
            model="x",
            input_tokens=0,
            output_tokens=0,
            cost_usd=10_000,
            created_at=utcnow(),
        )
    )
    await db.commit()
    other = await make_user()
    other_diagram, _ = await diagram_with_start(other)
    r = await other.client.post(f"/api/diagrams/{other_diagram}/ai/review", json={})
    assert (r.status_code, r.json()["detail"]) == (429, "ai_budget_exhausted")
    status = (await other.client.get("/api/ai/status")).json()
    assert (status["available"], status["reason"]) == (False, "ai_budget_exhausted")


async def test_suggestions_for_the_selected_element(fake_ai, make_user: MakeUser):
    owner = await make_user()
    diagram_id, start = await diagram_with_start(owner)
    fake_ai.suggestions = {
        "suggestions": [
            {
                "title": "Check the order",
                "ops": [
                    {
                        "op": "add",
                        "ref": "new1",
                        "type": "bpmn:UserTask",
                        "name": "Check order",
                        "after": start,
                    }
                ],
            },
            {
                "title": "Nonsense",
                "ops": [{"op": "add", "ref": "new1", "type": "bpmn:Banana", "name": "Fruit", "after": start}],
            },
        ]
    }
    r = await owner.client.post(f"/api/diagrams/{diagram_id}/ai/suggest", json={"elementId": start})
    assert r.status_code == 200, r.text
    assert [s["title"] for s in r.json()["suggestions"]] == ["Check the order"]
    r = await owner.client.post(f"/api/diagrams/{diagram_id}/ai/suggest", json={"elementId": "Nope"})
    assert r.status_code == 400


async def test_command_answers_questions_without_changes(fake_ai, make_user: MakeUser, db):
    owner = await make_user()
    diagram_id, start = await diagram_with_start(owner)
    fake_ai.commands = [{"reply": f"It starts at [{start}].", "ops": []}]
    r = await owner.client.post(
        f"/api/diagrams/{diagram_id}/ai/command",
        json={"messages": [{"role": "user", "text": "Where does it start?"}], "selection": [start, "Nope"]},
    )
    assert r.status_code == 200, r.text
    assert r.json()["reply"] == f"It starts at [{start}]." and r.json()["ops"] == []
    assert f"- {start} (startEvent)" in fake_ai.prompts[-1] and "Nope" not in fake_ai.prompts[-1]
    count = await db.scalar(select(func.count()).where(AiUsage.kind == "chat"))
    assert count == 1


async def test_command_returns_a_checked_change(fake_ai, make_user: MakeUser):
    owner = await make_user()
    diagram_id, start = await diagram_with_start(owner)
    change = {"op": "add", "ref": "new1", "type": "bpmn:EndEvent", "name": "Done", "after": start}
    fake_ai.commands = [{"reply": "Added an end.", "title": "Finish the process", "ops": [change]}]
    r = await owner.client.post(
        f"/api/diagrams/{diagram_id}/ai/command",
        json={"messages": [{"role": "user", "text": "Finish this"}], "selection": [start]},
    )
    body = r.json()
    assert (body["title"], body["rejected"], body["ops"][0]["op"]) == ("Finish the process", False, "add")
    assert body["resolves"]


async def test_command_that_introduces_problems_is_corrected(fake_ai, make_user: MakeUser):
    owner = await make_user()
    diagram_id, start = await diagram_with_start(owner)
    fake_ai.commands = [
        {
            "reply": "Added.",
            "title": "Dangling",
            "ops": [{"op": "add", "ref": "n", "type": "bpmn:Task", "name": "Work", "after": start}],
        },
        {
            "reply": "Added.",
            "title": "Finish",
            "ops": [{"op": "add", "ref": "n", "type": "bpmn:EndEvent", "name": "Done", "after": start}],
        },
    ]
    r = await owner.client.post(
        f"/api/diagrams/{diagram_id}/ai/command", json={"messages": [{"role": "user", "text": "Continue"}]}
    )
    assert r.json()["title"] == "Finish" and r.json()["sideEffects"] == []
    assert "found a problem" in fake_ai.prompts[-1]


async def test_rejected_command_is_retried_once_then_dropped(fake_ai, make_user: MakeUser, db):
    owner = await make_user()
    diagram_id, start = await diagram_with_start(owner)
    broken = {"op": "connect", "source": start, "target": "Ghost"}
    fake_ai.commands = [
        {"reply": "Connected.", "title": "Connect", "ops": [broken]},
        {"reply": "Connected.", "title": "Connect", "ops": [broken]},
    ]
    r = await owner.client.post(
        f"/api/diagrams/{diagram_id}/ai/command", json={"messages": [{"role": "user", "text": "Connect it"}]}
    )
    body = r.json()
    assert (body["rejected"], body["ops"]) == (True, [])
    assert "found a problem" in fake_ai.prompts[-1] and "Ghost" in fake_ai.prompts[-1]
    assert await db.scalar(select(func.count()).where(AiUsage.kind == "chat")) == 2


def test_operation_validation():
    graph = build_graph(bpmn(LINEAR))
    ok = validate_ops(
        [
            Op(op="add", ref="new1", type="bpmn:ExclusiveGateway", name="Valid?", after="A"),
            Op(op="add", ref="new2", type="bpmn:EndEvent", name="Rejected", after="new1"),
            Op(op="connect", source="new1", target="E"),
            Op(op="rename", element="A", name="Check order"),
            Op(op="retype", element="A", type="bpmn:UserTask"),
            Op(op="add", ref="new3", type="bpmn:BoundaryEvent", event="timer", attach_to="A", name="2 days"),
            Op(op="set_default", element="A", flow="f2"),
            Op(op="label_flow", flow="f2", name="ok"),
        ],
        graph,
    )
    assert len(ok) == 8
    bad = [
        [Op(op="add", ref="A", type="bpmn:Task")],
        [Op(op="add", ref="n", type="bpmn:Wizard")],
        [Op(op="add", ref="n", type="bpmn:Task", event="timer")],
        [Op(op="add", ref="n", type="bpmn:BoundaryEvent", attach_to="S")],
        [Op(op="connect", source="A", target="A")],
        [Op(op="connect", source="A", target="Missing")],
        [Op(op="retype", element="S", type="bpmn:Task")],
        [Op(op="set_default", element="A", flow="f1")],
        [Op(op="remove", element="Missing")],
        [Op(op="rename", element="A", name="")],
    ]
    for ops in bad:
        with pytest.raises(InvalidOps):
            validate_ops(ops, graph)


def test_latest_model_is_picked_by_version():
    names = [
        "gemini-2.5-pro",
        "gemini-3-pro",
        "gemini-3.5-pro-preview",
        "gemini-3.1-pro",
        "gemini-3.8-flash",
        "gemini-3-flash",
    ]
    assert pick_latest(names, "smart") == "gemini-3.1-pro"
    assert pick_latest(names, "fast") == "gemini-3.8-flash"
    assert pick_latest([], "fast") is None
    assert AiSuggestions.model_validate({"suggestions": []}).suggestions == []


async def test_generation_repairs_problems_found_by_the_checks(fake_ai, make_user: MakeUser, db):
    owner = await make_user()
    project = await create_project(owner)
    draft = {
        "name": "Leave request",
        "nodes": [
            {"id": "Start", "type": "bpmn:StartEvent", "name": "Request submitted"},
            {"id": "Approve", "type": "bpmn:UserTask", "name": "Manager approves"},
        ],
        "flows": [{"id": "f1", "source": "Start", "target": "Approve"}],
    }
    fixed = {
        "name": "Leave request",
        "nodes": draft["nodes"]
        + [
            {"id": "Ok", "type": "bpmn:ExclusiveGateway", "name": "Approved?"},
            {"id": "Done", "type": "bpmn:EndEvent", "name": "Leave granted"},
            {"id": "No", "type": "bpmn:EndEvent", "name": "Leave refused"},
        ],
        "flows": [
            {"id": "f1", "source": "Start", "target": "Approve"},
            {"id": "f2", "source": "Approve", "target": "Ok"},
            {"id": "f3", "source": "Ok", "target": "Done", "name": "yes"},
            {"id": "f4", "source": "Ok", "target": "No", "name": "no", "default": True},
        ],
    }
    fake_ai.processes = [draft, fixed]
    r = await owner.client.post(
        f"/api/projects/{project['id']}/ai/generate",
        json={"description": "Employees request leave; a manager decides."},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert (body["name"], body["rounds"]) == ("Leave request", 1)
    assert "no-implicit-end" in fake_ai.prompts[-1] or "end-event-required" in fake_ai.prompts[-1]
    assert 'default="f4"' in body["xml"] and 'name="Approved?"' in body["xml"]
    assert [f for f in body["findings"] if f["severity"] != "info"] == []
    kinds = sorted(k for (k,) in (await db.execute(select(AiUsage.kind))).all())
    assert kinds == ["generate", "generate_fix"]


async def test_generation_needs_edit_access(fake_ai, make_user: MakeUser):
    owner = await make_user()
    project = await create_project(owner)
    stranger = await make_user()
    r = await stranger.client.post(
        f"/api/projects/{project['id']}/ai/generate", json={"description": "Anything at all"}
    )
    assert r.status_code in (403, 404)
