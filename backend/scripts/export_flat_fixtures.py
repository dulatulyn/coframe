import json
from pathlib import Path

from app.bpmn.flat import flatten_xml, reconstruct_xml
from app.ordering import n_keys_between

ROOT = Path(__file__).resolve().parents[2] / "shared" / "fixtures"


def main() -> None:
    out = ROOT / "flat"
    out.mkdir(exist_ok=True)
    for path in sorted((ROOT / "bpmn").glob("*.bpmn")):
        entries = flatten_xml(path.read_text())
        (out / f"{path.stem}.json").write_text(
            json.dumps(entries, indent=1, sort_keys=True, ensure_ascii=False) + "\n"
        )
        (out / f"{path.stem}.xml").write_text(reconstruct_xml(entries))
    samples = {
        "sequential": n_keys_between(None, None, 70),
        "between": n_keys_between("a0", "a1", 20),
        "before": n_keys_between(None, "a0", 10),
    }
    (ROOT / "order-keys.json").write_text(json.dumps(samples, indent=1) + "\n")


if __name__ == "__main__":
    main()
