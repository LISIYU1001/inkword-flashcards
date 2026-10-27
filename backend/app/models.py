from typing import Literal
from pydantic import BaseModel, Field


class Diagnostic(BaseModel):
    code: str
    message: str
    page: int | None = None
    annotation_id: str | None = None


class Entry(BaseModel):
    id: str
    term: str
    raw_text: str
    kind: Literal["word", "phrase"]
    page: int
    rect: list[float]
    quads: list[list[list[float]]]
    context: str
    context_source: Literal["pdf"] = "pdf"
    context_status: Literal["sentence", "fragment", "review"]
    warnings: list[str] = Field(default_factory=list)


class ParseResult(BaseModel):
    schema_version: Literal[1] = 1
    filename: str
    document_id: str
    page_count: int
    highlight_count: int
    entries: list[Entry]
    warnings: list[Diagnostic]
