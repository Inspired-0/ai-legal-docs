from __future__ import annotations

import pytest

from ai_legal_docs.extraction import JsonLLMExtractor, MockExtractor
from ai_legal_docs.templates.schema import FieldSpec, ItemField


class FakeCompletion:
    def __init__(self, replies: list[str]) -> None:
        self.replies = iter(replies)
        self.prompts: list[str] = []

    def complete(self, prompt: str) -> str:
        self.prompts.append(prompt)
        return next(self.replies)


FIELDS = [
    FieldSpec("customer_name", required=True),
    FieldSpec(
        "services",
        required=True,
        type="list",
        item_fields=(ItemField("name"), ItemField("quantity"), ItemField("price")),
    ),
    FieldSpec("total_amount", required=True, source="computed"),
]


def test_mock_extractor_returns_only_user_fields() -> None:
    extractor = MockExtractor({"customer_name": "ООО «Пример»", "total_amount": "7000"})
    assert extractor.extract("ignored", FIELDS) == {"customer_name": "ООО «Пример»"}


def test_json_extractor_normalizes_list_and_filters_unknown_keys() -> None:
    completion = FakeCompletion(
        [
            '```json\n{"customer_name":"ООО «Пример»","services":'
            '[{"name":"Анализ","quantity":2,"price":1500,"secret":"drop"}]}\n```'
        ]
    )
    result = JsonLLMExtractor(completion).extract("demo", FIELDS)
    assert result == {
        "customer_name": "ООО «Пример»",
        "services": [{"name": "Анализ", "quantity": "2", "price": "1500"}],
    }


def test_json_extractor_retries_invalid_json() -> None:
    completion = FakeCompletion(["not json", '{"customer_name":"ООО «Пример»"}'])
    result = JsonLLMExtractor(completion, attempts=2).extract("demo", FIELDS)
    assert result["customer_name"] == "ООО «Пример»"
    assert len(completion.prompts) == 2


def test_json_extractor_fails_after_retry_budget() -> None:
    completion = FakeCompletion(["bad", "still bad"])
    with pytest.raises(ValueError, match="Could not parse"):
        JsonLLMExtractor(completion, attempts=2).extract("demo", FIELDS)
