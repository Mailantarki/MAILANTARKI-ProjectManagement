# Security Incident Runbook

This runbook is for the project owner and the person responsible for the affected Supabase or Vercel account. Record the incident time, operator and every credential changed. Do not paste secrets into tickets, chat or Git.

## Suspected Access-Code Disclosure

1. Disable all active codes in the Supabase SQL editor using an owner/service account:

   ```sql
   begin;
   update public.access_codes
   set is_active = false
   where is_active = true;
   commit;
   ```

2. Rotate both `ACCESS_CODE_PEPPER` and `VISITOR_SESSION_SECRET` with two separate values from `openssl rand -hex 32`.
3. Update the production environment variables in Vercel and redeploy immediately.
4. Review `access_logs` for unexpected redemption, view and download events. Preserve a CSV export with the incident record.
5. Create replacement codes only after the investigation is complete.

Disabling codes terminates their visitor access on the next request because visitor sessions are revalidated against the database. Rotating `ACCESS_CODE_PEPPER` prevents every existing code from being redeemed again, but does not by itself invalidate an already issued JWT. Rotating `VISITOR_SESSION_SECRET` invalidates every existing visitor JWT. The combined procedure invalidates both codes and sessions.

## Suspected Application-Secret Disclosure

- Never copy values from `.env.local` into production. Generate production-only `ACCESS_CODE_PEPPER` and `VISITOR_SESSION_SECRET` values.
- Rotate the affected value in Vercel, redeploy, and remove the old value from every environment and operator machine where it is no longer needed.
- For `ACCESS_CODE_PEPPER`, revoke all codes first because old hashes cannot be migrated without their plaintext codes.
- For `VISITOR_SESSION_SECRET`, expect every visitor to be signed out immediately. Authenticated Supabase users are unaffected.

## Supabase or Vercel Credential in Git

1. Notify the project owner and the administrators of the affected Supabase and Vercel accounts immediately.
2. Revoke or rotate the credential in the provider first. Deleting a commit or rewriting Git history is not remediation because clones, caches and logs may retain it.
3. Update the replacement secret in the correct Vercel environment and redeploy. Rotate local development credentials too if the exposed value was used locally.
4. Review provider audit logs, Supabase Auth activity, database logs, Storage access and Vercel deployment logs for unauthorized use.
5. Remove the secret from Git history and open artifacts only after revocation, then verify with a secret-history scan.
6. Record impact, timeline, actions and any required user notification in the incident record.

For a leaked Supabase service-role key, treat all project data and private Storage as potentially exposed until logs show otherwise. For a leaked Vercel token, revoke every affected token/session and review project and environment-variable changes.
