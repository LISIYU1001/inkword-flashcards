# SDD ledger — plan: docs/superpowers/plans/2026-10-27-zero-cost-public-deployment.md

## Rulings

- Initialized local Git and work on `deploy/free-hosting` in place because the project had no repository or commit from which to create an isolated worktree. The baseline `main` commit provides rollback; if this ruling is wrong, filesystem-level isolation is missing but branch/commit rollback remains available.
- The SDD shell helpers cannot start in the managed Windows environment (`NtCreateDirectoryObject` access denied), so this ledger records the equivalent task boundaries and verification evidence manually.

## Preflight interfaces

- Task 1 produces `apiUrl`, consumed by Task 3 cross-origin tests: consistent.
- Task 2 produces CORS and rate-limit boundaries, consumed by Task 3: consistent.
- Tasks 1 and 2 produce platform configuration consumed by Task 4: consistent.

## Progress

- [x] Task 1: Public API boundary and static frontend
- [x] Task 2: Koyeb-safe backend boundary
- [ ] Task 3: Cross-origin end-to-end behavior
- [ ] Task 4: Platform configuration and handoff

## Task 1 evidence

- RED: `npm test -- lib/api.test.ts` failed because `./api` did not exist.
- GREEN: frontend unit tests: 16 passed; TypeScript check passed.
- Static build: Next.js exported `/` and `frontend/out/index.html` exists.
- Preserved local preview by serving the static `out` directory from `Start.ps1`; retained a failed upload in memory and exposed a retry action for free-tier cold starts.

## Task 2 evidence

- RED: focused tests failed because `app.public_access` did not exist.
- GREEN: 63 backend tests passed with the user-owned WPS PDF, including explicit CORS, unsafe-origin rejection, per-client minute/day limits, and 429-before-provider behavior.
- Added a non-root Python image, environment-driven `${PORT:-8000}`, and a Docker context that excludes secrets, tests, caches, and fixtures.
- Local Docker is not installed, so image construction is deferred to Koyeb's remote builder. Cost if wrong: a container-only packaging issue may be discovered during the platform build; the full application suite has passed against the same dependency manifest.

