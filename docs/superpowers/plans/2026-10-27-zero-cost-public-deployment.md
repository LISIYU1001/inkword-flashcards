# Zero-cost Public Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy Inkword as a public résumé demo using Cloudflare Pages for the static frontend and a Koyeb free FastAPI service for PDF parsing and Agnes explanations.

**Architecture:** Export the Next.js UI as static assets and replace its same-origin Next route proxies with a small public API URL helper. Package the existing FastAPI application for Koyeb, restrict browser origins, retain in-memory PDF handling, and apply a bounded anonymous demo limit before provider calls.

**Tech Stack:** Next.js 16 static export, React 19, Cloudflare Pages, FastAPI, PyMuPDF, Koyeb Web Service, Agnes Chat Completions.

**Spec:** `docs/superpowers/specs/2026-10-27-zero-cost-public-deployment-design.md`

## Global Constraints

- Zero recurring hosting fee; use Cloudflare Pages Free and one Koyeb Free Instance.
- Never commit or expose `AGNES_API_KEY` in browser assets, logs, or documentation examples.
- Preserve the local workflow and `inkword.library.v1` data format.
- Keep PDF limits at 20 MiB and 100 pages.
- Treat free-tier sleep, quota exhaustion, and provider throttling as expected user-facing states.

## Review Focus

- An unconfigured or malformed public API URL must fail with a clear setup error rather than silently call localhost.
- CORS must allow the configured Pages origin and local development only, while denying arbitrary origins.
- A sleeping Koyeb backend must produce a wake-up message and retain the user's selected PDF for retry.
- Anonymous bursts must receive 429 without calling Agnes after the demo limit is reached.
- Static output and tracked files must contain no Agnes credential.

---

### Task 1: Public API boundary and static frontend

**Files:**
- Create: `frontend/lib/api.ts`
- Create: `frontend/lib/api.test.ts`
- Modify: `frontend/components/workspace.tsx`
- Modify: `frontend/next.config.mjs`
- Delete: `frontend/app/api/parse/route.ts`
- Delete: `frontend/app/api/explain/route.ts`
- Delete: `frontend/app/api/ai/status/route.ts`
- Modify: `frontend/package.json`

**Interfaces:**
- Produces: `apiUrl(path: "/api/parse" | "/api/explain" | "/api/ai/status"): string`.
- Consumes: `NEXT_PUBLIC_API_URL` at build time, falling back to `http://127.0.0.1:8000` only for local development.

- [ ] Write tests proving URL normalization, production misconfiguration, and the three endpoint mappings.
- [ ] Run `npm test -- lib/api.test.ts` and verify the new tests fail because `apiUrl` does not exist.
- [ ] Implement `apiUrl`, replace three frontend fetch targets, and add the Koyeb cold-start error copy.
- [ ] Enable `output: "export"`; remove server route proxies and update local scripts/documentation.
- [ ] Run unit tests, typecheck, and `npm run build`; verify `frontend/out/index.html` exists.

### Task 2: Koyeb-safe backend boundary

**Files:**
- Create: `backend/app/public_access.py`
- Create: `backend/tests/test_public_access.py`
- Modify: `backend/app/main.py`
- Modify: `backend/.env.example`
- Create: `backend/Dockerfile`
- Create: `backend/.dockerignore`

**Interfaces:**
- Produces: `configured_origins() -> list[str]` and request guards used by `/api/parse` and `/api/explain`.
- Consumes: `ALLOWED_ORIGINS`, `DEMO_REQUESTS_PER_MINUTE`, `DEMO_EXPLANATIONS_PER_DAY`, and Koyeb `PORT`.

- [ ] Write failing tests for allowed/denied CORS, malformed origins, rate-limit exhaustion, and health secrecy.
- [ ] Run the focused backend tests and confirm the expected failures.
- [ ] Implement explicit-origin CORS and bounded per-client in-memory demo limits; preserve existing sanitized errors.
- [ ] Add a non-root Python container that listens on `${PORT:-8000}` and excludes tests, `.env`, caches, and fixtures.
- [ ] Build and run the container locally; verify `/health`, real PDF parsing, and a mocked explanation request.

### Task 3: Cross-origin end-to-end behavior

**Files:**
- Modify: `frontend/e2e/workspace.spec.ts`
- Modify: `frontend/e2e/learning.spec.ts`
- Modify: `frontend/playwright.config.ts`

**Interfaces:**
- Consumes: static frontend output and the FastAPI public API contract from Tasks 1 and 2.
- Produces: browser evidence for upload, generation, local persistence, and flashcards across separate origins.

- [ ] Add a browser test that serves the static export and targets the backend origin.
- [ ] Verify the test fails before both deployment boundaries are connected.
- [ ] Make the minimum test/runtime configuration changes required for the cross-origin flow.
- [ ] Run all backend, frontend, and browser tests with the real WPS sample.

### Task 4: Platform configuration and handoff

**Files:**
- Create: `docs/deployment.md`
- Modify: `README.md`
- Modify: `.gitignore`

**Interfaces:**
- Produces: exact Cloudflare Pages build settings, Koyeb build/run settings, environment variable inventory, rollback steps, and final public URL checklist.

- [ ] Document Koyeb variables and mark `AGNES_API_KEY` as a secret entered only in Koyeb.
- [ ] Document the Cloudflare Pages build command, output directory, and `NEXT_PUBLIC_API_URL` value.
- [ ] Scan tracked source and `frontend/out` for secret values without printing the secret.
- [ ] Create or connect a private Git repository only after resolving the user's authenticated GitHub/Koyeb/Cloudflare sessions.
- [ ] Deploy Koyeb first, then build and deploy Pages against its HTTPS URL.
- [ ] Run production smoke tests with the user-owned PDF and one live Agnes entry; report cold-start timing and the final public URL.

