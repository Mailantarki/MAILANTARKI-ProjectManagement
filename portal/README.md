# MAILANTARKI.COM Technical Documentation Portal

Phases 2 and 3 provide authentication, visitor codes, authorized listings and a
private PDF viewer. Phase 4 provides admin upload, organizations/projects,
user creation and grants, access codes, access logs and document archive/restore.
Phase 5 (production hardening and deployment) has not started.
The domain `mailantarki.com` is planned, not configured.

## Local setup

The repo is at `~/dev/portal-documentacion-tecnica`. Docker Desktop must be running.
The earlier location under `~/Documents` caused Docker Desktop to reject bind mounts
under `/host_mnt/Users/.../Documents`, including after removing spaces from the path.
Moving the repo to `~/dev` made `supabase test db` work directly. Studio remains disabled
in the local config; it is not needed for database tests.

```bash
npm install
npx supabase start
npx supabase db reset
npm run dev
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
npm audit --omit=dev
```

Copy `.env.example` to `.env.local` when the application or cleanup task needs
credentials. Fill `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from
your Supabase project. `SUPABASE_SERVICE_ROLE_KEY`, `ACCESS_CODE_PEPPER` (32+ random
characters), and `VISITOR_SESSION_SECRET` (32+ random characters) stay server-side.
Never commit `.env.local`; no production secrets or users are configured by this repo.
The server validates all required variables on startup. Use `npx supabase status -o env`
for local Supabase values and a cryptographic RNG for the two new secrets. The local
site is `http://localhost:3000`, or another port via `npm run dev -- -p 3001`.
Local Supabase keeps `[auth].enable_signup = false` to reject public registration,
while `[auth.email].enable_signup = true` enables email/password sign-in for existing
CLI-created users. Verify the same settings in the hosted Supabase project before deploy.

## Phase 2 operations

Create the first administrator from a trusted terminal. The script prompts for email,
full name, and a hidden password. It refuses to run when a `super_admin` already
exists unless `--force` is explicit. Passwords are never CLI arguments.

```bash
npx tsx scripts/bootstrap-admin.ts
npx tsx scripts/bootstrap-admin.ts --force
```

Create `org_admin` and `member` users manually without sending email. The script
prints a generated temporary password once. `--organization` matches the organization
name case-insensitively; the seed name is `MAILANTARKI.COM`. Project and segment
assignments remain for Phase 4, when this provisional CLI moves to the admin UI with
real invitations.

```bash
npx tsx scripts/create-user.ts --email person@example.com --role member --organization MAILANTARKI.COM
```

To test visitor redemption, sign in as an existing admin in the CLI, enter one or
more comma-separated project slugs, and record the code shown once. Creation uses
the authenticated client and RLS in one `security invoker` transaction. Phase-2
CLI codes cover all segments of their projects, disallow downloads, expire after
24 hours, and permit one redemption; the Phase-4 UI will expose those options.

```bash
npx tsx scripts/create-access-code.ts
```

Redemption is `security definer`, callable only by `service_role`, since visitors
have no Supabase Auth identity. Visitor JWTs carry no grants and are revalidated on
every request. `auth_attempts` is service-only. Run `npm run cleanup:auth-attempts`
daily from a trusted terminal or maintenance job to purge failures older than one day.
Never expose the service role key to a browser.

## Phase 3 document preview

`/projects` shows only authorized projects and counts ready, unarchived documents in
authorized disciplines. `/projects/[slug]` filters by discipline, type, status,
revision, issue-date interval and full-text title/number; filters live in the URL.
Queries paginate 25 documents and sort by latest issue date. For visitor sessions,
each document query is constrained to the authorized project and segment even when
using the server-only administrative reader. The URL endpoint authorizes each view
or download again, records the access and signs the private Storage object for 300
seconds. The viewer refreshes its URL before expiry and obtains a fresh one for
downloads; `file_path` is never returned to the browser.

For **local development only**, the following script creates a minimal three-page
PDF when no file is given, uploads it to private Storage and marks its metadata
ready. It refuses a nonlocal Supabase URL. Provide local `NEXT_PUBLIC_SUPABASE_URL`
and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` first. The script is not the real
admin upload workflow, which belongs to Phase 4. A database reset removes these
sample PDFs and they must be recreated after running SQL tests (some SQL fixtures
assert exact document totals).

```bash
npx tsx scripts/seed-test-document.ts --segment architecture-structure
npx tsx scripts/seed-test-document.ts --segment mep
npx tsx scripts/seed-test-document.ts --segment landscaping
npx tsx scripts/seed-test-document.ts ./drawing.pdf --project maylan-plaza --segment interior-design
```

Three local samples were seeded for MAILANTARKI Sports Complex in architecture,
MEP and landscaping. No permanent user is seeded; use the Phase 2 bootstrap CLI
and access grants/code tooling to open them in a browser.

### Bulk import (admin, CLI)

Import a folder of PDFs as an authenticated admin (prompts for email and password;
password is never passed on the command line):

```bash
npx tsx scripts/bulk-import.ts --directory "../pdf/MAURITIUS ARCHIVE" --project mauritius-golf-estate --segment architecture-structure
```

Before making any writes, the CLI checks every `.pdf` file for `%PDF-`, size at most
50 MB, nonempty title and unique document number (up to 60 characters). It derives
the title from the filename without `.pdf`; for `MAURITIUS - FLOOR TYPE 1-A.pdf`,
the title is `FLOOR TYPE 1-A` and the number is `MAURITIUS-FLOOR-TYPE-1-A`.
The existing Mauritius numbers are intentionally unchanged, so rerunning this import
skips the 22 ready documents. The authenticated user inserts and finalizes metadata
under RLS; service role only signs and uploads the private object. Interrupted pending
rows with an already-uploaded object are validated and finalized on retry.
The `pending -> ready` transition uses the server-only `finalize_document_upload`
RPC after byte validation; it checks Storage object existence and actual size.
The default type `plan`, revision `0` and status `draft` need review against the actual
drawing history before the documents are treated as published project records. The
source files stay outside the repository. The old service-role Mauritius script is
disabled. A database reset removes local imports; rerun the CLI after `npm test`.

`npm run test:e2e` requires Docker, local Supabase, the Mauritius archive at the
documented sibling path, and installed Playwright Chromium
(`npx playwright install chromium`). It builds and starts its own app at port 3107,
creates a temporary member, segment grants and visitor code, seeds two generated
PDFs plus one actual Mauritius PDF, checks three browser flows, and removes the
temporary objects, rows and user. Audit logs remain intact.
Stop any separate `next dev` process in this checkout before running it, since both
commands write `.next`. The filter integration suite in `npm test` creates and
removes its own eight-document project independently of the local PDF import.

## Data and permissions

The seed creates one organization (`MAILANTARKI.COM`), six projects and four fixed
disciplines. No PDF, user, or access code is seeded.

Authenticated users read through RLS. `super_admin` can manage all organizations;
`org_admin` manages only its organization; `member` reads assigned projects and
segments. Visitors with codes have only their grants. Direct clients cannot read
`documents.file_path` or `access_codes.code_hash`. Admins can read pending and archived
document metadata for management; portal queries must explicitly require active
organization, active project, unarchived document and `upload_status = 'ready'`.

Admin writes to `organizations`, `projects`, `documents`, `profiles`,
`user_project_access`, `access_codes`, and `access_code_grants` use the authenticated
user client and RLS. `service_role` is restricted to Storage/signed URLs, atomic
redemption and persistent rate limiting, Auth user creation with the matching initial
profile insert from trusted CLI scripts, `access_logs` insertion, read-only
authorization lookups, controlled cleanup, and the narrow server-only
`finalize_document_upload` RPC. Ordinary admin metadata writes and code creation
still use the authenticated client under RLS.

`organizations`, `projects`, and ready `documents` are archived by setting `archived_at`.
A trigger sets the timestamp and actor. The app cannot physically delete organizations,
projects or ready documents; a project admin may delete only unfinished `pending`
metadata when canceling a failed upload. Project foreign keys restrict physical deletion, while deleting a
document after retention sets `access_logs.document_id` to null and retains title,
number and project-name snapshots. The original migration is unchanged; later
schema adjustments are separate, versioned migrations.

Supabase's default grants included `TRUNCATE` and `TRIGGER` for client roles. The
fourth migration revokes those privileges (plus `REFERENCES` and `MAINTAIN`) on all
current public tables. Every future public table needs the same revoke in its own
migration; RLS does not protect `TRUNCATE`.

## Archived PDF cleanup

The cleanup task uses only the server-side `SUPABASE_SERVICE_ROLE_KEY`. It selects
documents archived more than 30 days ago and pending uploads older than one hour,
removes each object from the private
`documents` bucket, then deletes its metadata row. The log snapshot remains. A failed
Storage removal leaves the row for a later retry. Run it from a trusted terminal or
scheduled server job, never from a browser or public route:

```bash
npm run cleanup:archived
npm run cleanup:archived -- --execute
npm run cleanup:archived -- --execute --limit=25
```

The first command is a dry-run. Each invocation processes at most 100 documents.
Configure `.env.local` first. A scheduled run should alert on nonzero exit status.
Only document IDs are printed; object paths and credentials are not logged.
The same command also purges interrupted `pending` uploads older than one hour.

## Phase 4 admin panel

`/admin` is server-gated to `super_admin` and `org_admin`. Every mutation checks
the principal again inside the server action. Organization and project changes,
user assignments, code creation/revocation and log reads use the authenticated
client under RLS. Creating an Auth user and its initial profile is the narrow
documented service-role exception; the temporary password appears once and is not
emailed in this MVP. `org_admin` cannot create `super_admin` or manage another
organization, including by direct server-action calls. The older CLI user and
code scripts remain as fallback tools.
The user list reads Auth email addresses with the server-only Auth admin API,
then shows only profiles visible through the requesting admin's RLS scope.

`/admin/organizations` and `/admin/projects` create, edit, archive and restore
records. `/admin/projects/[slug]/documents` lists active and archived documents
and permits archive/restore only; physical deletion and the cleanup command are
not available in the panel. `/admin/users` creates accounts and assigns project/discipline access;
`/admin/codes` creates segment-scoped codes atomically and revokes/reactivates them.
`/admin/logs` filters access history and streams a CSV with spreadsheet-formula
escaping. Audit logs are never deleted by the E2E suite. Restoration only changes
`archived_at`; a physical delete is never offered in the panel.

The Phase 4 closeout passed 44 TypeScript tests, 110 SQL assertions,
7 browser E2E tests, lint, typecheck, build and a production dependency audit.
The browser suite includes an isolated visitor context: an admin creates a code,
the visitor sees only its discipline, a direct request for another PDF returns
404, and revocation cuts access on the next request. New migrations were applied
locally without resetting Storage; Mauritius still has 22 ready rows, 22 private
objects and no orphan objects. A fresh local `supabase db reset` on 2026-09-22
applied every migration and seed. The real Mauritius importer then reported
`22 uploaded / 0 duplicates` followed by `0 uploaded / 22 duplicates`; verification
found 22 ready rows, 22 private objects and zero orphans. The temporary import
super admin was demoted and its Auth account soft-deleted after verification.
The Phase 4 security review is approved with a production observation: verify
the trusted proxy's `x-forwarded-for` behavior before relying on it for IP rate
limiting in Phase 5. No deployment or remote Supabase changes have been made.

## Verification and remaining work

On 2026-09-21, Phase 1 passed `npx supabase db reset`, `npm run lint`, `npm run typecheck`,
`npm test` (58 SQL assertions), and `npm audit --omit=dev` from `~/dev`.
The cleanup dry-run against local Supabase found zero eligible documents. A local
integration fixture confirmed that `--execute` removes the private object and
document row while preserving the log snapshot; the database was reset afterward.
Database checks found one organization, six projects, four segments, zero tables
in `public` without RLS, no client `TRUNCATE`/`TRIGGER`/`MAINTAIN` privileges,
and a private `documents` bucket.

Phase 2 was verified locally on 2026-09-21: the six versioned migrations and seed
reset cleanly; `npm test` passed 21 TypeScript tests and 76 SQL assertions, including
single-use code concurrency, atomic rate-limit concurrency, RLS and visitor revocation.
Real HTTP smoke tests confirmed password login with a temporary user, rejection of
public signup, code redemption with a restricted cookie, immediate revocation and
401/401/401/401/401/429 for both failed login and code attempts. Temporary users,
codes and logs were removed, then the database was reset. No permanent user or code
has been created. `npm run build`, lint, typecheck and dependency audit passed.

Phase 3 verification on 2026-09-21: reset applied all seven migrations; `npm test`
passed 30 TypeScript tests (including one real-DB integration test with 15 exact-ID
subset assertions and one visitor-only tab assertion) and 76 SQL assertions.
`npm run test:e2e` passed three Chromium tests: member isolation and PDF controls,
visitor isolation and direct-ID 404, and rendering one real Mauritius floor plan.
Lint, typecheck, build and production dependency audit passed independently. The
Mauritius import was restored after the SQL tests: 22 ready document rows, 22
objects in the private bucket, zero duplicates on rerun. Three generated Sports
Complex samples were also restored. No temporary E2E users or codes remain.
Phase 4 must not begin before security review approval.
