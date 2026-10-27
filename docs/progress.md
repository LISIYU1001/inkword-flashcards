# 执行记录 — 2026-10-27-pdf-foundation

Task 1 complete: 17 backend tests passed against real WPS path and synthetic fixtures.
Task 2 complete: 4 repository tests passed; TypeScript and webpack build passed; browser regression verification recorded separately.
Ruling: Direct implementation approved by user; no further design/plan approval round.
Ruling: Fresh project directory outside Git; execute in dedicated outputs/inkword rather than manufacture a worktree.
Ruling: Local Python backend required, no Sites publishing; maintain two local processes.
Ruling: Webpack selected after reproducible Turbopack subprocess failure.
Review: independent read-only reviewer; source-page mutation and pending-upload navigation reproduced RED, fixed GREEN.
Review: storage-denied backup issue included as recovery-flow correctness, RED reproduced before fix.
Task 3: startup and validation documentation delivered. Final browser run recorded by executing agent.
Final verification: 17 backend + 4 storage + 5 browser tests passed; TypeScript and production webpack build passed. Start.ps1 syntax validated; individual server commands exercised. Local preview retained at http://127.0.0.1:3000. No outstanding review findings.

# Phase 2 ledger — 2026-10-27-ai-flashcards
Source copied into new user-designated writable workspace; original directory preserved.
Backend: 15 added AI contract tests RED (missing implementation) -> GREEN; 32 full tests passed.
Frontend: learning tests RED -> GREEN, 10 total passed after concurrency regression.
Browser: 12 passed. Initial old status locator ambiguity fixed by qualifying confirmation status.
Review: asynchronous full-article overwrite reproduced by pending response + deletion, replaced with current-record target merge; regression GREEN.
Build: Next.js webpack production and TypeScript passed. Runtime retained on same origin.
Visual QA: real no-key setup and explicitly marked test-fixture cards inspected desktop/mobile.
Limitation: no OPENAI_API_KEY configured; no live OpenAI request or quality evaluation performed.

## Agnes adaptation — 2026-10-27
- Added server-side Agnes Chat Completions adapter, isolated provider credentials, validated JSON and sanitized failures. Existing OpenAI records remain supported.
- Prepared backend/.env with AI_PROVIDER=agnes and an empty AGNES_API_KEY; no real credential has been read or sent.
- Verification: 47 backend tests passed (including user WPS PDF), 11 frontend unit tests passed, 12 existing browser flows plus 1 Agnes persistence flow passed; production build passed.
- Non-blocking existing warnings: Starlette/httpx TestClient deprecation; Node color environment conflict.
- Pending: user fills key, restart backend, perform a small live Agnes request to validate account/model access and explanation quality. Local tests use HTTP fixtures only.

## Agnes live verification — 2026-10-27
- User configured the server key locally; restarted backend without displaying credentials.
- Found real Agnes responses sometimes wrap JSON in a Markdown fence. Added exact whole-fence unwrapping; surrounding prose, incomplete fences and invalid fields remain rejected.
- Regression: 52 backend tests passed, including the real WPS PDF. Existing Starlette/httpx deprecation warning remains.
- Live check through frontend /api/explain returned HTTP 200 for `keep pace with`, model `agnes-2.5-flash`, with all seven validated fields and unchanged source context.
- Test result was not inserted into the user's local article library. User can now generate explanations from confirmed entries.
