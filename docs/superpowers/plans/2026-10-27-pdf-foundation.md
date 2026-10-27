# Inkword PDF foundation Implementation Plan

> Execute inline with superpowers:executing-plans, TDD and verification-before-completion. User approved direct implementation.

**Goal:** Upload a WPS-annotated PDF, inspect reliable highlight/context extraction, edit entries and save locally.
**Architecture:** Next.js proxies uploads to local FastAPI. Stateless PyMuPDF parser returns typed evidence and warnings. Browser repository owns versioned local records, leaving room for Supabase and review scheduling later.
**Tech Stack:** Next.js, React, Tailwind CSS, shadcn/ui; FastAPI, PyMuPDF, pytest.
**Spec:** User-approved phase-one scope in this conversation, summarized below.

## Global Constraints
- No AI, flashcards or accounts in this increment. No fabricated extraction or context.
- Preserve raw text, page (one-based), quads and normalized editable term separately.
- Local server only; PDF not persisted server-side. Local storage contains entries, not original PDF.
- Secrets stay server-side. Cap upload at 20 MiB and document at 100 pages.

## Review Focus
- Multi-line annotations must not include unhighlighted interstitial text.
- Adjacent columns must not contaminate source context.
- Blank/image-only, encrypted, broken PDFs and unmatched annotations must explain failure.
- Editing, deleting all entries, reloading and local-storage failures must not silently lose data.
- Mixed readable/unreadable pages must return partial results with warnings.

## Task 1: Parser and API
Files: backend/app/{models,parser,main}.py, backend/tests/test_parser.py, test_api.py.
Interface: parse_pdf(bytes, filename) -> ParseResult; POST /api/parse multipart file -> same JSON or structured error.
- [ ] Write tests: real WPS nine exact raw strings and source sentences; synthetic multiline/columns, overlapping highlights, malformed quads, scan, no highlights, encryption, corrupt input, upload limits.
- [ ] Run pytest and observe missing implementation failure.
- [ ] Implement quad-to-character matching, block/column-aware sentence context, diagnostics and upload endpoint.
- [ ] Run complete pytest suite; independently inspect real sample output.

## Task 2: Upload and editable notebook
Files: frontend/app, components/ui, components/workspace.tsx, lib/{types,storage}.ts.
Interface: backend ParseResult maps to Article with editable Entry list; versioned local repository read/save/delete/export.
- [ ] Add behavioral storage tests and observe failure.
- [ ] Implement responsive home, upload/confirmation, notebook, local persistence and JSON export.
- [ ] Typecheck, test and production build.
- [ ] Browser verification: upload real sample, edit/add/delete, save/reload, error case, mobile layout.

## Task 3: Delivery
Files: README.md, scripts, docs/validation.md.
- [ ] Add reproducible startup, dependency locks, fixture-generation instructions and known limitations.
- [ ] Fresh whole-project review; fix actionable findings and rerun relevant checks.
- [ ] Open local preview and report tested results without claiming broad WPS compatibility.
