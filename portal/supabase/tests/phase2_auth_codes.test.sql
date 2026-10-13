begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select is((select count(*) from pg_tables where schemaname = 'public' and tablename = 'auth_attempts' and not rowsecurity),
  0::bigint, 'auth_attempts has RLS');
select ok(not has_table_privilege('anon', 'public.auth_attempts', 'SELECT'), 'anon cannot read auth attempts');
select ok(not has_table_privilege('authenticated', 'public.auth_attempts', 'INSERT'), 'users cannot write auth attempts');
select ok(not has_function_privilege('anon', 'public.redeem_access_code(text)', 'EXECUTE'), 'anon cannot redeem directly');
select ok(not has_function_privilege('authenticated', 'public.redeem_access_code(text)', 'EXECUTE'), 'users cannot redeem directly');
select ok(has_function_privilege('service_role', 'public.redeem_access_code(text)', 'EXECUTE'), 'service role can redeem');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password) values
  ('42000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'phase2-admin@test.invalid', ''),
  ('42000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'phase2-member@test.invalid', '');
insert into public.profiles (id, organization_id, role, full_name)
  select '42000000-0000-0000-0000-000000000001', id, 'org_admin', 'Phase 2 Admin'
  from public.organizations where name = 'MAILANTARKI.COM';
insert into public.profiles (id, organization_id, role, full_name)
  select '42000000-0000-0000-0000-000000000002', id, 'member', 'Phase 2 Member'
  from public.organizations where name = 'MAILANTARKI.COM';
insert into public.user_project_access(user_id, project_id)
  select '42000000-0000-0000-0000-000000000002', id
  from public.projects where slug = 'maylan-plaza';

set local role authenticated;
select set_config('request.jwt.claim.sub', '42000000-0000-0000-0000-000000000001', true);
select lives_ok($$
  select public.create_access_code(
    (select id from public.organizations where name = 'MAILANTARKI.COM'),
    repeat('a', 64), 'Phase 2 Code', null, 1, false,
    array[(select id from public.projects where slug = 'maylan-plaza')]
  )
$$, 'org admin atomically creates code and grant');
select is((select count(*) from public.access_code_grants g join public.access_codes c on c.id = g.access_code_id
  where c.label = 'Phase 2 Code'), 1::bigint, 'grant was created');
select throws_ok($$
  select public.create_access_code(
    (select id from public.organizations where name = 'MAILANTARKI.COM'),
    repeat('b', 64), 'No Projects', null, null, false, array[]::uuid[])
$$, 'At least one project is required', 'empty grant list fails');

select set_config('request.jwt.claim.sub', '42000000-0000-0000-0000-000000000002', true);
select throws_ok($$
  select public.create_access_code(
    (select id from public.organizations where name = 'MAILANTARKI.COM'),
    repeat('b', 64), 'Member Code', null, null, false,
    array[(select id from public.projects where slug = 'maylan-plaza')]
  )
$$, '42501', null, 'member cannot create code through invoker function');

set local role service_role;
select is((select count(*) from public.redeem_access_code(repeat('a', 64))), 1::bigint,
  'first redeem succeeds');
select is((select count(*) from public.redeem_access_code(repeat('a', 64))), 0::bigint,
  'exhausted code cannot be redeemed again');
insert into public.access_codes(organization_id, code_hash, label, is_active)
  select id, repeat('c', 64), 'Revoked', false from public.organizations where name = 'MAILANTARKI.COM';
insert into public.access_codes(organization_id, code_hash, label, expires_at)
  select id, repeat('d', 64), 'Expired', now() - interval '1 day'
  from public.organizations where name = 'MAILANTARKI.COM';
select is((select count(*) from public.redeem_access_code(repeat('c', 64))), 0::bigint,
  'revoked code fails');
select is((select count(*) from public.redeem_access_code(repeat('d', 64))), 0::bigint,
  'expired code fails');
select ok(public.reserve_auth_attempt('login', '127.0.0.2'::inet) is not null, 'first login attempt reserved');
insert into public.auth_attempts(kind, ip)
  select 'login', '127.0.0.2'::inet from generate_series(1, 4);
select is(public.reserve_auth_attempt('login', '127.0.0.2'::inet), null::bigint,
  'sixth login attempt blocked');
select ok(public.reserve_auth_attempt('login', '127.0.0.3'::inet) is not null,
  'different IP allowed');
select ok(not has_function_privilege('anon', 'public.reserve_auth_attempt(text, inet)', 'EXECUTE'),
  'anon cannot reserve attempts');

select * from finish();
rollback;
