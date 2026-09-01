from __future__ import annotations

import json
from pathlib import Path

from ai_legal_docs.templates import load_field_specs, resolve_values
from ai_legal_docs.templates.schema import FieldSpec
from ai_legal_docs.validation import RequiredFieldsValidator

ROOT = Path(__file__).resolve().parents[1]


def test_required_and_optional_fields() -> None:
    specs = [
        FieldSpec("required_value", required=True),
        FieldSpec("optional_value", required=False),
    ]
    issues = RequiredFieldsValidator(specs).validate_values(
        {"required_value": "", "optional_value": ""}
    )
    assert [issue.message for issue in issues] == ["Required field is empty: required_value"]


def test_list_slots_total_and_amount_in_words() -> None:
    specs = load_field_specs(ROOT / "templates" / "synthetic-service-agreement" / "fields.yaml")
    extracted = json.loads((ROOT / "examples" / "expected-fields.json").read_text(encoding="utf-8"))
    values, missing = resolve_values(specs, extracted)
    assert missing == []
    assert [row["amount"] for row in values["services"]] == ["3000.00", "4000.00"]
    assert values["total_amount"] == "7000.00"
    assert values["total_in_words"] == "семь тысяч рублей 00 копеек"


def test_missing_required_list_is_reported() -> None:
    specs = load_field_specs(ROOT / "templates" / "synthetic-service-agreement" / "fields.yaml")
    values, missing = resolve_values(specs, {})
    assert values["services"] == []
    assert "services" in missing
    assert "total_amount" in missing
