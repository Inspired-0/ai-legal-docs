from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path

from ai_legal_docs.extraction.interfaces import Extractor
from ai_legal_docs.storage import LocalOutputStore
from ai_legal_docs.templates import load_field_specs, render_docx, resolve_values
from ai_legal_docs.validation import RenderedDocumentValidator, ValidationIssue


class PipelineStatus(StrEnum):
    DONE = "done"
    NEEDS_INPUT = "needs_input"
    FAILED = "failed"


@dataclass(frozen=True)
class PipelineResult:
    status: PipelineStatus
    output_path: Path | None = None
    missing: tuple[str, ...] = ()
    issues: tuple[ValidationIssue, ...] = field(default_factory=tuple)


def run_pipeline(
    request: str,
    extractor: Extractor,
    fields_path: str | Path,
    template_path: str | Path,
    output_dir: str | Path,
) -> PipelineResult:
    specs = load_field_specs(fields_path)
    extracted = extractor.extract(request, specs)
    values, missing = resolve_values(specs, extracted)
    if missing:
        return PipelineResult(PipelineStatus.NEEDS_INPUT, missing=tuple(missing))

    output = LocalOutputStore(output_dir).path_for("synthetic-service-agreement.docx")
    render_docx(template_path, values, output)
    issues = tuple(RenderedDocumentValidator().validate(output))
    if issues:
        return PipelineResult(PipelineStatus.FAILED, output_path=output, issues=issues)
    return PipelineResult(PipelineStatus.DONE, output_path=output)
