# Studio OS

Business management and client portal platform for photographers and videographers: lead capture, scheduling, contracts, invoicing, secure media proofing/delivery.

## Structure

- `apps/web` — Next.js (owner dashboard + public booking/gallery pages, client)
- `apps/api` — NestJS (REST API; the single backend the web app and the mobile app both talk to)
- `apps/mobile` — Expo/React Native (owner's on-the-go companion app — bookings + clients; see Phase 8 below)
- `packages/db` — Prisma schema + client, shared by `apps/api`
- `packages/shared` — Zod schemas / DTOs shared between `apps/web`, `apps/api`, and `apps/mobile`
- `packages/ui` — shared React components
- `packages/eslint-config`, `packages/typescript-config` — shared tooling config

## Local setup and startup

Use the active SSD checkout at `/Volumes/ExSSD1/Developer/studio-os`. Requirements: Node 24+ (CI uses 26), **npm 11.19.1**, Docker/Colima, and the local services described below. Run commands from the repository root. Install the pinned npm from outside the repository if necessary; its `devEngines` setting rejects other npm versions.

```bash
npm ci
npm run setup:local
npm run dev:local
```

`setup:local` creates a root `.env` from `.env.example` with a random auth secret only if the file is absent. It preserves an existing `.env`, creates/validates the shared workspace env symlinks, starts existing backing containers, generates Prisma, and applies **`migrate deploy`**. It never seeds, resets, deletes a container, or changes an existing account password. `dev:local` repeats these idempotent checks before starting web (3000) and API (3001).

Additional checks:

```bash
node scripts/setup-local.mjs --check     # read-only env/link validation
node scripts/setup-local.mjs --prepare   # env/link creation only; no Docker/DB changes
bash scripts/verify.sh full              # verification on studio_os_test only
```

### Backup and restore

Create backups on a different physical drive from the working database. The local tools require explicit database, bucket, and backup path; they accept local Postgres and MinIO endpoints only, so this command cannot silently export a hosted database or Cloudflare R2 bucket. A backup contains a compressed Postgres dump, every object in the selected media bucket, and a checksum manifest. The output folder is private (`0700`), its files are private (`0600`), and the chosen path must be outside this repository.

```bash
npm run backup:local -- \
  --database studio_os \
  --bucket studio-os-media \
  --output /Volumes/BackupDrive/StudioOS/backup-2026-10-14
```

Restore only targets an empty local database and an empty local media bucket. It never drops a database or overwrites objects. For a recovery drill, restore to new names and smoke-test those copies before changing the app's `.env`:

```bash
npm run restore:local -- \
  --backup /Volumes/BackupDrive/StudioOS/backup-2026-10-14 \
  --database studio_os_restore_test \
  --bucket studio-os-restore-test
```

The restore validates every database/media checksum before writing, verifies uploaded media afterward, and leaves any failed partial restore in place for inspection rather than deleting it. If a prior attempt partially populated the target, choose new target names; the tool intentionally has no destructive cleanup option. The app uses `DATABASE_URL` and `R2_BUCKET_NAME`, so to run against a restored copy, point a separate local configuration at both restored targets. `npm run setup:local` remains the repeatable startup path and applies migrations idempotently; it does not seed or reset account data. Hosted Postgres/R2 backup retention, encryption, and recovery are not configured by these local scripts.

### Backing services on this Mac

The existing `studio_os_postgres` and `studio_os_minio` containers hold persistent studio data. They can be stopped after a reboot. Start Colima if needed (`colima start`); the setup script starts the containers. **Preserve both containers, their cached images, and their volumes.** A missing service makes setup stop with an error rather than silently replacing storage.

For a new local Postgres installation only, create the container once:

```bash
docker run -d --name studio_os_postgres \
  -e POSTGRES_USER=studio_os -e POSTGRES_PASSWORD=studio_os -e POSTGRES_DB=studio_os \
  -p 5433:5432 -v studio_os_pg_data:/var/lib/postgresql/data postgres:16-alpine
```

The local MinIO installation uses a cached image which must be preserved; the old public-image bootstrap is no longer a dependable fresh-machine path. For a fresh machine, provision S3-compatible storage separately or configure Cloudflare R2 before continuing. Local scripts expect the existing `studio_os_minio` container when `R2_ENDPOINT` is set. With R2, clear `R2_ENDPOINT`, fill in the account ID/keys/bucket/public URL, and configure browser PUT CORS. Keep `originals/*`, `contracts/*`, and `locations/*` private; expose only `previews/*`. Do not make the entire bucket public. CI uses a disposable SeaweedFS store, not production media storage.

### First account and existing data

After setup, use `/register` to create an account. The sample seed is optional and **only for a new demo database**: it resets the demo owner's password each time it runs. Do not seed the owner's existing database. Use `npm run migrate:deploy --workspace=@repo/db` for subsequent schema updates; never use `migrate:dev`, `migrate reset`, or `db push` on the real studio database.

Password-reset emails require Resend. Failed delivery is reported in logs without exposing the reset link; there is no log-based recovery bypass. Configure and verify the sender before relying on emailed resets. Reminders distinguish Sent, Failed, and Not configured; temporary provider errors are retried up to three times with one idempotency key, and failed/skipped attempts no longer suppress future configured sends. Use **Run checks now** after fixing provider configuration to retry eligible failed notifications.

For deployment, set a strong `AUTH_SECRET`, the real `WEB_APP_URL`, `NEXT_PUBLIC_API_URL` at web build time, explicit `CORS_ORIGINS`, and the appropriate `TRUST_PROXY`. Local container credentials are demo settings, not production credentials. The setup helper deliberately refuses remote Postgres URLs; provision and migrate hosted databases through a separate deployment procedure.

## Serving clients from this Mac (Cloudflare Tunnel)

Until there is a hosted deployment, clients reach galleries, contracts, invoices and the booking page through a named Cloudflare Tunnel from this Mac. Three hostnames on a domain in your Cloudflare account point at three local services; nothing listens on a public port.

| Hostname | Local service |
| --- | --- |
| `studio.<domain>` | web, production build (3000) |
| `api.<domain>` | API, production build (3001) |
| `media.<domain>` | `scripts/media-gateway.mjs` (9010), in front of MinIO (9000) |

MinIO itself is never published: its admin login is the demo value in `.env.example`. The gateway lets through only anonymous reads of `previews/*`, CORS preflights, and object reads/writes presigned with a limited browser key that cannot list, delete or administer (`scripts/create-browser-key.sh`). `R2_PUBLIC_ENDPOINT` makes the API sign browser links for the media hostname with that key and derive public preview URLs from it (`R2_PUBLIC_URL` is ignored while it is set); server-side storage calls still use the local endpoint. The gateway also refuses every `x-amz-*` (except content-sha256) and `x-minio-*` request header, since a browser sends none.

One-time setup:

```bash
brew install cloudflared
cloudflared tunnel login                 # browser: pick the domain
cloudflared tunnel create studio-os      # prints the tunnel ID
cloudflared tunnel route dns studio-os studio.<domain>
cloudflared tunnel route dns studio-os api.<domain>
cloudflared tunnel route dns studio-os media.<domain>
# merge scripts/cloudflared-config.example.yml into ~/.cloudflared/config.yml (back up any existing file); fill in domain and ID
cp .env.public.example .env.public                                     # fill in domain
docker start studio_os_minio && scripts/create-browser-key.sh   # adds the limited key to .env.public
```

Then `scripts/serve-public.sh start` (and `stop` / `status`). It refuses to start while any account still uses the seed password, while URLs point at localhost, or without the limited key; builds production bundles; starts gateway, API, web and tunnel; and keeps the Mac from sleeping while the API runs (on AC power; a closed lid or battery can still sleep it). `scripts/serve-public.sh start --local` rehearses everything except the tunnel. Stop `npm run dev:local` first (same ports). After a reboot: `colima start`, then start again. Re-running `create-browser-key.sh` rotates the key: restart with `stop` then `start` so the API signs with the new secret. `serve-public.sh` refuses to start if the tunnel config points a hostname at MinIO (9000) or Postgres (5433).

Limits: the Mac must be on, awake and online for clients to reach anything. Cloudflare's free plan caps a single request at 100 MB, so uploads larger than that fail through the tunnel. Emails (Resend) and card payments (Stripe) stay off until configured: copy client links by hand and record payments with **Mark paid**. Public sign-up is closed with `REGISTRATION_OPEN="false"` in `.env.public` (the readiness check requires it to be set, either way); existing accounts still log in. To add a studio later, set it to `true`, restart, register, and set it back. Left unset (local development), `/register` stays open.

## Develop

Use `npm run dev:local` for the checked startup path. `npm run dev` remains available when backing services and migrations are already ready.

Log in at `/login` with the seeded dev account (`owner@studio-os.dev` / `devpassword123`, or `/register` your own). Then: `/clients` to add clients, `/bookings` for the Kanban pipeline (drag cards between stages), `/availability` to set working hours and block off time, and `/book/[ownerId]` for the client-facing booking portal (no login — this is what a client sees; find your own link via the "Public booking page" nav item once logged in).

## Scheduling (Phase 2)

- Owner sets recurring **AvailabilityRule**s (day of week + start/end time + buffer minutes) and one-off **CalendarBlock**s (manual time off) at `/availability`.
- `GET /availability/slots/:ownerId?date=YYYY-MM-DD&durationMins=60` computes open slots for that date from the matching day's rules, minus existing bookings and calendar blocks (each rule's buffer is applied around candidate slots, not around the busy intervals themselves).
- Owners can create a booking from `/bookings` with a client, shoot type, notes, and an optional time selected from those openings. The booking detail page lets the owner correct the client link and shoot details, change notes, reschedule into an opening, remove a scheduled time, and update the stage. Client records can be corrected from `/clients`.
- Owner slot lookup is authenticated at `GET /availability/owner-slots`; edits exclude the booking being moved. Owner create/reschedule and public requests recheck the selected instant inside a transaction holding the same per-studio advisory lock, so concurrent booking writes cannot claim one opening. Dates and labels use the studio's configured time zone.
- The public booking portal (`/book/[ownerId]`) lets a client pick a shoot type + slot and submit a request; `POST /bookings/public-request/:ownerId` re-validates the slot is still open server-side (re-running the same slot computation) before creating the client (upserted by `(ownerId, email)`) and booking, to close the race between two clients requesting the same slot.
- **Google/Apple Calendar sync is not implemented** — it needs a Google Cloud OAuth client (and Apple's CalDAV equivalent), and no such credentials exist yet. `CalendarBlock.source` already has a `"google"` variant reserved in the schema for when that's wired up; until then, all blocks are `"manual"`.

## Media, galleries & watermarking (Phase 3)

- **R2 in dev is MinIO.** There's no Cloudflare R2 account yet, so `apps/api/src/storage/storage.service.ts` points its S3 SDK client at a local MinIO container instead — same S3 API, so switching to real R2 in prod is just dropping `R2_ENDPOINT` and filling in real `R2_ACCOUNT_ID`/keys, no code change. Bucket layout: `originals/<galleryId>/<mediaId>-<fileName>` (private) and `previews/<galleryId>/<mediaId>.jpg` (public — watermarked, safe to serve directly).
- **Upload is a single presigned PUT, not chunked multipart.** The browser still uploads directly to storage, bypassing the app server (`apps/web/lib/api.ts`'s `uploadPhoto`). True multipart was dropped for this path: completing an S3 multipart upload requires reading each part's `ETag` back from the browser, which needs the bucket to expose that header via CORS — this local MinIO build's `PutBucketCors` API returns "not implemented," so that path is closed here. Real Cloudflare R2 _does_ support CORS `ExposeHeaders`, so multipart could be reinstated later if very large raw files need resumable chunked uploads; for now single PUT is enough for photos, and video (the actual 50GB use case) goes through Mux instead.
- **Watermarking runs in a durable Postgres queue.** `POST /media/:id/complete` checks that the original exists in storage, enqueues one unique preview job, and returns `processingStatus: "pending"` without fetching photo bytes into the HTTP request. API replicas claim jobs with `FOR UPDATE SKIP LOCKED`; a ten-minute lease and heartbeat let another replica recover after a crash. The worker retries five times, then marks the photo failed so the owner can retry it from the booking page. Concurrency defaults to one photo per API replica (`JOB_CONCURRENCY`, max two) to bound memory, while each poll drains up to 50 jobs per worker slot instead of waiting ten seconds between photos.
- **Galleries are password-gated but stateless** — there's no session/cookie; the client re-sends the password on every favorite/comment action (`GalleryService.verifyMediaGalleryPassword`) and it's re-checked against the bcrypt hash each time. Simple and correct, just re-hashes more than a real session would; worth revisiting if this becomes a hot path.
- **Video/Mux is deliberately not wired up** — same treatment as Google Calendar in Phase 2. `MuxService` (`apps/api/src/storage/mux.service.ts`) throws a clear "Mux is not configured" error if `MUX_TOKEN_ID`/`MUX_TOKEN_SECRET` are unset, which is always true right now. The `Media`/`Comment` schema already supports video (`muxAssetId`, `muxPlaybackId`, `timestampSeconds` for scrubber comments) for whenever those credentials exist.

## Contracts & e-signature (Phase 4)

- Owner writes **ContractTemplate**s (`/contracts/templates`) with `{{variable_name}}` placeholders in the body text — e.g. `{{client_name}}`, `{{shoot_date}}`, `{{price}}`. There's no fixed variable list; whatever `{{...}}` tokens appear in the template body become fill-in fields.
- Creating a contract for a booking (from the booking detail page) **renders and snapshots** the template immediately — `renderTemplate()` (`apps/api/src/contracts/render-template.ts`) substitutes the variables once at creation time into `Contract.renderedMarkdown`, which is what gets shown/signed from then on. Editing the template later never changes a contract that already exists, which is the correct behavior for a legal document — don't "fix" this into a live reference.
- Known booking/client fields (`client_name`, `client_email`, `shoot_type`, `shoot_date`) are pre-filled into the variable form automatically; anything else (like `price`) the owner types in by hand since there's no pricing field on `Booking` yet (that's Phase 5/Invoices).
- The public sign page (`/contracts/[id]`) is a **capability URL** — the contract's own `cuid` is the only access control, no separate password like galleries have. That's an intentional, lighter security model for this object type (matches how DocuSign/HelloSign envelope links work): the link itself, delivered out of band (email), is the credential.
- E-signature is in-house, not DocuSign/HelloSign: `apps/web/components/SignaturePad.tsx` is an HTML5 canvas capturing a drawn signature as a PNG data URL; signing calls `POST /contracts/:id/sign`, which is guarded against re-signing (409 if `signedAt` is already set) and against a booking getting a second contract (409 on `POST /bookings/:id/contract` if one exists — `Contract.bookingId` is `@unique`).
- On sign, `PdfService` (`apps/api/src/contracts/pdf.service.ts`, using `pdf-lib`) renders the contract body as plain wrapped text (no rich Markdown layout — headers/bold/etc. in `bodyMarkdown` show as literal characters, not styled) plus an audit footer — signer name, ISO timestamp, IP (`req.ip`), user agent — and embeds the signature PNG. The finished PDF is hashed (`sha256`, stored as `Contract.documentHash`) _after_ generation, not before, so the hash isn't self-referential and can be used later to verify the stored file hasn't been tampered with. The PDF is stored privately at `contracts/<contractId>.pdf` in the same R2/MinIO bucket as media; `GET /contracts/:id/download` mints a fresh presigned URL rather than exposing the object directly, and both the owner and the signer can call it — verified end-to-end with a real signature drawn in the browser, confirming the rendered PDF actually contains the embedded signature image and audit fields.

## Financials (Phase 5)

- **Invoices** (`/bookings/[id]`'s Invoices section) have line items (description/qty/unit price) and a `status` (`DRAFT → SENT → PARTIALLY_PAID/PAID`) computed automatically from `sum(payments) vs. sum(lineItems)` — never set by hand. `apps/api/src/payments/invoices.service.ts`'s `computeTotals()`/`recomputeStatus()` are the only places that logic should live; don't duplicate the arithmetic in the frontend beyond display formatting (`apps/web/lib/format.ts`).
- **Manual payments** (`POST /invoices/:id/mark-paid`) always work, regardless of Stripe — this is how a cash/check/Venmo payment gets recorded, and it's the only way to record a payment at all right now since Stripe isn't configured. It accepts a partial amount, so it also covers deposits/milestones without any Stripe involvement.
- **Stripe Checkout is fully coded but unreachable** — same treatment as Mux and Google Calendar: no `STRIPE_SECRET_KEY` exists, so `StripeService.createCheckoutSession()` throws a clear 400 ("Ask the studio owner to add Stripe credentials, or pay by another method") instead of pretending to work — confirmed via curl. The public invoice page (`/invoices/[id]`) checks `stripeConfigured` from the API response and shows an honest "contact your photographer" message instead of a button that would always fail.
- **The Stripe webhook (`POST /stripe/webhook`) is real, complete code that has never received a real event** — it needs `STRIPE_WEBHOOK_SECRET` to verify signatures (`StripeService.constructWebhookEvent`), which doesn't exist either. `main.ts` enables `rawBody: true` in `NestFactory.create` specifically so this handler can access `req.rawBody` for signature verification (regular JSON body parsing for every other route is unaffected). The `checkout.session.completed` handling (create a `Payment`, recompute invoice status) is implemented but untestable until a real Stripe account exists — don't assume it's been exercised.
- **Expenses** (`/expenses`) are a flat owner-level list, optionally tied to a booking (`Expense.bookingId` is nullable) — no reporting/categorization beyond a free-text `category` field and a simple running total on the page.

## Automated workflows & questionnaires (Phase 6)

- **Daily checks use the same durable queue.** Every API replica checks every five minutes whether 9am has passed in `NOTIFICATION_TIME_ZONE` (default `America/Chicago`). A unique key creates at most one job per local day; workers claim it with the same lease protocol, so another replica can finish it after a restart. The manual `/notifications/run-now` endpoint remains immediate and owner-scoped.
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

## Mobile app (Phase 8)

- **`apps/mobile` is a real Expo Router app, not a shell** — it talks to the exact same NestJS API as the web dashboard, the reason the backend was built as a separate service in the first place (see "Why a separate API" below). It shares `@repo/shared`'s Zod-derived types (e.g. `BookingStage`) with web and api; its own `src/lib/api.ts` is a thin fetch wrapper mirroring `apps/web/lib/api.ts`'s pattern (including the same empty-body-safe `request()` helper), covering just the subset of endpoints this app's screens use.
- **Scope is deliberately a focused subset, not full feature parity**: a Bookings tab (list sorted by `scheduledAt`, tap into a detail screen with client contact, shoot info, a stage picker that calls the existing `PATCH /bookings/:id/stage`, read-only location + assigned-equipment info) and a Clients tab (list with tap-to-email/call). Galleries, contracts, invoicing, and questionnaires remain web-only for now — nothing about the architecture prevents adding mobile screens for those later, they just weren't built this phase.
- **No native map SDK, no Google/Apple Maps API key** — the location section deep-links to whichever maps app the OS already has (`https://maps.apple.com/?ll=...` on iOS, `geo:...` on Android, a Google Maps search URL on web) via `Linking.openURL`, rather than embedding `react-native-maps`. This needs zero configuration and works identically whether or not Mux/Stripe/Maps credentials ever get added.
- **This session's Mac only had Xcode Command Line Tools, not full Xcode**, so the iOS Simulator couldn't be used to visually verify the app (that needs a full Xcode install + `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`, which needs interactive `sudo`). Verified instead via `npx expo export -p web` (confirms the whole app type-checks and bundles) and `npx expo start --web` opened in a real browser — Expo Router's web target (`react-native-web`) renders the actual screens and hits the actual API, so this is real functional verification, not a stub check, it just isn't the native iOS renderer. A real device/simulator run is still worth doing once Xcode is available; nothing in the code is web-only.
- **`useFocusEffect` (from `expo-router`), not `useEffect`, drives the two list screens' data loading** — a plain mount-only `useEffect` left the Bookings list showing a stale stage after editing it on the detail screen and navigating back, since tab screens aren't remounted on every visit. Pass a `useCallback`-wrapped, non-async closure to `useFocusEffect`, not the raw async `load` function — `useFocusEffect` inspects its callback's return value and logs a dev warning if it's ever handed a Promise instead of `undefined` or a cleanup function.

## Auth (Phase 9)

Real JWT-based auth, replacing Phase 1's single hardcoded owner — and genuinely multi-tenant: anyone can `POST /auth/register` a new independent studio account, each with its own fully isolated Clients/Bookings/everything.

- **Dev login**: `owner@studio-os.dev` / `devpassword123` (seeded — see `packages/db/prisma/seed.ts`, which hardcodes the bcrypt hash of that password so re-running the seed always resets it to a known value).
- **Secure by default, `@Public()` opts a route out** — `JwtAuthGuard` (`apps/api/src/auth/jwt-auth.guard.ts`) is registered globally via `APP_GUARD`, so a new controller is protected automatically unless explicitly marked otherwise. This is a deliberate reversal from Phase 1–8, where an earlier phase's media-upload endpoints went unauthorized by accident because protection had to be added by hand to each route; opt-out-by-default closes that whole class of bug. The reviewed public-route list is pinned by `apps/api/test/route-auth.e2e-spec.ts`; everything else needs a bearer token.
- **`OwnerContextService` is now request-scoped** (`apps/api/src/owner/owner-context.service.ts`, `@Injectable({ scope: Scope.REQUEST })`), reading `req.user.id` off the token `JwtAuthGuard` attached to the request, instead of always resolving to one hardcoded seeded row. Every service that injects it becomes request-scoped by extension (normal Nest DI behavior) — a small, accepted perf cost for actual per-request correctness.
- **The public booking portal needed a real design change, not just a guard**: unlike galleries/contracts/invoices/questionnaires — each already scoped by its own unguessable resource ID, so they never needed to know "which owner" — the booking portal's two endpoints (`GET /availability/slots`, `POST /bookings/public-request/:ownerId`) previously resolved the owner via the same single-hardcoded-user lookup everything else used. With real multi-tenancy that assumption breaks (whose calendar is a stranger asking about?), so both routes now take the owner's id directly in the URL (`GET /availability/slots/:ownerId`, `POST /bookings/public-request/:ownerId`), and the web app's public booking page moved from a flat `/book` to `/book/[ownerId]`. `SlotsService.getAvailableSlots` no longer touches `OwnerContextService` at all — `ownerId` is just a parameter now.
- **Web**: token + a cached user object live in `localStorage` (`apps/web/lib/auth.ts`) — the cached user is only for rendering the nav instantly, never trusted for anything security-sensitive; the API always re-derives the owner from the token itself. `AuthGate` (`apps/web/components/AuthGate.tsx`) wraps every page via the root layout and redirects to `/login` for any owner-only route (`isPublicPath()` has an explicit carve-out for `/contracts/templates` and `/questionnaires/templates`, since a naive prefix match would wrongly treat those owner-only pages as public alongside `/contracts/[id]` and `/questionnaires/[id]`). `NavBar` shows the owner's dashboard links + a working "Public booking page" link (now pointing at their own `/book/[ownerId]`) + Log out only when authenticated. A 401 from any request clears the token and bounces to `/login`, covering a token that expires mid-session.
- **Mobile**: same bearer-token pattern, but token storage needed a platform split — `expo-secure-store`'s web implementation isn't actually functional on this Expo SDK (`ExpoSecureStore.default.getValueWithKeyAsync is not a function`, caught live in the browser tool while verifying login), so `apps/mobile/src/lib/auth.ts` uses real Keychain/Keystore-backed SecureStore on native and falls back to `localStorage` only on web. The whole app is gated (no public/client-facing screens exist on mobile, unlike the web dashboard), and `expo-router`'s standalone `router` singleton is used to redirect on a 401 from outside a component (`api.ts`), not just from the root layout's own check.
- **Known limitations, not addressed this phase**: JWTs have a 7-day expiry with no refresh-token rotation. Password reset/change and "sign out everywhere" invalidate older sessions through `sessionsValidFrom`; ordinary logout still removes only the local token; the `Role.STAFF` enum value has existed in the schema since Phase 0 but still isn't wired to anything — every registered account is an independent `OWNER` with full access to their own data, there's no "staff member of another owner's studio" concept yet.

## Why a separate API instead of Next.js API routes

`apps/api` is a standalone NestJS service with its own deploy and a documented contract. This is what let the Phase 8 Expo mobile app become just another client of the same API with zero backend rework — same `packages/shared` DTOs for request/response validation, same endpoints, same `OwnerContextService`.

## Operations (Track C)

Run `npm run generate --workspace=@repo/db` and `npx prisma migrate deploy` with the target `DATABASE_URL` before starting the updated API. The new `BackgroundJob` table holds pending work, retry counts, and worker leases. Keep the API process running to process jobs; every replica includes a worker. `GET /health/live` checks that the process responds, while `GET /health/ready` also checks Postgres. Point a host's readiness probe at the latter.

Error reporting is optional until Sentry projects exist. Set `SENTRY_DSN` on the API and web server and `NEXT_PUBLIC_SENTRY_DSN` on the web build to enable it. For web source maps, also set `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` during the build. Without these values, local development and CI send no events. The API production start command preloads `instrument.mjs` before Nest modules and enables source maps. Worker failures are captured explicitly because they happen outside HTTP requests.
