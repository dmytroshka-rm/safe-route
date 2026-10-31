# SafeRoute demo script — 3 minutes

## 1. Operational problem — 25 seconds

Open `/monitor`. Run automated recovery assessment on the live Safety Hub event. Explain: SafeRoute consumes a verified operator signal, detects that the 14:00 connection is missed and moves the case to `OPTIONS_READY` with an audit record.

## 2. Human support control — 40 seconds

Open `/agent`. Show the same case, inventory and the **Ефективність support** panel: time-to-hold, outcome, AI interpretations and manual decisions, all computed from the audit trail. Generate an AI brief. Emphasize that an operator can escalate for manual review but cannot silently rebook a ticket.

## 3. Passenger recovery — 70 seconds

Open `/passenger`. Set an arrival deadline of `23:00` or send it in chat. Show Gemma extracting the constraint, then build the personalized plan and the partner bus recommendation (arrival 21:50). Hold and confirm rebooking.

## 4. Trust boundary and effectiveness — 30 seconds

Return to `/agent` or `/`. Point to the updated booking, audit trail and live metrics (time-to-hold, recovered). State: AI interprets the passenger need and briefs the agent; deterministic server policy validates the case, capacity, revisions and explicit passenger confirmation before rebooking.

## Backup branch — 20 seconds

Reset demo, set deadline to `20:00` and build a plan. Explain that no fabricated recommendation is offered; the case becomes `ESCALATED` for support review and insights show the escalation reason.
