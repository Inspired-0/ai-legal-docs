from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any

from num2words import num2words

from .schema import FieldSpec


def _money(value: Any) -> Decimal | None:
    normalized = str(value).replace("\u00a0", "").replace(" ", "").replace(",", ".")
    try:
        return Decimal(normalized).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except InvalidOperation:
        return None


def _format_money(value: Decimal) -> str:
    return f"{value:.2f}"


def _normalize_rows(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    return [
        {str(key): "" if item is None else str(item) for key, item in row.items()}
        for row in value
        if isinstance(row, dict)
    ]


def _compute_rows(rows: list[dict[str, str]]) -> None:
    for index, row in enumerate(rows, start=1):
        row["number"] = str(index)
        price = _money(row.get("price", ""))
        quantity = _money(row.get("quantity", ""))
        if price is not None and quantity is not None:
            row["amount"] = _format_money(price * quantity)


def _total(rows: list[dict[str, str]]) -> Decimal | None:
    values = [_money(row.get("amount", "")) for row in rows]
    if not values or any(value is None for value in values):
        return None
    return sum((value for value in values if value is not None), Decimal("0.00"))


def _amount_in_words(total: Decimal | None) -> str:
    if total is None:
        return ""
    rubles = int(total)
    kopecks = int((total - Decimal(rubles)) * 100)
    return f"{num2words(rubles, lang='ru')} рублей {kopecks:02d} копеек"


def resolve_values(
    specs: list[FieldSpec], extracted: dict[str, Any]
) -> tuple[dict[str, Any], list[str]]:
    """Normalize fields and compute deterministic values."""

    values: dict[str, Any] = {}
    for spec in specs:
        if spec.type == "list":
            values[spec.name] = _normalize_rows(extracted.get(spec.name))
        elif spec.source == "user":
            raw = extracted.get(spec.name)
            values[spec.name] = "" if raw is None else str(raw)
        else:
            values[spec.name] = ""

    services = values.get("services")
    if isinstance(services, list):
        _compute_rows(services)
        total = _total(services)
        values["total_amount"] = "" if total is None else _format_money(total)
        values["total_in_words"] = _amount_in_words(total)

    missing = [spec.name for spec in specs if spec.required and not values.get(spec.name)]
    return values, missing
