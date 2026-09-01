from __future__ import annotations

import json
import re
import zipfile
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "templates" / "synthetic-service-agreement" / "template.docx"
GOLDEN = ROOT / "tests" / "golden" / "template-structure.json"


def _structure() -> dict:
    document = Document(str(TEMPLATE))
    section = document.sections[0]
    table = document.tables[0]
    tbl_pr = table._tbl.tblPr
    tbl_w = tbl_pr.first_child_found_in("w:tblW")
    tbl_ind = tbl_pr.first_child_found_in("w:tblInd")
    grid = [int(column.get(qn("w:w"))) for column in table._tbl.tblGrid]
    tc_widths = [
        [int(cell._tc.tcPr.tcW.get(qn("w:w"))) for cell in row.cells] for row in table.rows
    ]
    with zipfile.ZipFile(TEMPLATE) as package:
        xml = package.read("word/document.xml").decode("utf-8")
    slots = sorted(set(re.findall(r"(?:{{.*?}}|{%.*?%})", xml)))
    return {
        "page": {
            "width_dxa": section.page_width.twips,
            "height_dxa": section.page_height.twips,
            "margins_dxa": [
                section.top_margin.twips,
                section.right_margin.twips,
                section.bottom_margin.twips,
                section.left_margin.twips,
            ],
        },
        "table": {
            "rows": len(table.rows),
            "columns": len(table.columns),
            "width_dxa": int(tbl_w.get(qn("w:w"))),
            "indent_dxa": int(tbl_ind.get(qn("w:w"))),
            "grid_dxa": grid,
            "all_cell_widths_match_grid": all(widths == grid for widths in tc_widths),
        },
        "slots": slots,
    }


def test_template_structure_matches_golden_file() -> None:
    expected = json.loads(GOLDEN.read_text(encoding="utf-8"))
    assert _structure() == expected


def test_template_metadata_is_scrubbed() -> None:
    with zipfile.ZipFile(TEMPLATE) as package:
        core = package.read("docProps/core.xml").decode("utf-8")
        assert "<dc:creator/>" in core or "<dc:creator></dc:creator>" in core
        assert "<cp:lastModifiedBy/>" in core or "<cp:lastModifiedBy></cp:lastModifiedBy>" in core
        assert "docProps/custom.xml" not in package.namelist()
        story_parts = [
            name
            for name in package.namelist()
            if name == "word/document.xml"
            or name.startswith("word/header")
            or name.startswith("word/footer")
        ]
        assert all(b"w:rsid" not in package.read(name) for name in story_parts)
