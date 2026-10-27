import os
from pathlib import Path

import pymupdf as fitz
import pytest

from app.parser import ParseError, parse_pdf


def document(text="Learning helps people adapt.", highlight="adapt"):
    doc = fitz.open()
    page = doc.new_page()
    if text:
        page.insert_text((60, 70), text)
    if highlight:
        page.add_highlight_annot(page.search_for(highlight))
    return doc


def test_real_wps_nine_highlights():
    path = os.environ.get("WPS_TEST_PDF")
    if not path:
        pytest.skip("Set WPS_TEST_PDF to the original user-owned sample")
    result = parse_pdf(Path(path).read_bytes(), Path(path).name)
    assert result.page_count == 4
    assert [e.raw_text for e in result.entries] == [
        "daunting", "keep pace with", "fall behind", "fall apart", "heralding",
        "spread over decades", "cramming", "sets out,", "top-ups",
    ]
    assert [e.page for e in result.entries] == [1]*8 + [2]
    assert result.entries[7].term == "sets out"
    assert result.entries[0].context == "The practicalities are daunting"
    assert result.entries[1].context == "WHEN education fails to keep pace with technology, the result is inequality."
    assert result.entries[8].context == "The classic model of education—a burst at the start and top-ups through company training—is breaking down."
    assert all(e.quads and e.context for e in result.entries)


def test_multiline_phrase_keeps_only_selected_characters():
    doc = document("We need to keep\nlearning throughout life.", None)
    p = doc[0]
    p.add_highlight_annot(p.search_for("keep") + p.search_for("learning"))
    entry = parse_pdf(doc.tobytes(), "multiline.pdf").entries[0]
    assert entry.raw_text == "keep learning"
    assert len(entry.quads) == 2
    assert entry.context == "We need to keep learning throughout life."


def test_two_columns_dont_mix_context():
    doc = fitz.open()
    p = doc.new_page()
    p.insert_text((50, 80), "Workers must keep\nlearning every day.")
    p.insert_text((320, 80), "Robots replace tasks.\nOther column ends here.")
    p.add_highlight_annot(p.search_for("learning"))
    entry = parse_pdf(doc.tobytes(), "columns.pdf").entries[0]
    assert entry.context == "Workers must keep learning every day."
    assert entry.raw_text == "learning"


def test_duplicate_highlights_are_preserved_as_evidence():
    doc = document()
    p = doc[0]
    p.add_highlight_annot(p.search_for("adapt"))
    entries = parse_pdf(doc.tobytes(), "duplicate.pdf").entries
    assert len(entries) == 2
    assert len({e.id for e in entries}) == 2


@pytest.mark.parametrize("content,code", [(b"not a pdf", "INVALID_PDF"), (b"%PDF-broken", "INVALID_PDF")])
def test_corrupt_pdf(content, code):
    with pytest.raises(ParseError) as err:
        parse_pdf(content, "bad.pdf")
    assert err.value.code == code


def test_image_only_pdf_does_not_invent_text():
    doc = document("", None)
    with pytest.raises(ParseError) as err:
        parse_pdf(doc.tobytes(), "scan.pdf")
    assert err.value.code == "NO_TEXT_LAYER"


def test_no_highlights():
    doc = document(highlight=None)
    with pytest.raises(ParseError) as err:
        parse_pdf(doc.tobytes(), "plain.pdf")
    assert err.value.code == "NO_HIGHLIGHTS"


def test_encrypted_pdf():
    doc = document()
    data = doc.tobytes(encryption=fitz.PDF_ENCRYPT_AES_256, user_pw="test", owner_pw="owner")
    with pytest.raises(ParseError) as err:
        parse_pdf(data, "locked.pdf")
    assert err.value.code == "ENCRYPTED_PDF"


def test_unmatched_annotation_reports_warning_without_fake_entry():
    doc = document()
    p = doc[0]
    p.add_highlight_annot(fitz.Rect(50, 300, 150, 320))
    result = parse_pdf(doc.tobytes(), "unmatched.pdf")
    assert len(result.entries) == 1
    assert result.highlight_count == 2
    assert any(w.code == "UNMATCHED_HIGHLIGHT" for w in result.warnings)


def test_mixed_blank_page_warns_but_preserves_good_entries():
    doc = document()
    doc.new_page()
    result = parse_pdf(doc.tobytes(), "mixed.pdf")
    assert len(result.entries) == 1
    assert any(w.code == "PAGE_NO_TEXT" and w.page == 2 for w in result.warnings)


def test_rotated_page_coordinates_stay_consistent():
    doc = document()
    doc[0].set_rotation(90)
    entry = parse_pdf(doc.tobytes(), "rotate.pdf").entries[0]
    assert entry.term == "adapt"
    assert entry.context == "Learning helps people adapt."


def test_malformed_quad_annotation_is_reported():
    doc = document()
    p = doc[0]
    a = next(p.annots())
    doc.xref_set_key(a.xref, "QuadPoints", "[10 20 30]")
    result = parse_pdf(doc.tobytes(), "malformed.pdf")
    assert result.entries == []
    assert any(w.code == "INVALID_HIGHLIGHT" for w in result.warnings)
