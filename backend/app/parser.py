"""Evidence-first highlight extraction. No OCR, dictionary or AI inference.

Coordinates are PDF points in PyMuPDF's unrotated, top-left page space.
Character centres must lie inside each actual quad, not its bounding rect.
Context is restricted to nearby aligned lines; complex layouts are heuristic.
"""
import hashlib
import re
from dataclasses import dataclass

import pymupdf as fitz

from .models import Diagnostic, Entry, ParseResult

MAX_PAGES = 100
MAX_CHARACTERS = 1_000_000
MAX_HIGHLIGHTS = 2000


class ParseError(Exception):
    def __init__(self, code: str, message: str):
        self.code, self.message = code, message
        super().__init__(message)


@dataclass
class Line:
    index: int
    rect: fitz.Rect
    chars: list[dict]
    size: float
    bold: bool
    direction: tuple

    @property
    def text(self):
        return "".join(c["c"] for c in self.chars).strip()


def _lines(page):
    result = []
    for block in page.get_text("rawdict", flags=fitz.TEXTFLAGS_TEXT)["blocks"]:
        for line in block.get("lines", []):
            spans = line["spans"]
            chars = [c for span in spans for c in span["chars"]]
            if not chars or not any(c["c"].strip() for c in chars):
                continue
            result.append(Line(len(result), fitz.Rect(line["bbox"]), chars,
                               max(s["size"] for s in spans),
                               bool(spans[0]["flags"] & 16), tuple(line["dir"])))
    return result


def _contains(quad, char):
    rect = fitz.Rect(char["bbox"])
    return fitz.Point((rect.x0 + rect.x1)/2, (rect.y0 + rect.y1)/2) in quad


def _neighbor(a: Line, b: Line):
    """Conservative paragraph adjacency; never join side-by-side columns."""
    gap = b.rect.y0 - a.rect.y1
    return (a.direction == b.direction == (1.0, 0.0)
            and 0 <= gap <= max(a.rect.height, b.rect.height) * .85
            and abs(a.rect.x0-b.rect.x0) < max(22, a.size*2)
            and abs(a.size-b.size) < 1 and a.bold == b.bold)


def _context(lines, hits):
    selected = {i for i, _ in hits}
    chain = sorted((l for l in lines if l.index in selected), key=lambda l: (l.rect.y0, l.rect.x0))
    # Non-contiguous multi-quad selections should not join unrelated paragraphs.
    if any(not _neighbor(a, b) for a, b in zip(chain, chain[1:])):
        return " ".join(l.text for l in chain), "review"
    used = set(selected)
    for prepend in (True, False):
        while len(chain) < 40:
            edge = chain[0] if prepend else chain[-1]
            options = [l for l in lines if l.index not in used and
                       (_neighbor(l, edge) if prepend else _neighbor(edge, l))]
            if not options:
                break
            closest = min(options, key=lambda l: abs(l.rect.y0-edge.rect.y0))
            used.add(closest.index)
            if prepend:
                chain.insert(0, closest)
            else:
                chain.append(closest)
    text = ""
    offsets = []
    hit_set = set(hits)
    for line in chain:
        # Retain character-to-text mapping so repeated terms select the right sentence.
        for j, char in enumerate(line.chars):
            if (line.index, j) in hit_set and char["c"].strip():
                offsets.append(len(text))
            text += char["c"]
        text += " "
    if not offsets:
        return "", "review"
    boundaries = [0]
    # Avoid common abbreviations and decimal periods; this is deliberately not NLP.
    for m in re.finditer(r'[.!?][”\"\']?\s+', text):
        prefix = text[:m.start()+1]
        if re.search(r'\b(?:Mr|Mrs|Ms|Dr|Prof|e\.g|i\.e|vs)\.$', prefix, re.I):
            continue
        boundaries.append(m.end())
    boundaries.append(len(text))
    start = max(b for b in boundaries if b <= min(offsets))
    end = next(b for b in boundaries if b > max(offsets))
    context = re.sub(r"\s+", " ", text[start:end]).strip()
    status = "sentence" if re.search(r'[.!?][”\"\']?$', context) else "fragment"
    if "\ufffd" in context or any(l.direction != (1.0, 0.0) for l in chain):
        status = "review"
    return context, status


def parse_pdf(data: bytes, filename: str) -> ParseResult:
    if not data.lstrip().startswith(b"%PDF-"):
        raise ParseError("INVALID_PDF", "文件不是有效 PDF，请重新选择 PDF 文件。")
    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception as exc:
        raise ParseError("INVALID_PDF", "PDF 已损坏或无法打开，请在 WPS 中重新保存后上传。") from exc
    with doc:
        if doc.needs_pass:
            raise ParseError("ENCRYPTED_PDF", "PDF 需要密码，请先在本地解锁并另存后上传。")
        if doc.page_count > MAX_PAGES:
            raise ParseError("TOO_MANY_PAGES", "第一阶段最多支持 100 页，请拆分 PDF。")
        entries, warnings = [], []
        total_chars = highlight_count = 0
        document_id = hashlib.sha256(data).hexdigest()
        for page in doc:
            lines = _lines(page)
            total_chars += sum(len(l.chars) for l in lines)
            if total_chars > MAX_CHARACTERS:
                raise ParseError("TOO_COMPLEX", "PDF 文字量过大，请拆分后重试。")
            if not lines:
                warnings.append(Diagnostic(code="PAGE_NO_TEXT", page=page.number+1,
                                           message="本页没有可读取文字，可能是扫描页或空白页；未执行 OCR。"))
            for annot in page.annots() or []:
                if annot.type[0] != fitz.PDF_ANNOT_HIGHLIGHT:
                    continue
                highlight_count += 1
                if highlight_count > MAX_HIGHLIGHTS:
                    raise ParseError("TOO_COMPLEX", "高亮超过 2000 处，请拆分 PDF。")
                aid = f"{document_id[:16]}-p{page.number+1}-a{annot.xref}"
                try:
                    vertices = annot.vertices
                    if not vertices or len(vertices) % 4:
                        raise ValueError("invalid quad count")
                    quads = [fitz.Quad(vertices[i:i+4]) for i in range(0, len(vertices), 4)]
                    if any(not q.is_convex or q.rect.is_empty or q.rect.is_infinite for q in quads):
                        raise ValueError("invalid quad geometry")
                except Exception:
                    warnings.append(Diagnostic(code="INVALID_HIGHLIGHT", page=page.number+1,
                                               annotation_id=aid, message="高亮位置数据无效，未猜测标注内容。"))
                    continue
                pieces, hits, seen = [], [], set()
                unmatched = False
                for quad in quads:
                    matches = []
                    for line in lines:
                        if not line.rect.intersects(quad.rect):
                            continue
                        chars = []
                        for j, c in enumerate(line.chars):
                            if _contains(quad, c):
                                if (line.index, j) not in seen:
                                    chars.append(c["c"])
                                    hits.append((line.index, j))
                                    seen.add((line.index, j))
                        if chars:
                            matches.append((line.rect.y0, line.rect.x0, "".join(chars)))
                    fragment = " ".join(m[2].strip() for m in sorted(matches)).strip()
                    if fragment:
                        pieces.append(fragment)
                    else:
                        unmatched = True
                raw = re.sub(r"\s+", " ", " ".join(pieces)).strip()
                if not raw or "\ufffd" in raw:
                    warnings.append(Diagnostic(code="UNMATCHED_HIGHLIGHT", page=page.number+1,
                                               annotation_id=aid, message="高亮未匹配到可靠文字；可能是扫描内容或文字编码损坏。"))
                    continue
                context, status = _context(lines, hits)
                notes = []
                if unmatched:
                    notes.append("部分高亮区域未匹配到文字，请核对原 PDF。")
                    status = "review"
                if status != "sentence":
                    notes.append("上下文可能是片段或存在复杂排版，请对照原文确认。")
                term = raw.strip(" \t\n,.;:!?\"“”‘’()[]{}，。；：！？") or raw
                entries.append(Entry(id=aid, term=term, raw_text=raw,
                    kind="phrase" if len(term.split()) > 1 else "word", page=page.number+1,
                    rect=list(annot.rect), quads=[[[p.x, p.y] for p in q] for q in quads],
                    context=context, context_status=status, warnings=notes))
        if not total_chars:
            raise ParseError("NO_TEXT_LAYER", "PDF 没有可读取的文字层，可能是扫描件。请先 OCR 并核对文字，再重新标注；本应用不会伪造识别结果。")
        if not highlight_count:
            raise ParseError("NO_HIGHLIGHTS", "未找到 Highlight 类型注释。请使用 WPS「批注 → 高亮文字」并保存；已扁平化的颜色无法作为注释读取。")
        return ParseResult(filename=filename, document_id=document_id, page_count=doc.page_count,
                           highlight_count=highlight_count, entries=entries, warnings=warnings)
