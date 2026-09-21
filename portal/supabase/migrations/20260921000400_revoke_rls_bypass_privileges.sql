-- TRUNCATE bypasses RLS. Supabase's default table grants include it for client roles.
revoke truncate, references, trigger, maintain on all tables in schema public
  from public, anon, authenticated;

-- Each future migration that creates a public table must repeat this revoke for its table.
