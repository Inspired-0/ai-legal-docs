from __future__ import annotations

import json
import re
from typing import Any

from ai_legal_docs.templates.schema import FieldSpec

from .interfaces import TextCompletion

_JSON_OBJECT = re.compile(r"\{.*\}", re.DOTALL)
_FENCE = re.compile(r"^```[a-zA-Z]*\s*|\s*```$")


def _parse_object(raw: str) -> dict[str, Any]:
    text = raw.strip()
    if text.startswith("```"):
        text = _FENCE.sub("", text).strip()
    match = _JSON_OBJECT.search(text)
    if match:
        text = match.group(0)
    value = json.loads(text)
    if not isinstance(value, dict):
        raise ValueError("LLM response must be a JSON object")
    return value


def _field_prompt(field: FieldSpec) -> str:
    if field.type == "list":
        keys = ", ".join(item.name for item in field.item_fields)
        return f"- {field.name}: array of objects with keys {keys}"
    return f"- {field.name}: string"


def _normalize(field: FieldSpec, value: Any) -> Any:
    if value is None:
        return None
    if field.type == "list":
        if not isinstance(value, list):
            return None
        allowed = {item.name for item in field.item_fields}
        return [
            {key: "" if item is None else str(item) for key, item in row.items() if key in allowed}
            for row in value
            if isinstance(row, dict)
        ]
    return str(value)


class JsonLLMExtractor:
    """Use an LLM only to extract data, never to write contract clauses."""

    def __init__(self, client: TextCompletion, attempts: int = 2) -> None:
        if attempts < 1:
            raise ValueError("attempts must be positive")
        self.client = client
        self.attempts = attempts

    def extract(self, text: str, fields: list[FieldSpec]) -> dict[str, Any]:
        user_fields = [field for field in fields if field.source == "user"]
        prompt = (
            "Extract only values explicitly present in the request. "
            "Return one JSON object and no commentary. Do not invent values.\n"
            + "\n".join(_field_prompt(field) for field in user_fields)
            + f"\nRequest:\n{text}"
        )
        by_name = {field.name: field for field in user_fields}
        last_error: Exception | None = None
        for _ in range(self.attempts):
            try:
                raw = _parse_object(self.client.complete(prompt))
            except (json.JSONDecodeError, ValueError) as error:
                last_error = error
                prompt += "\nThe previous answer was invalid. Return valid JSON only."
                continue
            return {
                name: _normalize(by_name[name], value)
                for name, value in raw.items()
                if name in by_name
            }
        raise ValueError(f"Could not parse LLM output after {self.attempts} attempts: {last_error}")
