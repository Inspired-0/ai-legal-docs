from __future__ import annotations

import json
from pathlib import Path

from ai_legal_docs import PipelineStatus, run_pipeline
from ai_legal_docs.extraction import MockExtractor

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    request = (ROOT / "examples" / "request.txt").read_text(encoding="utf-8")
    values = json.loads((ROOT / "examples" / "expected-fields.json").read_text(encoding="utf-8"))
    result = run_pipeline(
        request,
        MockExtractor(values),
        ROOT / "templates" / "synthetic-service-agreement" / "fields.yaml",
        ROOT / "templates" / "synthetic-service-agreement" / "template.docx",
        ROOT / "out",
    )
    print(result)
    return 0 if result.status == PipelineStatus.DONE else 1


if __name__ == "__main__":
    raise SystemExit(main())
