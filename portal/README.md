# MAILANTARKI Project Management

Secure technical-document portal for organizing and reviewing construction PDFs by project and discipline.

The application supports authenticated teams and read-only visitors with scoped access codes. Documents remain in private object storage and are delivered through short-lived signed URLs only after server-side authorization.

> **Project status:** Phases 1-4 are complete and verified locally. Production hardening and deployment are not complete. The planned domain is `mailantarki.com`.

## Features

- Six seeded MAILANTARKI projects and six shared disciplines
- Email/password authentication with role-based access
- Read-only visitor access through revocable, expiring codes
- Project and discipline-level permissions
- Private PDF viewer with pagination, zoom, fit-to-width and fullscreen
- Optional PDF downloads controlled per grant
- URL-based document filters and server-side pagination
- Admin management for organizations, projects, users and assignments
- PDF upload with metadata validation and controlled finalization
- Project-level featured documents, ordered first for every authorized viewer
- Document metadata editing plus soft archive and restore from the admin panel
- Bulk PDF import from a trusted CLI
- Access-code creation, revocation and reactivation
- Audit logs for login, code redemption, viewing and downloading
- Soft archiving and restoration of organizations, projects and documents
- CSV export with spreadsheet-formula protection

## Technology

- [Next.js](https://nextjs.org/) App Router
- TypeScript and React
- Tailwind CSS
- Supabase Postgres, Auth and private Storage
- React PDF / PDF.js
- Zod and jose
- Vitest, pgTAP and Playwright
- Vercel-ready application architecture

## Access Model

| Principal | Access |
| --- | --- |
| `super_admin` | All organizations, projects and administration features |
| `org_admin` | Administration within their own organization |
| `member` | Only assigned projects and disciplines |
| Visitor | Read-only access granted by an active access code |

All application permission decisions pass through `src/lib/auth/authorize.ts`. PostgreSQL Row Level Security provides an additional database boundary for authenticated clients.

## Security Design

- The `documents` Storage bucket is private.
- Public PDF URLs are never generated.
- PDF access requires authorization before issuing a signed URL valid for 300 seconds.
- `documents.file_path` and access-code hashes are not readable by ordinary clients.
- Access codes are stored as HMAC-SHA256 hashes with a server-only pepper.
- Visitor sessions use signed, HTTP-only cookies and are revalidated against the database.
- Login and code redemption use persistent, database-backed rate limiting.
- External input is validated with Zod on the server.
- Admin mutations are authorized inside server actions, not only hidden in the UI.
- Ready documents, projects and organizations use soft deletion.
- Audit snapshots survive later document cleanup.
- The service-role key is confined to server-only modules and narrowly defined operations.

See [AGENTS.md](./AGENTS.md) and the project skills under [`.agents/skills`](./.agents/skills) for the detailed security and implementation rules.

## Project Structure

```text
src/app/                 Pages, route handlers and admin server actions
src/components/pdf/      Private PDF viewer
src/lib/auth/            Principal resolution and centralized authorization
src/lib/access-codes/    Code generation, hashing, redemption and sessions
src/lib/supabase/        Browser, user-session and server-only clients
scripts/                 Bootstrap, import and maintenance tools
supabase/migrations/     Versioned schema and RLS migrations
supabase/tests/          pgTAP permission and database tests
supabase/seed.sql        Organizations, projects and disciplines
e2e/                     Playwright browser flows
```

## Prerequisites

- Node.js 20 or newer
- npm
- Docker Desktop
- Supabase CLI
- Playwright Chromium for browser tests

Keep the repository outside macOS-protected directories such as `~/Documents` if Docker Desktop cannot mount them. A path such as `~/dev/MAILANTARKI-ProjectManagement` is recommended.

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   npx playwright install chromium
   ```

2. Start local Supabase:

   ```bash
   npx supabase start
   ```

3. Create the environment file:

   ```bash
   cp .env.example .env.local
   npx supabase status -o env
   ```

4. Set the following values in `.env.local`:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key>
   SUPABASE_SERVICE_ROLE_KEY=<local service-role key>
   ACCESS_CODE_PEPPER=<openssl rand -hex 32>
   VISITOR_SESSION_SECRET=<a second openssl rand -hex 32>
   ```

   Never commit `.env.local`. Only the Supabase URL and anonymous key may be exposed to the browser.

5. Apply all migrations and seed data:

   ```bash
   npx supabase db reset
   ```

6. Create the first administrator:

   ```bash
   npx tsx scripts/bootstrap-admin.ts
   ```

   Credentials are entered interactively so passwords do not remain in shell history.

7. Start the application:

   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000).

## Seed Data

The database seed creates the `MAILANTARKI.COM` organization, six disciplines and these projects:

1. MAILANTARKI Sports Complex, Dakibiyu
2. Maylan Plaza, Asokoro
3. Maylan Heights Residence, Life Camp, Dape
4. Daige Residences, Kaura
5. Daige Heights Apartment, Katampe
6. Mauritius Golf Estate, Mabushi

No users, access codes or PDFs are committed to the repository.

## Document Uploads

The admin upload flow creates pending metadata, uploads to private Storage, validates the actual object size and `%PDF-` signature on the server, then uses a narrow service-only RPC to mark the document ready. Pending documents are not visible in the portal.

For local test data:

```bash
npx tsx scripts/seed-test-document.ts --segment architecture
npx tsx scripts/seed-test-document.ts ./drawing.pdf --project maylan-plaza --segment interior-design
```

This helper refuses non-local Supabase URLs.

### Bulk Import

An authenticated admin can import a directory of PDFs:

```bash
npx tsx scripts/bulk-import.ts \
  --directory "../pdf/MAURITIUS ARCHIVE" \
  --project mauritius-golf-estate \
  --segment architecture
```

The importer validates the full batch before writing, enforces a 50 MB limit, derives normalized metadata and safely skips ready duplicates. Source PDFs remain outside Git.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
npm audit --omit=dev
```

`npm test` runs Vitest and the pgTAP RLS suite. Browser tests require Docker, local Supabase and Playwright Chromium. Stop a separate `next dev` process before E2E tests because both processes use `.next`.

Current verified baseline:

- 46 TypeScript tests
- 118 SQL assertions
- 7 Playwright browser tests
- Production dependency audit with no known vulnerabilities at the last local review
- Full Phase 4 security review approved with one production follow-up

The production follow-up is to verify the hosting proxy's trusted `x-forwarded-for` behavior before relying on it for IP rate limiting.

## Maintenance

Remove expired rate-limit attempts:

```bash
npm run cleanup:auth-attempts
```

Preview or execute cleanup of archived PDFs older than 30 days and interrupted pending uploads older than one hour:

```bash
npm run cleanup:archived
npm run cleanup:archived -- --execute
npm run cleanup:archived -- --execute --limit=25
```

Cleanup is a trusted server task, not an admin-panel action. It removes the Storage object before its document row and preserves access-log snapshots.

## Roadmap

### Completed

- Database schema, private Storage, RLS and seed data
- Authentication, visitor codes and persistent rate limiting
- Authorized project/document listings and private PDF viewer
- Administration for organizations, projects, users, grants, codes and logs
- Secure individual and bulk PDF upload flows
- Document metadata editing and project-level featured ordering
- Archive and restore workflows

### Remaining

- Production Supabase project and environment configuration
- Vercel deployment and domain configuration
- Trusted-proxy validation for IP rate limiting
- Production backup, monitoring and scheduled cleanup
- Final production security review

## Important

This repository does not contain production secrets, users or source PDFs. Running `npx supabase db reset` destroys local database and Storage state before rebuilding the schema and seed.
