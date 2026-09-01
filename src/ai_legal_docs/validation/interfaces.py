from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol


@dataclass(frozen=True)
class ValidationIssue:
    code: str
    message: str


class DocumentValidator(Protocol):
    def validate(self, path: Path) -> list[ValidationIssue]: ...
