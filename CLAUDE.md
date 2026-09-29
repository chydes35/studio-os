# Studio OS — agent guide

Photographer/videographer business platform. Turborepo: `apps/api` (NestJS, the one backend), `apps/web` (Next.js), `apps/mobile` (Expo), `packages/db` (Prisma), `packages/shared` (Zod DTOs). README.md has setup and per-phase design notes.

## Definition of done

```bash
scripts/verify.sh        # fast: types + lint + unit tests
scripts/verify.sh full   # + migration drift check + API e2e (money paths, tenant isolation, route auth sweep)
```

Run `full` before calling anything done that touches the API, schema, or shared DTOs. Read its "NOT RUN" line: browser/UI and native mobile are not covered, so UI work still needs a real browser check (curl alone has missed broken `<img>` URLs and nested `<form>`s here). A `git push` is blocked by a project hook unless `fast` is green.

## Environment

- Code lives on the SSD; never move it into the iCloud Desktop folder.
- Postgres `studio_os_postgres` (port 5433) and MinIO `studio_os_minio` (9000) are colima containers that do NOT restart with the Mac. `docker start` them (verify.sh does). A stopped DB looks like 500s with PrismaClientInitializationError. Never `docker rm` them.
- e2e runs against the throwaway `studio_os_test` database and refuses any DB name not ending `_test`/`_ci`. The dev DB `studio_os` holds the owner's real account: no `prisma migrate reset/dev`, no `db push` (a hook blocks them).
- Start servers from Bash (`nohup`), not the Browser pane's `preview_start` (it cannot read the iCloud cwd). `next dev` writes untracked `apps/web/AGENTS.md`/`CLAUDE.md`; they are gitignored.
- Dev login: `owner@studio-os.dev` / `devpassword123` (seed).

## Invariants (violating one is a regression)

- **Auth is deny-by-default.** A global `JwtAuthGuard` protects every route; `@Public()` opts out. `test/route-auth.e2e-spec.ts` lists the exact public routes; adding one means editing that list on purpose, and it must be protected by its own capability URL, password, or signature.
- **An existence check is not an auth check.** Owner-mutation handlers must join through to `ownerId` and compare with `OwnerContextService.getOwnerId()`. Extend `test/tenant-isolation.e2e-spec.ts` for every new owned resource.
- **Invoice status is computed** (`computeTotals`/`recomputeStatus`), never set by hand.
- **Contracts are snapshots**: `renderTemplate()` runs once at creation. Never re-render from the live template.
- **No raw date-only math.** All wall-clock/UTC conversion goes through `availability/zoned-time.ts`. Never `new Date('YYYY-MM-DD')`, `setHours`, or `toISOString().slice(0,10)` for a date-only value. Studio timezone is `User.timezone`.
- **Escape email content** with the `html` tagged template in `notifications/email-html.ts`.
- **Private objects use presigned URLs**; only `previews/*` is public.
- **Racy public writes** take `pg_advisory_xact_lock` inside a `$transaction` (see public booking).
- **Unconfigured providers fail loudly, not silently**: Mux/Stripe throw a clear 400; `EmailService.send()` never throws (the cron depends on that). Do not fake success. Google Calendar sync is deferred until real credentials exist; ask, don't stub OAuth.
- **PDFs**: embed Noto Sans with `{subset: false}`; render a real page (`qlmanage -t -s 1000 -o . file.pdf`) and look at it when touching `PdfService`.
- Handlers that can return `null` produce an empty body; the web `request()` helper handles it, so go through it.

## Working style

- Migrations are hand-written (see the `migration-writer` agent), applied with `prisma migrate deploy`. CI diffs them against `schema.prisma`.
- `vitest` does not type-check: run `tsc` (verify.sh does). Date-dependent specs must pin the clock (`vi.setSystemTime`); hard-coded "future" dates rot.
- Prove a test can fail: mutate the code under test, confirm red, restore. Confirm the mutation actually applied.
- Tool gotcha: `\u`/`\x` escape sequences typed into Write/Bash can arrive as real control bytes. Scan files for bytes below 0x20 after writing a regex containing them.
- Squash-merges are done by the user. Retarget a stacked PR to main before merging its base; don't use `--delete-branch` on a base with a dependent PR.
- Use the `studio-os-reviewer` agent on every diff before opening a PR.
