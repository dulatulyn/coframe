import asyncio
import sys
import time
from pathlib import Path

from app.ai import prompts
from app.ai.checks import run_checks
from app.ai.describe import describe
from app.ai.graph import build_graph
from app.ai.llm import provider
from app.ai.ops import InvalidOps, validate_ops
from app.ai.results import AiReview
from app.ai.simulate import evaluate

CASES = Path(__file__).resolve().parents[2] / "shared" / "fixtures" / "bpmn"


async def review(path: Path, xml: str, language: str) -> dict:
    graph = build_graph(xml)
    findings = run_checks(graph)
    prompt = f"Diagram:\n{describe(graph, findings)}\n\nWrite the review in {language}."
    started = time.monotonic()
    result, usage = await provider().generate_json("smart", prompts.REVIEW, prompt, AiReview)
    seconds = time.monotonic() - started
    mentioned = {e for issue in result.issues for e in issue.elements}
    expected = {e for f in findings if f.severity != "info" for e in f.elements}
    proposals = [i.fix.ops for i in result.issues if i.fix] + [i.ops for i in result.improvements]
    valid = broken = rejected = 0
    for ops in proposals:
        try:
            validate_ops(ops, graph)
        except InvalidOps as exc:
            rejected += 1
            print(f"  rejected: {exc} :: {[o.model_dump(exclude_none=True) for o in ops]}")
            continue
        if evaluate(graph, findings, ops).breaks_model:
            broken += 1
        else:
            valid += 1
    return {
        "file": path.name,
        "verdict": result.verdict,
        "issues": len(result.issues),
        "covered": f"{len(expected & mentioned)}/{len(expected)}",
        "proposals": f"{valid} ok, {broken} break the model, {rejected} invalid",
        "tokens": f"{usage.input_tokens}+{usage.output_tokens}",
        "cost": f"${usage.cost_usd:.4f}",
        "seconds": round(seconds, 1),
        "model": usage.model,
    }


async def main() -> None:
    language = sys.argv[1] if len(sys.argv) > 1 else "English"
    total = 0.0
    for path in sorted(CASES.glob("*.bpmn")):
        try:
            row = await review(path, path.read_text(), language)
        except Exception as exc:
            print(f"{path.name}: failed: {exc}")
            continue
        total += float(row["cost"].lstrip("$"))
        print(" | ".join(f"{k}={v}" for k, v in row.items()))
    print(f"total cost ${total:.4f}")


if __name__ == "__main__":
    asyncio.run(main())
