# SafeRoute — AI Customer Support Automation

**PolyTech Code Fest Hackathon Entry**

SafeRoute is an AI-powered operational assistant for travel support teams. When a passenger's train connection is disrupted, SafeRoute automatically assesses the risk, proposes recovery options through Gemma LLM, holds a seat atomically, and lets the passenger confirm the rebook — all with full audit trail and operator oversight.

## Key Features

- **AI Constraint Extraction** — Gemma (`gemma-4-26b-a4b-it`) interprets passenger messages to extract travel constraints (deadline, mode preferences) without following injected instructions
- **Automated Recovery Workflow** — Disruption → risk assessment → option ranking → policy-gated seat hold → passenger confirmation → atomic rebook
- **Operator Dashboard** — Case state, AI-generated briefs, escalation controls, audit timeline, and support effectiveness metrics
- **Immutable Audit Trail** — Every state change, policy decision, and AI interpretation is logged with correlation IDs and revision checks
- **Safety-First Architecture** — Server-side policy decides mutations (not the model), revision-locked transactions prevent stale writes, session binding prevents unauthorized actions

## Architecture

| Layer | Technology |
|---|---|
| Runtime | Node.js 22, TypeScript strict |
| Web | Next.js 16 App Router (React 19) |
| Database | PostgreSQL 16 (Docker) |
| AI Model | Google Gemma `gemma-4-26b-a4b-it` via Generative Language API |
| Styling | Tailwind-free custom CSS (branded UI) |

## Quick Start

```bash
# 1. Clone and configure
git clone https://github.com/dmytroshka-rm/safe-route.git
cd safe-route

# 2. Set your Gemma API key
cp web/.env.example web/.env.local
# Edit web/.env.local → set GEMINI_API_KEY

# 3. Start PostgreSQL + App via Docker
docker compose --profile app up -d

# 4. Open in browser
# http://localhost:3000        — Operations center (incident queue)
# http://localhost:3000/passenger — Passenger recovery chat
# http://localhost:3000/agent    — Operator case review
# http://localhost:3000/monitor  — Disruption event feed
```

## Demo Scenario

1. Open `/` → click **"Оновити інциденти"** to seed the demo
2. Open `/passenger` → click **"Показати ситуацію"** to trigger the disruption
3. Chat: type a constraint like *"Потрібно до 22:00, без автобуса"* — Gemma extracts it
4. Click through: **Recommend** → **Hold** → **Confirm** — full atomic rebook
5. Open `/agent` → see audit trail, generate AI brief, escalate if needed

## Project Structure

```
safe-route/
  docs/           — Product architecture, blueprint, quality plan
  postgres/init/  — PostgreSQL schema (001_schema.sql)
  docker-compose.yml
  web/
    src/
      ai/                    — Gemma LLM adapters (constraint extraction, operator brief)
      app/                   — Next.js pages and API routes
      demo-bootstrap/        — Seed data and demo reset
      recovery-decision/     — Disruption assessment, option ranking
      reservation-actions/   — Atomic hold/rebook with revision locks
      support-insights/      — Case effectiveness metrics from audit trail
      platform/              — Database pool, shared utilities
```

## Non-Goals (MVP Scope)

No live railway data, real identity verification, money movement, background workers, external notifications, vector search, streaming model output, or production compliance claims. This is a hackathon prototype demonstrating AI as an operational support participant.

## Team

Built at PolyTech Code Fest 2026.
