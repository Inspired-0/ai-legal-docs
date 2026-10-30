import pytest
from probe import check_terminal, fuse, parse_articles, verify_quote


def document(content, css=""):
    return f"<html><head><style>{css}</style></head><body>{content}</body></html>"


def test_superscript_is_not_merged_into_another_article():
    source = document(
        '<p>Статья 13<span class="idx">1</span>. SYNTHETIC DEMO</p>'
        "<p>Первое условие<br>и продолжение.</p>"
        "<p>Статья 131. Другая статья</p><p>Второе условие.</p>",
        ".idx {vertical-align: super;}",
    )
    units = parse_articles(source, "edition-a")
    assert [u["number"] for u in units] == ["13.1", "131"]
    assert "условие и" in units[0]["text"]
    assert "Второе" not in units[0]["text"]


@pytest.mark.parametrize("markup", ["<sup>1</sup>", '<span style="vertical-align:super">1</span>'])
def test_literal_and_inline_superscript(markup):
    units = parse_articles(document(f"<p>Статья 13{markup}. SYNTHETIC DEMO</p>"), "a")
    assert units[0]["number"] == "13.1"


def test_html_comments_do_not_break_style_detection():
    source = document("<!-- source export comment --><p>Статья 1. SYNTHETIC DEMO</p>")
    assert parse_articles(source, "a")[0]["number"] == "1"


def test_compound_superscript_number_remains_distinct():
    source = document("<p>Статья 123<sup>7-1</sup>. SYNTHETIC DEMO</p>")
    assert parse_articles(source, "a")[0]["number"] == "123.7-1"


def test_unknown_superscript_style_fails_explicitly():
    with pytest.raises(ValueError, match="Unsupported superscript selector"):
        parse_articles(document("<p>Статья 1. DEMO</p>", "span.idx{vertical-align:super}"), "a")


def test_duplicate_headings_and_missing_articles_fail():
    with pytest.raises(ValueError, match="Duplicate article"):
        parse_articles(document("<p>Статья 1. A</p><p>Статья 1. B</p>"), "a")
    with pytest.raises(ValueError, match="No article"):
        parse_articles(document("<p>Обрывок ответа источника</p>"), "a")


def test_heading_and_signature_do_not_become_article_content():
    source = document(
        "<p>Статья 1. DEMO</p><p>Условие</p><p>Глава 2. Следующая</p>"
        "<p>Служебный текст</p><p>Статья 2. DEMO</p><p>Ещё условие</p>"
        "<p>Президент Российской Федерации</p><p>Подпись</p>"
    )
    units = parse_articles(source, "a")
    assert units[0]["text"] == "Статья 1. DEMO\nУсловие"
    assert units[1]["text"] == "Статья 2. DEMO\nЕщё условие"


def test_article_without_title_keeps_its_own_boundary():
    source = document(
        "<p>Статья 1. SYNTHETIC DEMO</p><p>Текст первой статьи.</p>"
        "<p>Статья 2.</p><p>(Статья утратила силу - синтетический пример)</p>"
    )
    units = parse_articles(source, "a")
    assert [u["number"] for u in units] == ["1", "2"]
    assert "утратила силу" not in units[0]["text"]
    assert "утратила силу" in units[1]["text"]


def test_unknown_number_format_is_not_merged_into_previous_article():
    with pytest.raises(ValueError, match="Unrecognized article heading"):
        parse_articles(document("<p>Статья 1. DEMO</p><p>Статья 2/3. Неизвестный формат</p>"), "a")


def test_citation_does_not_move_between_editions_and_rejects_tampering():
    source = document("<p>Статья 1. DEMO</p><p>Синтетический текст.</p>")
    old = parse_articles(source, "old")[0]
    new = parse_articles(source, "new")[0]
    assert old["id"] != new["id"]
    assert old == parse_articles(source, "old")[0]
    assert verify_quote(old, "old", 0, 6, "Статья")
    assert not verify_quote(old, "new", 0, 6, "Статья")
    assert not verify_quote(old, "old", 0, 6, "ПОДМЕНА")
    assert not verify_quote(old, "old", -1, 6, "Статья")
    assert not verify_quote(old, "old", 0, 10000, old["text"])


def test_rank_fusion_deduplicates_results():
    assert fuse([["a", "b"], ["b", "c"]])[0] == "b"
    assert fuse([["a", "a", "b"]]) == ["a", "b"]


def test_terminal_range_requires_explicit_repeal_notice():
    source = document(
        "<p>Статья 39. SYNTHETIC DEMO</p><p>Текст</p>"
        "<p>Глава 7. (Статьи 40 - 45)</p><p>(Глава утратила силу - синтетический пример)</p>"
    )
    units = parse_articles(source, "a")
    assert check_terminal(source, units, "45")["kind"] == "source_repeal_notice"
    with pytest.raises(ValueError, match="Missing expected"):
        check_terminal(source.replace("Глава утратила силу", "Текст отсутствует"), units, "45")
    with pytest.raises(ValueError, match="Missing expected"):
        check_terminal(source, units, "46")
