"""Build the public synthetic DOCX template from code."""

from __future__ import annotations

from pathlib import Path

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "templates" / "synthetic-service-agreement" / "template.docx"

FONT = "Calibri"
BLUE = RGBColor(0x2E, 0x74, 0xB5)
DARK_BLUE = RGBColor(0x1F, 0x4D, 0x78)
GRAY = RGBColor(0x55, 0x55, 0x55)
LIGHT_GRAY = "F2F4F7"
RED = RGBColor(0x9B, 0x1C, 0x1C)
TABLE_WIDTHS = [720, 4320, 1080, 1440, 1800]
TABLE_WIDTH_DXA = 9360
TABLE_INDENT_DXA = 120
CELL_MARGINS = {"top": 80, "start": 120, "bottom": 80, "end": 120}


def set_font(run, *, size: float, bold: bool = False, color: RGBColor | None = None) -> None:
    run.font.name = FONT
    run._element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:ascii"), FONT)
    run._element.rPr.rFonts.set(qn("w:hAnsi"), FONT)
    run._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    run.font.size = Pt(size)
    run.bold = bold
    if color is not None:
        run.font.color.rgb = color


def configure_styles(document: Document) -> None:
    styles = document.styles
    normal = styles["Normal"]
    normal.font.name = FONT
    normal._element.rPr.rFonts.set(qn("w:ascii"), FONT)
    normal._element.rPr.rFonts.set(qn("w:hAnsi"), FONT)
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    normal.font.size = Pt(11)
    normal.paragraph_format.space_before = Pt(0)
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.10

    title = styles["Title"]
    title.font.name = FONT
    title._element.rPr.rFonts.set(qn("w:ascii"), FONT)
    title._element.rPr.rFonts.set(qn("w:hAnsi"), FONT)
    title.font.size = Pt(23)
    title.font.bold = True
    title.font.color.rgb = RGBColor(0, 0, 0)
    title.paragraph_format.space_before = Pt(0)
    title.paragraph_format.space_after = Pt(4)

    subtitle = styles["Subtitle"]
    subtitle.font.name = FONT
    subtitle._element.rPr.rFonts.set(qn("w:ascii"), FONT)
    subtitle._element.rPr.rFonts.set(qn("w:hAnsi"), FONT)
    subtitle.font.size = Pt(14)
    subtitle.font.color.rgb = GRAY
    subtitle.paragraph_format.space_before = Pt(0)
    subtitle.paragraph_format.space_after = Pt(16)

    for name, size, color, before, after in (
        ("Heading 1", 16, BLUE, 16, 8),
        ("Heading 2", 13, BLUE, 12, 6),
        ("Heading 3", 12, DARK_BLUE, 8, 4),
    ):
        style = styles[name]
        style.font.name = FONT
        style._element.rPr.rFonts.set(qn("w:ascii"), FONT)
        style._element.rPr.rFonts.set(qn("w:hAnsi"), FONT)
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = color
        style.paragraph_format.space_before = Pt(before)
        style.paragraph_format.space_after = Pt(after)
        style.paragraph_format.keep_with_next = True


def configure_page(document: Document) -> None:
    section = document.sections[0]
    section.orientation = WD_ORIENT.PORTRAIT
    section.page_width = Inches(8.5)
    section.page_height = Inches(11)
    section.top_margin = Inches(1)
    section.right_margin = Inches(1)
    section.bottom_margin = Inches(1)
    section.left_margin = Inches(1)
    section.header_distance = Inches(0.492)
    section.footer_distance = Inches(0.492)


def add_field(paragraph, instruction: str) -> None:
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    code = OxmlElement("w:instrText")
    code.set(qn("xml:space"), "preserve")
    code.text = instruction
    separate = OxmlElement("w:fldChar")
    separate.set(qn("w:fldCharType"), "separate")
    text = OxmlElement("w:t")
    text.text = "1"
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    for element in (begin, code, separate, text, end):
        paragraph._p.append(element)


def configure_header_footer(document: Document) -> None:
    section = document.sections[0]
    header = section.header.paragraphs[0]
    header.alignment = WD_ALIGN_PARAGRAPH.LEFT
    header.paragraph_format.space_after = Pt(0)
    set_font(header.add_run("AI Legal Docs | synthetic template"), size=9, color=GRAY)

    footer = section.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    footer.paragraph_format.space_before = Pt(0)
    footer.paragraph_format.space_after = Pt(0)
    set_font(footer.add_run("SYNTHETIC DEMO  |  Страница "), size=9, color=GRAY)
    add_field(footer, " PAGE ")


def set_repeat_header(row) -> None:
    tr_pr = row._tr.get_or_add_trPr()
    element = OxmlElement("w:tblHeader")
    element.set(qn("w:val"), "true")
    tr_pr.append(element)


def set_cell_margins(cell) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for edge, value in CELL_MARGINS.items():
        element = tc_mar.find(qn(f"w:{edge}"))
        if element is None:
            element = OxmlElement(f"w:{edge}")
            tc_mar.append(element)
        element.set(qn("w:w"), str(value))
        element.set(qn("w:type"), "dxa")


def set_table_geometry(table) -> None:
    table.autofit = False
    tbl_pr = table._tbl.tblPr
    tbl_w = tbl_pr.first_child_found_in("w:tblW")
    if tbl_w is None:
        tbl_w = OxmlElement("w:tblW")
        tbl_pr.append(tbl_w)
    tbl_w.set(qn("w:w"), str(TABLE_WIDTH_DXA))
    tbl_w.set(qn("w:type"), "dxa")
    tbl_indent = tbl_pr.first_child_found_in("w:tblInd")
    if tbl_indent is None:
        tbl_indent = OxmlElement("w:tblInd")
        tbl_pr.append(tbl_indent)
    tbl_indent.set(qn("w:w"), str(TABLE_INDENT_DXA))
    tbl_indent.set(qn("w:type"), "dxa")

    grid = table._tbl.tblGrid
    for child in list(grid):
        grid.remove(child)
    for width in TABLE_WIDTHS:
        column = OxmlElement("w:gridCol")
        column.set(qn("w:w"), str(width))
        grid.append(column)

    for row in table.rows:
        for index, cell in enumerate(row.cells):
            width = TABLE_WIDTHS[index]
            tc_pr = cell._tc.get_or_add_tcPr()
            tc_w = tc_pr.first_child_found_in("w:tcW")
            if tc_w is None:
                tc_w = OxmlElement("w:tcW")
                tc_pr.append(tc_w)
            tc_w.set(qn("w:w"), str(width))
            tc_w.set(qn("w:type"), "dxa")
            cell.width = Inches(width / 1440)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            set_cell_margins(cell)


def shade(cell, fill: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.first_child_found_in("w:shd")
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def put(cell, text: str, *, bold: bool = False, align=WD_ALIGN_PARAGRAPH.LEFT) -> None:
    paragraph = cell.paragraphs[0]
    paragraph.alignment = align
    paragraph.paragraph_format.space_before = Pt(0)
    paragraph.paragraph_format.space_after = Pt(0)
    paragraph.paragraph_format.line_spacing = 1.10
    run = paragraph.add_run(text)
    set_font(run, size=10.5, bold=bold)


def add_services_table(document: Document) -> None:
    table = document.add_table(rows=5, cols=5)
    table.style = "Table Grid"
    headers = ["№", "Услуга", "Кол-во", "Цена, руб.", "Сумма, руб."]
    for cell, text in zip(table.rows[0].cells, headers, strict=True):
        put(cell, text, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)
        shade(cell, LIGHT_GRAY)
    set_repeat_header(table.rows[0])

    put(table.rows[1].cells[0], "{%tr for service in services %}")
    for index, value in enumerate(
        (
            "{{ service.number }}",
            "{{ service.name }}",
            "{{ service.quantity }} {{ service.unit }}",
            "{{ service.price }}",
            "{{ service.amount }}",
        )
    ):
        align = WD_ALIGN_PARAGRAPH.LEFT if index == 1 else WD_ALIGN_PARAGRAPH.CENTER
        put(table.rows[2].cells[index], value, align=align)
    put(table.rows[3].cells[0], "{%tr endfor %}")
    put(table.rows[4].cells[3], "Итого", bold=True, align=WD_ALIGN_PARAGRAPH.RIGHT)
    put(table.rows[4].cells[4], "{{ total_amount }}", bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)
    for cell in table.rows[4].cells:
        shade(cell, LIGHT_GRAY)
    set_table_geometry(table)


def add_labeled_paragraph(document: Document, label: str, value: str) -> None:
    paragraph = document.add_paragraph()
    paragraph.paragraph_format.space_after = Pt(3)
    set_font(paragraph.add_run(f"{label} "), size=11, bold=True)
    set_font(paragraph.add_run(value), size=11)


def build() -> Path:
    document = Document()
    configure_page(document)
    configure_styles(document)
    configure_header_footer(document)

    demo = document.add_paragraph()
    demo.paragraph_format.space_after = Pt(2)
    set_font(demo.add_run("SYNTHETIC DEMO"), size=11, bold=True, color=RED)

    title = document.add_paragraph("ДОГОВОР ОКАЗАНИЯ УСЛУГ", style="Title")
    title.alignment = WD_ALIGN_PARAGRAPH.LEFT
    subtitle = document.add_paragraph(
        "Демонстрационный шаблон. Не является юридической консультацией.",
        style="Subtitle",
    )
    subtitle.alignment = WD_ALIGN_PARAGRAPH.LEFT

    add_labeled_paragraph(document, "Номер", "{{ agreement_number }}")
    add_labeled_paragraph(document, "Дата", "{{ agreement_date }}")

    document.add_paragraph("Предмет договора", style="Heading 1")
    document.add_paragraph(
        "Исполнитель оказывает демонстрационные услуги из таблицы ниже, а Заказчик принимает "
        "результат и оплачивает согласованную стоимость. Этот текст создан только для проверки "
        "работы программного конвейера."
    )
    add_services_table(document)
    total_words = document.add_paragraph()
    total_words.paragraph_format.space_before = Pt(4)
    set_font(total_words.add_run("Итого прописью: "), size=11, bold=True)
    set_font(total_words.add_run("{{ total_in_words }}"), size=11)

    document.add_paragraph("Порядок выполнения", style="Heading 1")
    document.add_paragraph(
        "Сроки, формат результата и порядок приёмки стороны согласуют отдельно. В этом "
        "синтетическом примере отсутствуют реальные обязательства, реквизиты и персональные данные."
    )

    document.add_paragraph("Стороны", style="Heading 1")
    add_labeled_paragraph(document, "Заказчик", "{{ customer_name }}")
    add_labeled_paragraph(document, "Адрес", "{{ customer_address }}")
    add_labeled_paragraph(document, "Тестовый идентификатор", "{{ customer_tax_id }}")
    add_labeled_paragraph(document, "Исполнитель", "{{ contractor_name }}")
    add_labeled_paragraph(document, "Адрес", "{{ contractor_address }}")
    add_labeled_paragraph(document, "Тестовый идентификатор", "{{ contractor_tax_id }}")

    note = document.add_paragraph()
    note.paragraph_format.space_before = Pt(8)
    note.paragraph_format.space_after = Pt(0)
    set_font(
        note.add_run(
            "SYNTHETIC DEMO. Все данные вымышлены. Документ не создаёт правовых отношений "
            "и не заменяет консультацию квалифицированного юриста."
        ),
        size=9.5,
        bold=True,
        color=RED,
    )

    document.core_properties.title = "Synthetic service agreement template"
    document.core_properties.subject = "SYNTHETIC DEMO"
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    document.save(OUTPUT)
    return OUTPUT


if __name__ == "__main__":
    print(build())
