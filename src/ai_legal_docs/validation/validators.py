from __future__ import annotations

from pathlib import Path
from typing import Any

from docx import Document

from ai_legal_docs.templates import FieldSpec, find_unfilled_slots

from .interfaces import DocumentValidator, ValidationIssue


class RequiredFieldsValidator:
    def __init__(self, specs: list[FieldSpec]) -> None:
        self.specs = specs

    def validate_values(self, values: dict[str, Any]) -> list[ValidationIssue]:
        return [
            ValidationIssue("required", f"Required field is empty: {spec.name}")
            for spec in self.specs
            if spec.required and not values.get(spec.name)
        ]


class RenderedDocumentValidator:
    """Check deterministic invariants of the filled document."""

    def validate(self, path: Path) -> list[ValidationIssue]:
        issues: list[ValidationIssue] = []
        if find_unfilled_slots(path):
            issues.append(ValidationIssue("unfilled_slot", "The document contains template slots"))
        document = Document(str(path))
        text = "\n".join(paragraph.text for paragraph in document.paragraphs)
        if "SYNTHETIC DEMO" not in text:
            issues.append(ValidationIssue("demo_mark", "The document has no SYNTHETIC DEMO mark"))
        if not document.tables or len(document.tables[0].rows) < 3:
            issues.append(
                ValidationIssue("services_table", "The services table is missing or empty")
            )
        return issues


class CompositeValidator:
    def __init__(self, validators: list[DocumentValidator]) -> None:
        self.validators = validators

    def validate(self, path: Path) -> list[ValidationIssue]:
        return [issue for validator in self.validators for issue in validator.validate(path)]
