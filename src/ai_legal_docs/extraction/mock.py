from __future__ import annotations

from copy import deepcopy
from typing import Any

from ai_legal_docs.templates.schema import FieldSpec


class MockExtractor:
    """Deterministic extractor for tests and the public demo."""

    def __init__(self, values: dict[str, Any]) -> None:
        self.values = deepcopy(values)

    def extract(self, text: str, fields: list[FieldSpec]) -> dict[str, Any]:
        del text
        allowed = {field.name for field in fields if field.source == "user"}
        return {key: deepcopy(value) for key, value in self.values.items() if key in allowed}
