from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml


@dataclass(frozen=True)
class ItemField:
    name: str
    label: str = ""


@dataclass(frozen=True)
class FieldSpec:
    name: str
    label: str = ""
    required: bool = False
    source: str = "user"
    type: str = "scalar"
    item_fields: tuple[ItemField, ...] = field(default_factory=tuple)


def load_field_specs(path: str | Path) -> list[FieldSpec]:
    raw = yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}
    items = raw.get("fields", [])
    specs: list[FieldSpec] = []
    for item in items:
        specs.append(
            FieldSpec(
                name=item["name"],
                label=item.get("label", ""),
                required=bool(item.get("required", False)),
                source=item.get("source", "user"),
                type=item.get("type", "scalar"),
                item_fields=tuple(
                    ItemField(name=child["name"], label=child.get("label", ""))
                    for child in item.get("item_fields", [])
                ),
            )
        )
    return specs
