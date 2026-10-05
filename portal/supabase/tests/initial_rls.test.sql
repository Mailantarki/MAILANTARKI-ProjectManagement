begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(17);

insert into public.organizations (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Test Organization A'),
  ('10000000-0000-0000-0000-000000000002', 'Test Organization B');
insert into public.segments (id, name, slug, sort_order) values
  ('20000000-0000-0000-0000-000000000001', 'Test Architecture', 'architecture', 1),
  ('20000000-0000-0000-0000-000000000002', 'Test Structure', 'structure', 2),
  ('20000000-0000-0000-0000-000000000003', 'Test MEP', 'mep', 3),
  ('20000000-0000-0000-0000-000000000004', 'Test Interior Design', 'interior-design', 4),
  ('20000000-0000-0000-0000-000000000005', 'Test Landscaping', 'landscaping', 5),
  ('20000000-0000-0000-0000-000000000006', 'Test Sales Plan', 'sales-plan', 6)
on conflict (slug) do nothing;

insert into public.projects (id, organization_id, name, slug) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Project A', 'test-project-a'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Project B', 'test-project-b');
insert into auth.users (id, instance_id, aud, role, email, encrypted_password) values
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'member-a@test.invalid', ''),
  ('40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'member-none@test.invalid', ''),
  ('40000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-a@test.invalid', '');
insert into public.profiles (id, organization_id, role, full_name) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'member', 'Member A'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'member', 'Member None'),
  ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'org_admin', 'Admin A');
insert into public.user_project_access (user_id, project_id, segment_id) values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
   (select id from public.segments where slug = 'architecture'));
insert into public.documents (id, project_id, segment_id, title, doc_number, doc_type, file_path, file_size, upload_status) values
  ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
   (select id from public.segments where slug = 'architecture'), 'A Architecture', 'A-1', 'plan', 'projects/a/architecture/a1.pdf', 10, 'ready'),
  ('50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001',
   (select id from public.segments where slug = 'mep'), 'A MEP', 'M-1', 'plan', 'projects/a/mep/m1.pdf', 10, 'ready'),
  ('50000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002',
   (select id from public.segments where slug = 'architecture'), 'B Architecture', 'B-1', 'plan', 'projects/b/architecture/b1.pdf', 10, 'ready'),
  ('50000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001',
   (select id from public.segments where slug = 'structure'), 'A Structure', 'S-1', 'plan', 'projects/a/structure/s1.pdf', 10, 'ready'),
  ('50000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000001',
   (select id from public.segments where slug = 'interior-design'), 'A Interior', 'I-1', 'plan', 'projects/a/interior-design/i1.pdf', 10, 'ready'),
  ('50000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000001',
   (select id from public.segments where slug = 'landscaping'), 'A Landscaping', 'L-1', 'plan', 'projects/a/landscaping/l1.pdf', 10, 'ready'),
  ('50000000-0000-0000-0000-000000000007', '30000000-0000-0000-0000-000000000001',
   (select id from public.segments where slug = 'sales-plan'), 'A Sales', 'SP-1', 'plan', 'projects/a/sales-plan/sp1.pdf', 10, 'ready');
insert into public.access_codes (id, organization_id, code_hash, label) values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', repeat('a', 64), 'Test code');
insert into public.access_logs (organization_id, user_id, action) values
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003', 'login');

select is((select count(*) from pg_tables where schemaname = 'public' and not rowsecurity), 0::bigint,
  'all public tables have RLS');
select is((select public from storage.buckets where id = 'documents'), false, 'documents bucket is private');
select is((select public from storage.buckets where id = 'project-covers'), false, 'project covers bucket is private');
select is((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
  and (roles @> array['anon']::name[] or roles @> array['authenticated']::name[])), 0::bigint,
  'no direct client storage object policies');

set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000002', true);
select is((select count(*) from public.documents), 0::bigint, 'member without grant sees no documents');
select is((select count(*) from public.projects), 0::bigint, 'member without grant sees no projects');
select is((select count(*) from public.access_codes), 0::bigint, 'member cannot read access codes');
select is((select count(*) from public.access_logs), 0::bigint, 'member cannot read access logs');
select throws_ok(
  $$insert into public.documents (project_id, segment_id, title, doc_number, doc_type, file_path, file_size)
    values ('30000000-0000-0000-0000-000000000001',
      (select id from public.segments where slug = 'architecture'),
      'Unauthorized', 'X-1', 'plan', 'projects/x.pdf', 10)$$,
  '42501', null, 'member cannot insert documents');

select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
select is((select count(*) from public.documents), 1::bigint, 'segment grant exposes one document');
select is((select string_agg(distinct s.slug, ',' order by s.slug) from public.documents d
  join public.segments s on s.id = d.segment_id), 'architecture',
  'single-discipline member sees architecture and none of the other five disciplines');
select is((select count(*) from public.projects), 1::bigint, 'project grant does not expose another project');
select throws_ok('select file_path from public.documents', '42501', null,
  'authenticated clients cannot select private file paths');

select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000003', true);
select is((select count(*) from public.projects), 1::bigint, 'org admin cannot see other organization');
select is((select count(*) from public.documents), 6::bigint, 'org admin sees all six own-organization disciplines');
select is((select count(distinct segment_id) from public.documents), 6::bigint,
  'org admin sees exactly the six configured disciplines');

reset role;
select throws_ok(
  $$insert into public.user_project_access (user_id, project_id) values
    ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002')$$,
  'P0001', 'User and project organization mismatch', 'cross-organization user grant rejected');

select * from finish();
rollback;
