from __future__ import annotations

from typing import Any, Protocol

from ai_legal_docs.templates.schema import FieldSpec


class TextCompletion(Protocol):
    """Small boundary around an LLM client.

    The project does not depend on a provider SDK. An application can adapt any
    provider to this one-method interface.
    """

    def complete(self, prompt: str) -> str: ...


class Extractor(Protocol):
    """Extract structured values from a user request."""

    def extract(self, text: str, fields: list[FieldSpec]) -> dict[str, Any]: ...
