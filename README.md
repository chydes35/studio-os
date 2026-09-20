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

# Local MinIO standing in for Cloudflare R2 (S3-compatible) — see the Media
# section below for why, and note the image is quay.io/minio/minio, not
# docker.io/minio/minio (that one now needs a Docker Hub login to pull).
docker volume create studio_os_minio_data
docker run -d --name studio_os_minio \
  -e MINIO_ROOT_USER=studio_os -e MINIO_ROOT_PASSWORD=studio_os_minio \
  -p 9000:9000 -p 9001:9001 -v studio_os_minio_data:/data \
  quay.io/minio/minio server /data --console-address ":9001"
# Then create the bucket once (previews/ public, everything else private):
docker run --rm --add-host=host.docker.internal:host-gateway --entrypoint sh quay.io/minio/mc \
  -c "mc alias set local http://host.docker.internal:9000 studio_os studio_os_minio && \
      mc mb local/studio-os-media && \
      mc anonymous set download local/studio-os-media/previews"

cp .env.example .env   # already pre-filled with the local DATABASE_URL/R2_* above; add Mux/Stripe/Resend keys when ready
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

## Media, galleries & watermarking (Phase 3)

- **R2 in dev is MinIO.** There's no Cloudflare R2 account yet, so `apps/api/src/storage/storage.service.ts` points its S3 SDK client at a local MinIO container instead — same S3 API, so switching to real R2 in prod is just dropping `R2_ENDPOINT` and filling in real `R2_ACCOUNT_ID`/keys, no code change. Bucket layout: `originals/<galleryId>/<mediaId>-<fileName>` (private) and `previews/<galleryId>/<mediaId>.jpg` (public — watermarked, safe to serve directly).
- **Upload is a single presigned PUT, not chunked multipart.** The browser still uploads directly to storage, bypassing the app server (`apps/web/lib/api.ts`'s `uploadPhoto`). True multipart was dropped for this path: completing an S3 multipart upload requires reading each part's `ETag` back from the browser, which needs the bucket to expose that header via CORS — this local MinIO build's `PutBucketCors` API returns "not implemented," so that path is closed here. Real Cloudflare R2 *does* support CORS `ExposeHeaders`, so multipart could be reinstated later if very large raw files need resumable chunked uploads; for now single PUT is enough for photos, and video (the actual 50GB use case) goes through Mux instead.
- **Watermarking is synchronous and inline**, not a background job: `POST /media/:id/complete` fetches the original from storage, tiles a "PREVIEW" watermark over it with `sharp`, and uploads the result to `previews/`. Fine for single-photo latency; would want to move to a queue (Trigger.dev/Inngest) before this needs to handle a batch of 200 RAW files at once.
- **Galleries are password-gated but stateless** — there's no session/cookie; the client re-sends the password on every favorite/comment action (`GalleryService.verifyMediaGalleryPassword`) and it's re-checked against the bcrypt hash each time. Simple and correct, just re-hashes more than a real session would; worth revisiting if this becomes a hot path.
- **Video/Mux is deliberately not wired up** — same treatment as Google Calendar in Phase 2. `MuxService` (`apps/api/src/storage/mux.service.ts`) throws a clear "Mux is not configured" error if `MUX_TOKEN_ID`/`MUX_TOKEN_SECRET` are unset, which is always true right now. The `Media`/`Comment` schema already supports video (`muxAssetId`, `muxPlaybackId`, `timestampSeconds` for scrubber comments) for whenever those credentials exist.

## Auth

Phase 1 has no auth yet — every owned record resolves to a single seeded "OWNER" user via `OwnerContextService` (`apps/api/src/owner/owner-context.service.ts`). This gets replaced with real request-scoped auth in a later phase; don't build multi-tenant assumptions on top of it yet.

## Why a separate API instead of Next.js API routes

`apps/api` is a standalone NestJS service with its own deploy and a documented contract. When the React Native/Expo mobile app is built in Phase 2, it becomes just another client of the same API — no backend rework, same `packages/shared` DTOs for request/response validation.
