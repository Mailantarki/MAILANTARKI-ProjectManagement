# Technical Documentation Portal

Next.js, Supabase and private PDF storage portal for project documentation.

## Current status

Phase 1 contains the initial Postgres schema, RLS policies, a private Storage bucket, the four-segment and six-project seed, and SQL security tests. Phases 2-5 are not implemented.

## Data model

- `organizations` owns `projects`, `profiles`, and `access_codes`.
- The seed organization is `MAILANTARKI.COM`. Its domain is planned but is not configured as a live URL.
- Every project uses the four fixed `segments`.
- `documents` stores PDF metadata and a private `file_path`; authenticated clients receive only metadata columns. PDFs will be signed by the server in phase 3.
- `user_project_access` and `access_code_grants` grant one segment or all segments in a project when `segment_id` is null. Database triggers reject cross-organization grants.
- `access_logs` records `login`, `code_redeem`, `view`, and `download` events.

The migration has read policies for authenticated users. There are no direct client write policies: later mutations must run on the server after the central `authorize()` check. Visitor codes will use the server service role and never become Supabase Auth users.

## Local database

With the Supabase CLI and Docker available, run `npx supabase start`, `npx supabase db reset`, then `npx supabase test db`. The tests create temporary users, projects, documents and grants inside a rolled-back transaction. No credentials or real PDFs are included. Studio is disabled locally because Docker cannot mount its snippets directory from this workspace path, which contains a space.

Verified on 2026-09-21: `db reset` passed; the official `test db` command passed 14/14 tests from an identical temporary copy at `/tmp/mailantarki-rls` because its test container could not mount this workspace path. Direct `psql` execution of the same test file also passed 14/14 tests. Database checks returned one organization, six projects, four segments, zero public tables without RLS, and a private `documents` bucket.

## Pending

1. Scaffold the Next.js app and implement phases 2-5 in order, running lint, typecheck, tests, and the security review at each gate.
