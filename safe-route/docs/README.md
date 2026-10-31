# SafeRoute documentation map

Read documents in this order:

1. `SafeRoute-Product-Architecture.md` — approved scope, user journey, business logic, safety boundaries and demo seed.
2. `SafeRoute-Architecture-Review.md` — review history and risks that shaped the accepted design.
3. `SafeRoute-Implementation-Blueprint.md` — locked stack, project tree, module contracts, database ownership, API and implementation order.
4. `SafeRoute-Model-Prompt.md` — server-only Gemma context, prompt, schema and provider failure behavior.
5. `SafeRoute-Quality-Plan.md` — acceptance tests and evidence gates.
6. `Demo-Script.md` — 3-minute presenter flow and backup branch.

## Decision rule

If an implementation idea conflicts with the product architecture, do not add it “for convenience”. First revise the product decision and its tests. If the blueprint has a technical conflict with the product document, the product document wins until it is explicitly changed.

## Start-of-implementation checklist

- `GEMINI_API_KEY` exists only in local `.env`.
- Node.js 22 LTS and npm are installed.
- Docker Desktop is running; from `safe-route/`, `docker compose up -d postgres` reports a healthy Postgres container.
- The team agrees to use only synthetic seed data.
- First commit contains no secret, database file, `.env`, generated build output or real user data.
- Run frontend/runtime commands from `safe-route/web`; documentation remains in `safe-route/docs`.
- Work begins from Blueprint section 10, step 1; do not build screens before contracts, seed data and state transitions are testable.
