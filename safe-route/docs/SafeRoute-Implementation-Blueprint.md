# SafeRoute: Implementation Blueprint

**Статус:** APPROVED FOR IMPLEMENTATION  
**Версія:** 1.1  
**Передумова запуску:** локально заданий `GEMINI_API_KEY`; ключ не комітиться і не передається в браузер.  
**Авторитет продукту:** `SafeRoute-Product-Architecture.md` v0.4. Цей документ конкретизує реалізацію, але не розширює MVP.

## 1. Delivery target

Один локально запущений B2B2C вебзастосунок демонструє один відтворюваний journey: country profile → disruption → risk → passenger ticket chat → Gemma proposal → server policy → automatic hold → passenger confirmation → atomic rebook → operations dashboard, audit and insights. Дані — виключно synthetic. Реальних перевізників, платежів, email/SMS, CRM, багатокористувацької auth і загального FAQ немає.

### Done definition

MVP готовий лише коли з чистого seed-state можна за 90 секунд пройти основний сценарій, а також показати `STALE`, `HOLD_EXPIRED` і `AGENT_REVIEW_REQUIRED`. Кожен state-changing крок має policy decision та immutable audit entry.

## 2. Locked technology decisions

| Шар | Рішення | Навіщо |
|---|---|---|
| Runtime | Node.js 22 LTS, TypeScript strict, npm | Один зрозумілий runtime для команди. |
| Web | Next.js App Router + React | Passenger ticket chat, operations dashboard і API живуть в одному modular monolith. |
| Styling | Tailwind CSS | Швидко зробити demo UI без дизайн-системи поза scope. |
| Validation | Zod | Перевірка HTTP payload, model JSON і domain contracts на сервері. |
| Storage | PostgreSQL 16 у Docker Compose + `pg` | Справжні локальні mutations, row-level transactions, revisions та audit; однаковий шлях локально й у deploy. |
| Model | `@google/genai`, `gemma-4-26b-a4b-it` через Google GenAI API | Реальна Gemma; виклик виконується тільки в server runtime. |
| Tests | Vitest (unit/integration), Playwright (90-sec e2e demo) | Докази для technical execution. |
| Deploy, після локального demo | Docker → DigitalOcean App Platform або Droplet | Не є блокером MVP; можливість використати DigitalOcean credit. |

Не встановлюємо Redis, брокер, vector DB, LangChain, agent framework, зовнішню auth-службу чи іншу LLM. Це не дає користі для одного bounded case і збільшує demo risk.

## 3. Runtime configuration

Локальний `.env` (ніколи не комітити):

```env
DATABASE_URL="file:./dev.db"
GEMINI_API_KEY="replace-locally"
GEMMA_MODEL="gemma-4-26b-a4b-it"
GEMMA_TIMEOUT_MS="8000"
DEMO_SESSION_ID="sess-demo-001"
```

У Git потрапляє лише `.env.example` без значень. Server startup перевіряє наявність `GEMINI_API_KEY`, але app може стартувати в `MODEL_UNAVAILABLE` demo-mode для guardrail scenario. Production secrets, telemetry service і cloud credentials поза scope.

## 4. Repository layout

`safe-route/` is the documentation root. The executable Next.js application lives in `safe-route/web/`; run all npm commands there.

```text
safe-route/
  docs/
    SafeRoute-Product-Architecture.md
    SafeRoute-Architecture-Review.md
    SafeRoute-Implementation-Blueprint.md
    SafeRoute-Model-Prompt.md
    SafeRoute-Quality-Plan.md
  docker-compose.yml                  # postgres, optional app container
  postgres/init/001_schema.sql         # versioned initial database schema
  web/
    Dockerfile
    src/
    app/
      page.tsx                         # passenger ticket chat
      agent/page.tsx                   # operations dashboard
      monitor/page.tsx                 # disruption monitor
      api/
        demo/reset/route.ts
        cases/[caseId]/route.ts
        cases/[caseId]/messages/route.ts
        cases/[caseId]/confirm/route.ts
        cases/[caseId]/agent/refresh/route.ts
    audit-trail/
      contract.ts  append-audit-entry.ts  audit-query.ts
    case-conversation/
      contract.ts  append-passenger-message.ts  classify-turn.ts
    disruption-intake/
      contract.ts  accept-disruption-event.ts
    country-disruption-profile/
      contract.ts  load-country-profile.ts
    gemma-decision/
      contract.ts  gemma-client.ts  create-proposal.ts
    journey-context/
      contract.ts  load-journey-snapshot.ts  validate-session-binding.ts
    recovery-assessment/
      contract.ts  assess-connection-risk.ts
    recovery-catalog/
      contract.ts  list-fresh-options.ts
    reservation-actions/
      contract.ts  hold-seat.ts  rebook-ticket.ts  expire-hold.ts
    action-policy/
      contract.ts  decide-hold.ts  decide-rebook.ts
    support-case/
      contract.ts  recover-disrupted-journey.ts  escalate-case.ts
    support-insights/
      contract.ts  build-case-effectiveness-summary.ts
    demo-bootstrap/
      reset-demo-state.ts  seed-scenario.ts
    platform/
      database/prisma-client.ts
      http/route-response.ts
      time/clock.ts
  tests/
    unit/
    integration/
    e2e/
    .env.example                       # localhost PostgreSQL connection
    .gitignore
    package.json
```

`platform` містить лише технічні механізми без доменної логіки. Кожен domain module володіє контрактом, записами й інваріантами своєї області; інші модулі не читають його SQLite-таблиці напряму.

## 5. Data model and ownership

| Record | Owner | Required fields / invariant |
|---|---|---|
| `PassengerSession` | Journey Context | `sessionId`, `passengerId`, `caseId`, `active`; request without exact binding cannot confirm. |
| `CountryProfile` | Country Disruption Profile | `countryCode`, allowed disruption categories/modes, labels; profile is taxonomy, not a live fact source. |
| `Booking`, `JourneyLeg` | Journey Context | `bookingId`, legs, `bookingRevision`; booking belongs to `P-001`. |
| `DisruptionEvent` | Disruption Intake | `eventId`, segment, predicted arrival, `sourceRevision`, `observedAt`; duplicate/older revision rejected. |
| `RecoveryCase` | Support Case | risk/state, booking/event refs, `correlationId`, escalation reason. |
| `RecoveryOption` | Recovery Catalog | itinerary, capacity, `optionRevision`, `availableAt`; only catalog writes availability. |
| `ConversationTurn` | Case Conversation | max 6 per case, actor, `sessionId`, message, timestamp. |
| `GemmaProposal` | Gemma Decision | schema version, validated JSON, model label, technical status; immutable after creation. |
| `PolicyDecision` | Action Policy | decision, evaluated rule IDs, reason, refs; immutable. |
| `Reservation` | Reservation Actions | hold ID, option/booking revisions, expiry, idempotency key, state. |
| `AuditEntry` | Audit Trail | append-only event, actor, correlation ID, safe summary, refs and revisions. |

### Transaction rules

1. `holdSeat` runs in one PostgreSQL transaction: reread option with row lock → verify expected revision and `capacity > 0` → decrement capacity → create `HOLD_ACTIVE` reservation → append audit receipt.
2. `rebookTicket` runs in one transaction: reread hold, booking and option → verify expiry, all expected revisions and `sessionId` → update booking itinerary/revision → mark reservation `REBOOKED` → append receipt.
3. Duplicate `idempotencyKey` returns its original receipt; it cannot decrement capacity or rebook twice.
4. `expireHold` runs in one transaction: find active overdue hold → increment capacity → mark `HOLD_EXPIRED` → append audit → case goes to refresh/escalation.
5. Any failed revision check returns typed `STALE`; no partial write is committed.

## 6. Seed scenario

Seed only the values approved in the product document:

```text
country profile: UA → SAFETY_ALERT, BORDER_DELAY, OPERATIONAL_DELAY; train, bus, overnight
session: sess-demo-001 → P-001 → case generated for BK-1001
booking: SR-101 Kyiv 08:00 → Lviv 13:00; SR-205 Lviv 14:00 → Uzhhorod 19:30
event: evt-9001; SR-101 estimated arrival 17:00; category SAFETY_ALERT; revision 17; fresh timestamp
options: OPT-FAST-01 (17:30 → 22:15, capacity 1),
         OPT-BUS-01  (partner bus, 17:20 → 21:50, capacity 2),
         OPT-REST-01 (overnight + 06:30 → 11:30, capacity 3)
```

`POST /api/demo/reset` is development/demo-only. It resets only the local Docker PostgreSQL scenario. It must never exist in a public production build.

## 7. Public HTTP contracts

Browser never calls Gemma or SQLite directly. `sessionId` is an HttpOnly demo cookie set from `DEMO_SESSION_ID`; all passenger endpoints read it server-side.

| Route | Request | Server behavior | Response |
|---|---|---|---|
| `GET /api/cases/:caseId` | cookie | validates session binding | safe case projection, timeline, options, current action state |
| `POST /api/cases/:caseId/messages` | `{message, idempotencyKey}` | validates case/session, appends bounded turn, invokes workflow only when model interpretation is needed | reply, proposal summary, current state, optional hold receipt |
| `POST /api/cases/:caseId/confirm` | `{optionId, idempotencyKey}` | exact matching session + active hold + Action Policy → rebook | rebook receipt or typed refusal |
| `POST /api/cases/:caseId/agent/refresh` | development agent surface | refreshes catalog, never approves rebook | refreshed options / escalation state |
| `POST /api/demo/reset` | none | resets known demo data | initial `caseId` |

Error envelope is uniform:

```json
{
  "code": "STALE|FORBIDDEN|NOT_FOUND|VALIDATION_ERROR|MODEL_UNAVAILABLE|AGENT_REVIEW_REQUIRED",
  "message": "safe passenger-facing or agent-facing explanation",
  "correlationId": "..."
}
```

## 8. Workflow execution

`RecoverDisruptedJourney` is the sole cross-module use case. Its normal path is:

1. `loadCountryProfile` validates the selected country and allowed disruption taxonomy; `acceptDisruptionEvent` validates category, freshness/revision and writes accepted audit entry.
2. `loadJourneySnapshot` validates `sessionId → passengerId → booking`.
3. `assessConnectionRisk` calculates `AT_RISK` using 20-minute transfer buffer.
4. `listFreshOptions` exposes only current catalog options.
5. `createProposal` sends the bounded context to Gemma, validates its JSON and option reference.
6. `decideHold` checks facts, not model confidence; `holdSeat` makes the atomic mutation when permitted.
7. A passenger confirms the exact held option. `decideRebook` checks facts and `rebookTicket` makes the atomic mutation.
8. `buildCaseEffectivenessSummary` derives metrics from audit entries.

Gemma is called only after new passenger constraints, a comparison request or a material catalog refresh. Maximum: three normal calls per case. Confirmation and receipt messages are deterministic; a plain text message can never trigger a mutation without policy.

## 9. UI contract

### Passenger ticket page `/`

- Country selector (`UA` functional, `INTL` preview) and active ticket disruption card: predicted arrival, connection risk and source freshness.
- Bounded chat with visible case context, 3–5 turns only.
- Three comparable option cards: arrival, disruption, conditions, capacity status.
- Hold receipt with a 15-minute countdown; explicit confirm button tied to `optionId`.
- Deterministic result screen: rebooked itinerary or safe escalation explanation.

### Operations dashboard `/agent`

- Case state, country/cause, session-safe booking snapshot, Gemma proposal, policy rules, audit timeline and escalation queue.
- Escalation reason and refresh action.
- No “approve rebook” button.

### Monitor page `/monitor`

- Seeded delay event and an `AT_RISK` journey indicator.
- Reset control only in local development.

The UI never renders hidden chain-of-thought. It may show Gemma's short `reason` and explicit uncertainties only.

## 10. Implementation sequence

1. Scaffold runtime, lint/typecheck, `.env.example`, SQLite/Prisma and resettable seed.
2. Implement data contracts, revision checks, state machine and audit trail with unit tests.
3. Implement country profile → disruption → assessment → catalog → policy → reservation integration without Gemma.
4. Add passenger ticket UI and operations dashboard against deterministic fixtures.
5. Add server-only Gemma adapter and the versioned prompt; test valid, invalid and timeout responses.
6. Wire chat workflow, model-unavailable escalation, countdown and support insights.
7. Run full quality plan; record 90-second demo; only then consider Docker/DigitalOcean.

## 11. Explicit non-goals

No live railway data, real identity verification, money movement, universal intent routing, background workers, external notification provider, vector search, streaming model output or production privacy/compliance claim. The repository README must say this plainly.
