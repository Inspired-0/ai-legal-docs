from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from docx import Document
from docxtpl import DocxTemplate

_SLOT = re.compile(r"{{.*?}}|{%.*?%}", re.DOTALL)


def render_docx(template: str | Path, values: dict[str, Any], output: str | Path) -> Path:
    document = DocxTemplate(str(template))
    document.render(values)
    target = Path(output)
    target.parent.mkdir(parents=True, exist_ok=True)
    document.save(str(target))
    return target


def _all_text(path: str | Path) -> str:
    document = Document(str(path))
    chunks = [paragraph.text for paragraph in document.paragraphs]
    for table in document.tables:
        for row in table.rows:
            for cell in row.cells:
                chunks.append(cell.text)
    for section in document.sections:
        chunks.extend(paragraph.text for paragraph in section.header.paragraphs)
        chunks.extend(paragraph.text for paragraph in section.footer.paragraphs)
    return "\n".join(chunks)


def find_unfilled_slots(path: str | Path) -> list[str]:
    return _SLOT.findall(_all_text(path))
