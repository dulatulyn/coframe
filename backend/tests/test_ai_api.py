import json
import uuid

import pytest
from sqlalchemy import func, select

from app.ai.graph import build_graph
from app.ai.llm import Usage, pick_latest, set_provider
from app.ai.ops import InvalidOps, Op, validate_ops
from app.ai.results import AiReview, AiSuggestions
from app.config import settings
from app.db import utcnow
from app.models import AiUsage
from tests.conftest import MakeUser, create_project, get_tree, new_client
from tests.test_ai_checks import LINEAR, bpmn


class FakeProvider:
    def __init__(self) -> None:
        self.review: dict = {"summary": "", "verdict": "solid", "issues": [], "improvements": []}
        self.suggestions: dict = {"suggestions": []}
        self.chunks: list[str] = []
        self.prompts: list[str] = []

    async def generate_json(self, tier, system, prompt, schema):
        self.prompts.append(prompt)
        data = self.review if schema is AiReview else self.suggestions
        return schema.model_validate(data), Usage(
            f"gemini-test-{'pro' if tier == 'smart' else 'flash'}", 2000, 800
        )

    async def stream_text(self, tier, system, contents):
        self.prompts.append(contents[-1][1])
        for chunk in self.chunks:
            yield chunk
        yield Usage("gemini-test-pro", 1500, 300)


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
                "ops": [{"op": "add", "ref": "new1", "type": "bpmn:Banana", "after": start}],
            },
        ]
    }
    r = await owner.client.post(f"/api/diagrams/{diagram_id}/ai/suggest", json={"elementId": start})
    assert r.status_code == 200, r.text
    assert [s["title"] for s in r.json()["suggestions"]] == ["Check the order"]
    r = await owner.client.post(f"/api/diagrams/{diagram_id}/ai/suggest", json={"elementId": "Nope"})
    assert r.status_code == 400


async def test_chat_streams_an_answer_and_records_usage(fake_ai, make_user: MakeUser, db):
    owner = await make_user()
    diagram_id, start = await diagram_with_start(owner)
    fake_ai.chunks = ["The process ", f"starts at [{start}]."]
    r = await owner.client.post(
        f"/api/diagrams/{diagram_id}/ai/chat",
        json={"messages": [{"role": "user", "text": "Where does it start?"}]},
    )
    assert r.status_code == 200
    events = [json.loads(line[6:]) for line in r.text.splitlines() if line.startswith("data: ")]
    assert "".join(e.get("delta", "") for e in events) == f"The process starts at [{start}]."
    assert events[-1] == {"done": True}
    count = await db.scalar(select(func.count()).where(AiUsage.kind == "chat"))
    assert count == 1


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
