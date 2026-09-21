# MAILANTARKI.COM Technical Documentation Portal

The project is in phase 1: Postgres schema, RLS, seed, private PDF bucket, archiving,
and a controlled cleanup command. There is no Next.js app, login, viewer, or admin UI yet.
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
npm run lint
npm run typecheck
npm test
npm audit --omit=dev
```

Copy `.env.example` to `.env.local` when the application or cleanup task needs
credentials. Fill `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from
your Supabase project. `SUPABASE_SERVICE_ROLE_KEY`, `ACCESS_CODE_PEPPER` (32+ random
bytes), and `VISITOR_SESSION_SECRET` (32+ random bytes) stay server-side. Never commit
`.env.local`. The last two secrets are reserved for phase 2 and have no values yet.

## Data and permissions

The seed creates one organization (`MAILANTARKI.COM`), six projects and four fixed
disciplines. No PDF, user, or access code is seeded.

Authenticated users read through RLS. `super_admin` can manage all organizations;
`org_admin` manages only its organization; `member` reads assigned projects and
segments. Visitors with codes are planned for phase 2. Direct clients cannot read
`documents.file_path` or `access_codes.code_hash`. Admins can read pending and archived
document metadata for management; portal queries must explicitly require active
organization, active project, unarchived document and `upload_status = 'ready'`.

Admin writes to `organizations`, `projects`, `documents`, `profiles`,
`user_project_access`, `access_codes`, and `access_code_grants` use the authenticated
user client and RLS. The `service_role` key is restricted to signed URLs and Storage
operations, atomic code redemption, Auth invitations, `access_logs` insertion,
visitor reads in `authorize()`, and the controlled cleanup task. It must never be
used for ordinary admin metadata writes.

`organizations`, `projects`, and `documents` are archived by setting `archived_at`.
A trigger sets the timestamp and actor. The app has no physical DELETE permission on
these tables. Project foreign keys restrict physical deletion, while deleting a
document after retention sets `access_logs.document_id` to null and retains title,
number and project-name snapshots. The original migration is unchanged; later
schema adjustments are separate, versioned migrations.

Supabase's default grants included `TRUNCATE` and `TRIGGER` for client roles. The
fourth migration revokes those privileges (plus `REFERENCES` and `MAINTAIN`) on all
current public tables. Every future public table needs the same revoke in its own
migration; RLS does not protect `TRUNCATE`.

## Archived PDF cleanup

The cleanup task uses only the server-side `SUPABASE_SERVICE_ROLE_KEY`. It selects
documents archived more than 30 days ago, removes each object from the private
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

## Verification and remaining work

On 2026-09-21, `npx supabase db reset`, `npm run lint`, `npm run typecheck`,
`npm test` (58 SQL assertions), and `npm audit --omit=dev` passed from `~/dev`.
The cleanup dry-run against local Supabase found zero eligible documents. A local
integration fixture confirmed that `--execute` removes the private object and
document row while preserving the log snapshot; the database was reset afterward.
Database checks found one organization, six projects, four segments, zero tables
in `public` without RLS, no client `TRUNCATE`/`TRIGGER`/`MAINTAIN` privileges,
and a private `documents` bucket.

The next phases are: (2) Next.js, authentication, access codes and initial
`super_admin` setup; (3) project listings, filters and signed-URL PDF viewer;
(4) admin uploads, users, codes and logs; (5) full security tests and deployment
guide. Do not advance until the phase-1 security review is approved.
