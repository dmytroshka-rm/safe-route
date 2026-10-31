# SafeRoute: Quality Plan

**Status:** READY TO EXECUTE AFTER IMPLEMENTATION  
**Tests executed:** false  
**Release approved:** false  
**Behavior source:** `SafeRoute-Product-Architecture.md` v0.4 and `SafeRoute-Implementation-Blueprint.md` v1.1.

## Quality goal

Prove that SafeRoute performs one safe, observable recovery flow with a real Gemma call, while unsafe, stale, malformed and unauthorized paths cannot change booking state.

## Risk-led coverage

| Risk | Evidence required | Test level | Gate |
|---|---|---|---|
| Wrong passenger confirms a rebook | Exact `sessionId → passengerId → caseId` mismatch returns `FORBIDDEN`; booking unchanged | integration | required |
| Double booking / retry | Same idempotency key returns same receipt; capacity decremented once | unit + integration | required |
| Seat goes stale | Changed `optionRevision` returns `STALE`; no ticket/reservation partial write | integration | required |
| Hold expires | Capacity restored, audit event exists, confirmation refused | integration + e2e | required |
| Model output causes unsafe action | Invalid, unknown-option, injection or low-confidence proposal causes no mutation | unit + adapter integration | required |
| Hosted model is unavailable | timeout/error shows safe escalation, not fake answer | adapter integration | required |
| Main product value is invisible | E2E shows hold → explicit confirmation → rebook → audit/insights | Playwright | required |
| Sensitive data leaks | Prompt/audit fixtures contain no name, phone, email, payment or API key | code review + tests | required |
| UI is unclear | Hold deadline, option conditions and next action visible before confirmation | manual visual check + e2e assertions | required |
| Country profile invents facts | `UA` / `INTL` changes allowed taxonomy only; an actual disruption must still come from an event | unit + integration | required |

## Required deterministic tests

1. **Happy path:** fresh event 17:00 makes the 14:00 connection `AT_RISK`; valid proposal selects `OPT-FAST-01`; hold succeeds; matching passenger confirms; ticket revision increments; insights report time-to-hold.
2. **No session / wrong session:** confirmation returns `FORBIDDEN`, zero writes except safe audit of denied attempt.
3. **Prompt injection:** passenger text asks to ignore policy; Gemma response cannot itself call action; only verified constraints may be used.
4. **Stale disruption:** event older than 300 seconds or lower source revision does not create/alter a case action.
5. **Stale option:** capacity/revision changes after hold display; rebook returns `STALE`, does not alter booking.
6. **Expiry:** test clock passes 15 minutes; `expireHold` restores capacity, state becomes `HOLD_EXPIRED`, late confirmation is refused.
7. **Model failure:** timeout, invalid JSON and wrong schema produce one repair maximum then escalation; no reservation record is created.
8. **Low confidence:** syntactically valid proposal with `0.69` becomes agent review, never an automatic hold.
9. **No alternatives:** catalog returns none; case is escalated with a human-readable reason.
10. **Reset:** `POST /api/demo/reset` recreates exactly the known scenario locally; endpoint excluded from deployed build.
11. **Country profile boundary:** `UA` accepts seeded `SAFETY_ALERT`; `INTL` preview cannot fabricate an incident or start a separate live recovery case without a valid mock event.

## E2E demo acceptance script

1. Reset seed and open `/monitor`; reviewer sees UA profile, a fresh safety-alert delay and an `AT_RISK` transfer.
2. Open passenger ticket page; send arrival constraint before 23:00.
3. Observe a Gemma-backed concise proposal, option cards and policy-approved 15-minute hold.
4. Confirm Option A; observe updated itinerary, receipt, audit timeline and calculated support insights.
5. Reset and run either model-unavailable or stale-option fixture; observe safe escalation/no mutation.

The E2E test must stub only the provider transport in automated CI. The final live-demo preflight separately sends one actual request to Gemma and records only success/failure plus model name — never the API key.

## Quality gates

| Gate | Pass condition | Current state |
|---|---|---|
| Contract gate | TypeScript, Zod schemas and module public contracts compile | NOT_RUN |
| Domain gate | All ten deterministic tests pass | NOT_RUN |
| Security gate | Session, revision, idempotency, prompt-boundary and secret checks pass | NOT_RUN |
| Model gate | Live Gemma preflight returns schema-valid proposal within 8 s | NOT_RUN |
| Demo gate | Playwright happy path and one guardrail path pass | NOT_RUN |
| Presentation gate | 90-second recording contains facts → proposal → policy → receipt → outcome | NOT_RUN |

Do not label the project “production-ready” after these gates. Passing them proves only the stated synthetic MVP.
