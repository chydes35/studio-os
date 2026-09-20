# Studio OS

Business management and client portal platform for photographers and videographers: lead capture, scheduling, contracts, invoicing, secure media proofing/delivery.

## Structure

- `apps/web` — Next.js (owner dashboard + public booking/gallery pages, client)
- `apps/api` — NestJS (REST API; the single backend the web app and, later, a mobile app both talk to)
- `packages/db` — Prisma schema + client, shared by `apps/api`
- `packages/shared` — Zod schemas / DTOs shared between `apps/web` and `apps/api`
- `packages/ui` — shared React components
- `packages/eslint-config`, `packages/typescript-config` — shared tooling config

## Setup

```bash
# Local Postgres (docker compose isn't installed on this machine — plain docker run instead)
docker run -d --name studio_os_postgres \
  -e POSTGRES_USER=studio_os -e POSTGRES_PASSWORD=studio_os -e POSTGRES_DB=studio_os \
  -p 5433:5432 -v studio_os_pg_data:/var/lib/postgresql/data postgres:16-alpine

cp .env.example .env   # already pre-filled with the local DATABASE_URL above; add R2/Mux/Stripe/Resend keys when ready
npm install
npm run --workspace=@repo/db generate
npm run --workspace=@repo/db migrate:dev
npm run --workspace=@repo/db seed   # creates a dev owner + sample clients/bookings
```

`.env` is symlinked into `packages/db/.env`, `apps/api/.env`, and `apps/web/.env.local` so every workspace package/app picks up the same values regardless of its own cwd.

## Develop

```bash
npm run dev   # runs web (port 3000) and api (port 3001) together via turbo
```

Visit `/clients` to add clients, `/bookings` for the Kanban pipeline (drag cards between stages), `/availability` to set working hours and block off time, and `/book` for the client-facing booking portal (no auth — this is what a client sees).

## Scheduling (Phase 2)

- Owner sets recurring **AvailabilityRule**s (day of week + start/end time + buffer minutes) and one-off **CalendarBlock**s (manual time off) at `/availability`.
- `GET /availability/slots?date=YYYY-MM-DD&durationMins=60` computes open slots for that date from the matching day's rules, minus existing bookings and calendar blocks (each rule's buffer is applied around candidate slots, not around the busy intervals themselves).
- The public booking portal (`/book`) lets a client pick a shoot type + slot and submit a request; `POST /bookings/public-request` re-validates the slot is still open server-side (re-running the same slot computation) before creating the client (upserted by `(ownerId, email)`) and booking, to close the race between two clients requesting the same slot.
- **Google/Apple Calendar sync is not implemented** — it needs a Google Cloud OAuth client (and Apple's CalDAV equivalent), and no such credentials exist yet. `CalendarBlock.source` already has a `"google"` variant reserved in the schema for when that's wired up; until then, all blocks are `"manual"`.

## Auth

Phase 1 has no auth yet — every owned record resolves to a single seeded "OWNER" user via `OwnerContextService` (`apps/api/src/owner/owner-context.service.ts`). This gets replaced with real request-scoped auth in a later phase; don't build multi-tenant assumptions on top of it yet.

## Why a separate API instead of Next.js API routes

`apps/api` is a standalone NestJS service with its own deploy and a documented contract. When the React Native/Expo mobile app is built in Phase 2, it becomes just another client of the same API — no backend rework, same `packages/shared` DTOs for request/response validation.
