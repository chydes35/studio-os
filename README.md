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

## Contracts & e-signature (Phase 4)

- Owner writes **ContractTemplate**s (`/contracts/templates`) with `{{variable_name}}` placeholders in the body text — e.g. `{{client_name}}`, `{{shoot_date}}`, `{{price}}`. There's no fixed variable list; whatever `{{...}}` tokens appear in the template body become fill-in fields.
- Creating a contract for a booking (from the booking detail page) **renders and snapshots** the template immediately — `renderTemplate()` (`apps/api/src/contracts/render-template.ts`) substitutes the variables once at creation time into `Contract.renderedMarkdown`, which is what gets shown/signed from then on. Editing the template later never changes a contract that already exists, which is the correct behavior for a legal document — don't "fix" this into a live reference.
- Known booking/client fields (`client_name`, `client_email`, `shoot_type`, `shoot_date`) are pre-filled into the variable form automatically; anything else (like `price`) the owner types in by hand since there's no pricing field on `Booking` yet (that's Phase 5/Invoices).
- The public sign page (`/contracts/[id]`) is a **capability URL** — the contract's own `cuid` is the only access control, no separate password like galleries have. That's an intentional, lighter security model for this object type (matches how DocuSign/HelloSign envelope links work): the link itself, delivered out of band (email), is the credential.
- E-signature is in-house, not DocuSign/HelloSign: `apps/web/components/SignaturePad.tsx` is an HTML5 canvas capturing a drawn signature as a PNG data URL; signing calls `POST /contracts/:id/sign`, which is guarded against re-signing (409 if `signedAt` is already set) and against a booking getting a second contract (409 on `POST /bookings/:id/contract` if one exists — `Contract.bookingId` is `@unique`).
- On sign, `PdfService` (`apps/api/src/contracts/pdf.service.ts`, using `pdf-lib`) renders the contract body as plain wrapped text (no rich Markdown layout — headers/bold/etc. in `bodyMarkdown` show as literal characters, not styled) plus an audit footer — signer name, ISO timestamp, IP (`req.ip`), user agent — and embeds the signature PNG. The finished PDF is hashed (`sha256`, stored as `Contract.documentHash`) *after* generation, not before, so the hash isn't self-referential and can be used later to verify the stored file hasn't been tampered with. The PDF is stored privately at `contracts/<contractId>.pdf` in the same R2/MinIO bucket as media; `GET /contracts/:id/download` mints a fresh presigned URL rather than exposing the object directly, and both the owner and the signer can call it — verified end-to-end with a real signature drawn in the browser, confirming the rendered PDF actually contains the embedded signature image and audit fields.

## Financials (Phase 5)

- **Invoices** (`/bookings/[id]`'s Invoices section) have line items (description/qty/unit price) and a `status` (`DRAFT → SENT → PARTIALLY_PAID/PAID`) computed automatically from `sum(payments) vs. sum(lineItems)` — never set by hand. `apps/api/src/payments/invoices.service.ts`'s `computeTotals()`/`recomputeStatus()` are the only places that logic should live; don't duplicate the arithmetic in the frontend beyond display formatting (`apps/web/lib/format.ts`).
- **Manual payments** (`POST /invoices/:id/mark-paid`) always work, regardless of Stripe — this is how a cash/check/Venmo payment gets recorded, and it's the only way to record a payment at all right now since Stripe isn't configured. It accepts a partial amount, so it also covers deposits/milestones without any Stripe involvement.
- **Stripe Checkout is fully coded but unreachable** — same treatment as Mux and Google Calendar: no `STRIPE_SECRET_KEY` exists, so `StripeService.createCheckoutSession()` throws a clear 400 ("Ask the studio owner to add Stripe credentials, or pay by another method") instead of pretending to work — confirmed via curl. The public invoice page (`/invoices/[id]`) checks `stripeConfigured` from the API response and shows an honest "contact your photographer" message instead of a button that would always fail.
- **The Stripe webhook (`POST /stripe/webhook`) is real, complete code that has never received a real event** — it needs `STRIPE_WEBHOOK_SECRET` to verify signatures (`StripeService.constructWebhookEvent`), which doesn't exist either. `main.ts` enables `rawBody: true` in `NestFactory.create` specifically so this handler can access `req.rawBody` for signature verification (regular JSON body parsing for every other route is unaffected). The `checkout.session.completed` handling (create a `Payment`, recompute invoice status) is implemented but untestable until a real Stripe account exists — don't assume it's been exercised.
- **Expenses** (`/expenses`) are a flat owner-level list, optionally tied to a booking (`Expense.bookingId` is nullable) — no reporting/categorization beyond a free-text `category` field and a simple running total on the page.

## Automated workflows & questionnaires (Phase 6)

- **Scheduling uses `@nestjs/schedule`, not Trigger.dev/Inngest** — no account exists for either, and a cron decorator needs zero external infra to actually run. `NotificationsScheduler` (`apps/api/src/notifications/notifications.scheduler.ts`) fires `@Cron(CronExpression.EVERY_DAY_AT_9AM)`; this is a real, working substitute (like MinIO for R2), not a stub — it only stops being sufficient if this API ever runs on more than one replica (no distributed lock), at which point a real job queue is worth reinstating.
- **`POST /notifications/run-now`** runs the exact same checks on demand — this is how the owner (or anyone testing this app) doesn't have to wait for 9am. Verified live: seeded a booking scheduled 3 days out and an overdue invoice, ran the checks, got one `EmailLog` row for each with the correct dedup behavior confirmed on a second run (0 processed the second time).
- **Two checks run daily**: shoot reminders (bookings scheduled exactly `REMINDER_DAYS_BEFORE` = 3 days out, sent once — checked via an existing `EmailLog` row, not a boolean flag) and overdue invoices (`SENT`/`PARTIALLY_PAID` invoices past `dueAt` get flipped to `OVERDUE` every run, but only re-notified at most once per 24h). Both live in `NotificationsService` (`apps/api/src/notifications/notifications.service.ts`) — this is the only place that scheduling/dedup logic should live.
- **`EmailService` (Resend) is gated, same as Mux/Stripe/Google Calendar** — no `RESEND_API_KEY` exists, so `send()` never throws (a cron job has no HTTP request to fail) but returns `{ delivered: false }`, which gets recorded as `EmailLog.status = "skipped_not_configured"`. The `/notifications` page shows every attempt with an honest "Not sent (Resend not configured)" label rather than pretending emails went out — this `EmailLog` table is what makes the whole automation pipeline verifiable without ever sending a real email.
- **Questionnaires**: owner builds a template (`/questionnaires/templates`) as an ordered list of fields (`text`/`textarea`/`select`/`checkbox`), each field's `id` auto-slugified from its label. A booking can have multiple questionnaires assigned (`Booking.questionnaireResponses` was already an array in the Phase-0 schema — unlike Gallery/Contract, this one was never meant to be 1:1). The public fill page (`/questionnaires/[id]`) is a capability URL like contracts — no password — and is guarded against resubmission (409 if `submittedAt` is already set), confirmed via curl.

## Equipment & location scouting (Phase 7)

- **`Equipment`, `Location`, and `LocationPhoto` were already fully modeled in the Phase-0 schema** but never wired up until this phase — no new core tables were needed, just: `BookingEquipment` (a many-to-many "packing list" join table between bookings and gear), `EmailLog.equipmentId` (for the service-reminder check below), and `Equipment.createdAt`/`updatedAt` (missing since Phase 0, added for consistency and because the reminder dedup needs `updatedAt`).
- **Equipment (`/equipment`)** is a flat owner-level inventory with `nextServiceDue`/`lastServicedAt` tracking. A booking can have gear assigned to it as a checklist (`BookingEquipmentSection` on `/bookings/[id]`) via `BookingEquipment` — this is a plain assignment list, not a checkout/return workflow, and there's no double-booking conflict check across overlapping shoot dates.
- **A third daily notification check was added**: `NotificationsService.checkEquipmentServiceDue()` alerts the studio owner (not a client — it emails `owner.email`) when `nextServiceDue` is within 14 days or already past. Its dedup is different from the other two checks: rather than "ever" (shoot reminders) or "within 24h" (overdue invoices), it re-alerts only if the `Equipment` row's `updatedAt` is newer than the last alert's `createdAt` — so servicing the gear (or editing the record at all) resets the reminder for its next cycle instead of nagging forever or going silent forever. `POST /notifications/run-now`'s response now includes `equipmentAlertsSent`.
- **Locations (`/locations`) use a real Leaflet + OpenStreetMap map, not a stub** — same "genuine free substitute" treatment as MinIO-for-R2 and cron-for-Trigger.dev, this time for a paid/key-gated Google Maps JS API. Plain `leaflet` is used directly (dynamically imported client-side, no `react-leaflet` wrapper) specifically to avoid its peer-dependency pin to React 18 on this React 19 app. Clicking the map drops a draft pin when adding a location; `LocationsMap.tsx` owns all Leaflet lifecycle (map init, markers, cleanup) behind a plain component API.
- **Address search uses OpenStreetMap's Nominatim**, also free and key-less — proxied through the API (`GET /locations/geocode`) rather than called from the browser, because Nominatim's usage policy wants a real `User-Agent`/`Referer` identifying the app, which browser JS cannot set on `fetch` (only a server can).
- **Location reference photos are private, not public** — unlike gallery previews (whose R2/MinIO prefix is public-read so clients can view them unauthenticated), location photos are the owner's own scouting reference material, so they're served through `StorageService.getPresignedGetUrl()` (same pattern as contract PDFs) rather than `publicUrl()`. This was caught by an actual `ERR_BLOCKED_BY_ORB` in browser testing — the first implementation used `publicUrl()` and MinIO correctly 403'd it, since only the `previews/*` prefix has a public-read bucket policy.
- **A booking can be linked to one saved location** via the pre-existing `Booking.locationId` — `PATCH /bookings/:id/location` (`BookingLocationSection` on `/bookings/[id]`) sets or clears it from a dropdown of saved locations.

## Auth

Phase 1 has no auth yet — every owned record resolves to a single seeded "OWNER" user via `OwnerContextService` (`apps/api/src/owner/owner-context.service.ts`). This gets replaced with real request-scoped auth in a later phase; don't build multi-tenant assumptions on top of it yet.

## Why a separate API instead of Next.js API routes

`apps/api` is a standalone NestJS service with its own deploy and a documented contract. When the React Native/Expo mobile app is built in Phase 2, it becomes just another client of the same API — no backend rework, same `packages/shared` DTOs for request/response validation.
