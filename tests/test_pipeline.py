from __future__ import annotations

import json
from pathlib import Path

from docx import Document

from ai_legal_docs import PipelineStatus, run_pipeline
from ai_legal_docs.extraction import MockExtractor
from ai_legal_docs.templates import find_unfilled_slots

ROOT = Path(__file__).resolve().parents[1]
FIELDS = ROOT / "templates" / "synthetic-service-agreement" / "fields.yaml"
TEMPLATE = ROOT / "templates" / "synthetic-service-agreement" / "template.docx"


def demo_values() -> dict:
    return json.loads((ROOT / "examples" / "expected-fields.json").read_text(encoding="utf-8"))


def test_pipeline_requests_missing_fields(tmp_path: Path) -> None:
    result = run_pipeline("demo", MockExtractor({}), FIELDS, TEMPLATE, tmp_path)
    assert result.status == PipelineStatus.NEEDS_INPUT
    assert "agreement_number" in result.missing
    assert result.output_path is None


def test_pipeline_renders_and_validates_document(tmp_path: Path) -> None:
    result = run_pipeline("demo", MockExtractor(demo_values()), FIELDS, TEMPLATE, tmp_path)
    assert result.status == PipelineStatus.DONE
    assert result.output_path is not None
    assert result.issues == ()
    assert find_unfilled_slots(result.output_path) == []

    document = Document(str(result.output_path))
    paragraphs = "\n".join(paragraph.text for paragraph in document.paragraphs)
    table_text = "\n".join(cell.text for row in document.tables[0].rows for cell in row.cells)
    assert "SYNTHETIC DEMO" in paragraphs
    assert "ООО «Пример»" in paragraphs
    assert "Иван Иванов" in paragraphs
    assert "7000.00" in table_text
    assert len(document.tables[0].rows) == 4
