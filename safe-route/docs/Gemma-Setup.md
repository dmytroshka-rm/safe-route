# Gemma setup for SafeRoute

1. Open `web/.env.local` locally. This file is ignored by Git.
2. Add `GEMINI_API_KEY=...` using the key from Google AI Studio.
3. Rebuild the application: `docker compose --profile app up -d --build app`.

SafeRoute sends Gemma only the passenger's message and the selected option identifier to formulate an explanation. Ticket mutation, option ranking, holds and rebooking remain deterministic server-side actions.
