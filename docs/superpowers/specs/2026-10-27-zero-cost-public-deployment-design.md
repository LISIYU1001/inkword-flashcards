# Zero-cost public portfolio deployment design

## Intent

Publish Inkword as a résumé demo that anyone can open, upload a WPS-annotated PDF, generate Agnes explanations, and review flashcards. Hosting must have no recurring fee and the Agnes key must remain server-side.

## Goals

- Public HTTPS frontend on Cloudflare Pages.
- Real PDF parsing and AI generation through the existing FastAPI service on one Koyeb free Web Service.
- Preserve local development and browser-local article/flashcard storage.
- Keep uploaded PDFs ephemeral and never persist them.
- Bound public traffic to the Agnes free account's low-frequency use.

## Non-goals

- Guaranteed uptime or production SLA.
- Accounts, cross-device sync, Supabase, or FSRS.
- Unlimited anonymous usage.
- Custom domain in the first deployment.

## Constraints

- Koyeb's free instance may sleep after one hour of inactivity, so the UI must explain a cold-start wait.
- Agnes `agnes-2.5-flash` is currently free but is limited and its terms can change.
- The frontend must not contain `AGNES_API_KEY` or any other private credential.
- The public frontend must call only a configured HTTPS API origin.
- PDFs remain limited to 20 MiB and 100 pages as enforced by the parser.

## Approaches considered

1. Cloudflare Workers plus Containers keeps everything on Cloudflare but requires the paid Workers plan. Rejected because the user requires zero recurring hosting cost.
2. Vercel Hobby can host Next.js and Python in one project, but Vercel Functions cap request bodies at 4.5 MB. Rejected because that materially weakens PDF upload support.
3. Cloudflare Pages plus Koyeb free FastAPI preserves the 20 MiB workflow and keeps secrets server-side. Selected, accepting cold starts and free-tier availability limits.

## Architecture

The Next.js client becomes a static export for Cloudflare Pages. Browser requests use a build-time public API base URL and go directly to the Koyeb HTTPS service. FastAPI enables CORS only for configured production and local origins, keeps the Agnes key in a Koyeb secret, parses uploads in memory, and returns existing JSON contracts. A lightweight per-client demo limit returns an actionable 429 response rather than allowing one visitor to exhaust the shared free RPM pool.

The current localStorage model remains unchanged. Interviewers' documents, explanations, and review events stay in their own browser. No PDF or study record is written to Koyeb disk.

## Deployment behavior

- Cloudflare Pages build publishes `frontend/out`.
- Koyeb starts the backend with Uvicorn on the platform-provided `PORT`.
- The frontend shows a cold-start message for slow/unavailable API calls.
- `/health` remains public for Koyeb health checks and reports no secrets.
- Production configuration is supplied through platform variables and secrets; local `.env` remains ignored.

## Acceptance

- A clean static build contains no Next.js server route requirement.
- A deployed-origin CORS preflight succeeds; an unlisted origin is denied.
- Upload, confirmation, Agnes generation, persistence, and flashcard review pass end to end.
- Neither the static output nor repository-tracked files contain the Agnes key.

