begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
select set_config('test.initial_document_count',
  (select count(*)::text from public.documents), true);
select set_config('test.initial_log_count',
  (select count(*)::text from public.access_logs), true);
select set_config('test.initial_profile_count',
  (select count(*)::text from public.profiles), true);
select set_config('test.initial_code_count',
  (select count(*)::text from public.access_codes), true);

insert into public.organizations (id, name) values
  ('11000000-0000-0000-0000-000000000001', 'RLS Test A'),
  ('11000000-0000-0000-0000-000000000002', 'RLS Test B');
insert into public.projects (id, organization_id, name, slug) values
  ('31000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'RLS Project A', 'rls-project-a'),
  ('31000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000002', 'RLS Project B', 'rls-project-b');
insert into auth.users (id, instance_id, aud, role, email, encrypted_password) values
  ('41000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-super@test.invalid', ''),
  ('41000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-admin-a@test.invalid', ''),
  ('41000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-admin-b@test.invalid', ''),
  ('41000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-member@test.invalid', ''),
  ('41000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-new-member@test.invalid', '');
insert into public.profiles (id, organization_id, role, full_name) values
  ('41000000-0000-0000-0000-000000000001', null, 'super_admin', 'Super'),
  ('41000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000001', 'org_admin', 'Admin A'),
  ('41000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000002', 'org_admin', 'Admin B'),
  ('41000000-0000-0000-0000-000000000004', '11000000-0000-0000-0000-000000000001', 'member', 'Member A');
insert into public.user_project_access (user_id, project_id, segment_id) values
  ('41000000-0000-0000-0000-000000000004', '31000000-0000-0000-0000-000000000001',
   (select id from public.segments where slug = 'architecture'));
insert into public.documents (id, project_id, segment_id, title, doc_number, doc_type,
  file_path, file_size, upload_status) values
  ('51000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001',
   (select id from public.segments where slug = 'architecture'),
   'Archive Test Drawing', 'ARC-101', 'plan', 'ignored-on-insert', 10, 'ready'),
  ('51000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000002',
   (select id from public.segments where slug = 'mep'),
   'Other Tenant Drawing', 'MEP-201', 'plan', 'ignored-on-insert-too', 10, 'ready');
insert into public.access_codes (id, organization_id, code_hash, label, created_by) values
  ('61000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', repeat('a', 64), 'Code A', '41000000-0000-0000-0000-000000000002'),
  ('61000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000002', repeat('b', 64), 'Code B', '41000000-0000-0000-0000-000000000003');
insert into public.access_code_grants (access_code_id, project_id) values
  ('61000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001'),
  ('61000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000002');
insert into public.access_logs (organization_id, user_id, project_id, document_id, action) values
  ('11000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000002',
   '31000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'view');

select is((select file_path from public.documents where id = '51000000-0000-0000-0000-000000000001'),
  'projects/31000000-0000-0000-0000-000000000001/architecture/51000000-0000-0000-0000-000000000001.pdf',
  'database generates the private document path');
select is((select document_title from public.access_logs where document_id = '51000000-0000-0000-0000-000000000001'),
  'Archive Test Drawing', 'log snapshots document title on insert');
select is((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and (
  has_table_privilege('anon', c.oid, 'TRUNCATE')
  or has_table_privilege('authenticated', c.oid, 'TRUNCATE')
  or has_table_privilege('anon', c.oid, 'TRIGGER')
  or has_table_privilege('authenticated', c.oid, 'TRIGGER')
  or has_table_privilege('anon', c.oid, 'REFERENCES')
  or has_table_privilege('authenticated', c.oid, 'REFERENCES')
  or has_table_privilege('anon', c.oid, 'MAINTAIN')
  or has_table_privilege('authenticated', c.oid, 'MAINTAIN')
)), 0::bigint, 'client roles have no unsafe table privileges');

set local role authenticated;
select set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000001', true);
select is((select count(*) from public.projects), 8::bigint, 'super admin reads all projects');
select is((select count(*) from public.documents),
  current_setting('test.initial_document_count')::bigint + 2,
  'super admin reads all documents including the fixture');
select is((select count(*) from public.access_codes),
  current_setting('test.initial_code_count')::bigint + 2, 'super admin reads all codes');
select is((select count(*) from public.access_code_grants), 2::bigint, 'super admin reads all grants');
select is((select count(*) from public.access_logs),
  current_setting('test.initial_log_count')::bigint + 1,
  'super admin reads all logs including the fixture');
select is((select count(*) from public.profiles),
  current_setting('test.initial_profile_count')::bigint + 4,
  'super admin reads all profiles including the fixture');
insert into public.organizations (name) values ('RLS Super Created');
select is((select count(*) from public.organizations where name = 'RLS Super Created'), 1::bigint,
  'super admin creates organizations');
insert into public.profiles (id, organization_id, role, full_name) values
  ('41000000-0000-0000-0000-000000000005', '11000000-0000-0000-0000-000000000002', 'member', 'New Member');
select is((select count(*) from public.profiles where id = '41000000-0000-0000-0000-000000000005'),
  1::bigint, 'super admin creates member profile in another organization');
insert into public.user_project_access (user_id, project_id) values
  ('41000000-0000-0000-0000-000000000005', '31000000-0000-0000-0000-000000000002');
select is((select count(*) from public.user_project_access where user_id = '41000000-0000-0000-0000-000000000005'),
  1::bigint, 'super admin assigns a member to another organization project');
insert into public.projects (organization_id, name, slug) values
  ('11000000-0000-0000-0000-000000000002', 'Super Created Project', 'rls-super-created');
select is((select count(*) from public.projects where slug = 'rls-super-created'), 1::bigint,
  'super admin creates projects in another organization');
update public.projects set name = 'Super Updated Project'
  where id = '31000000-0000-0000-0000-000000000002';
select is((select name from public.projects where id = '31000000-0000-0000-0000-000000000002'),
  'Super Updated Project', 'super admin updates another organization project');
insert into public.documents (id, project_id, segment_id, title, doc_number, doc_type, file_size) values
  ('51000000-0000-0000-0000-000000000003', '31000000-0000-0000-0000-000000000002',
   (select id from public.segments where slug = 'mep'), 'Super Uploaded', 'MEP-202', 'plan', 10);
select is((select count(*) from public.documents where id = '51000000-0000-0000-0000-000000000003'),
  1::bigint, 'super admin inserts document metadata');
insert into public.access_codes (organization_id, code_hash, label, created_by) values
  ('11000000-0000-0000-0000-000000000002', repeat('d', 64), 'Super Code',
   '41000000-0000-0000-0000-000000000001');
insert into public.access_code_grants (access_code_id, project_id)
  select id, '31000000-0000-0000-0000-000000000002' from public.access_codes
  where label = 'Super Code';
select is((select count(*) from public.access_code_grants where project_id = '31000000-0000-0000-0000-000000000002'),
  2::bigint, 'super admin writes code grants across organizations');
select throws_ok('select file_path from public.documents', '42501', null,
  'even super admin cannot read file_path with the user client');

set local role anon;
select is((select count(*) from public.projects), 0::bigint, 'anon reads no projects');
select is((select count(*) from public.organizations), 0::bigint, 'anon reads no organizations');
select is((select count(*) from pg_policies where schemaname = 'public'
  and roles @> array['anon']::name[]), 0::bigint, 'no public-table policy grants anon access');
select throws_ok('select title from public.documents', '42501', null, 'anon cannot read documents');
select throws_ok(
  $$insert into public.projects (organization_id, name, slug) values
    ('11000000-0000-0000-0000-000000000001', 'Anon Attempt', 'anon-attempt')$$,
  '42501', null, 'anon cannot write projects');
select throws_ok('truncate public.access_logs', '42501', null,
  'anon cannot truncate audit logs');

set local role authenticated;
select set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000002', true);
select is((select count(*) from public.access_code_grants where project_id = '31000000-0000-0000-0000-000000000002'),
  0::bigint, 'org admin cannot read another organization code grants');
select is((select count(*) from public.access_codes where organization_id = '11000000-0000-0000-0000-000000000002'),
  0::bigint, 'org admin cannot read another organization codes');
insert into public.access_code_grants (access_code_id, project_id, segment_id) values
  ('61000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001',
   (select id from public.segments where slug = 'mep'));
select is((select count(*) from public.access_code_grants where access_code_id = '61000000-0000-0000-0000-000000000001'),
  2::bigint, 'org admin can add code grants in own organization');
select throws_ok(
  $$insert into public.access_code_grants (access_code_id, project_id) values
    ('61000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000002')$$,
  '42501', null, 'org admin cannot write another organization code grants');
with changed as (
  update public.access_code_grants set segment_id = (select id from public.segments where slug = 'mep')
  where access_code_id = '61000000-0000-0000-0000-000000000002' returning id
) select is((select count(*) from changed), 0::bigint,
  'org admin cannot update another organization code grants');
with removed as (
  delete from public.access_code_grants
  where access_code_id = '61000000-0000-0000-0000-000000000002' returning id
) select is((select count(*) from removed), 0::bigint,
  'org admin cannot delete another organization code grants');
select throws_ok(
  $$insert into public.documents (id, project_id, segment_id, title, doc_number, doc_type, file_size)
    values ('51000000-0000-0000-0000-000000000004', '31000000-0000-0000-0000-000000000002',
      (select id from public.segments where slug = 'mep'), 'Wrong Tenant', 'MEP-203', 'plan', 10)$$,
  '42501', null, 'org admin cannot write another organization documents');
with removed as (delete from public.documents
  where id = '51000000-0000-0000-0000-000000000001' returning id)
select is((select count(*) from removed), 0::bigint,
  'authenticated admins cannot physically delete ready documents');
update public.documents set is_featured = true
  where id = '51000000-0000-0000-0000-000000000001';
select is((select is_featured from public.documents
  where id = '51000000-0000-0000-0000-000000000001'), true,
  'project admin can feature a document in the managed project');
select set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000004', true);
with changed as (
  update public.documents set is_featured = false
  where id = '51000000-0000-0000-0000-000000000001' returning id
) select is((select count(*) from changed), 0::bigint,
  'member cannot change project featured status');
select set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000002', true);
insert into public.documents (id, project_id, segment_id, title, doc_number, doc_type, file_size)
  values ('51000000-0000-0000-0000-000000000005', '31000000-0000-0000-0000-000000000001',
    (select id from public.segments where slug = 'architecture'),
    'Unfinished upload', 'ARC-PENDING', 'plan', 10);
with removed as (delete from public.documents
  where id = '51000000-0000-0000-0000-000000000005' returning id)
select is((select count(*) from removed), 1::bigint,
  'project admin may cancel pending metadata');
select throws_ok('delete from public.projects where id = ''31000000-0000-0000-0000-000000000001''',
  '42501', null, 'authenticated admins cannot physically delete projects');
select throws_ok('delete from public.organizations where id = ''11000000-0000-0000-0000-000000000001''',
  '42501', null, 'authenticated admins cannot physically delete organizations');
select throws_ok('truncate public.access_logs', '42501', null,
  'authenticated admin cannot truncate audit logs');
update public.documents set archived_at = now() where id = '51000000-0000-0000-0000-000000000001';
select is((select archived_by from public.documents where id = '51000000-0000-0000-0000-000000000001'),
  '41000000-0000-0000-0000-000000000002'::uuid, 'archive records the acting admin');
select is((select count(*) from public.access_logs where document_id = '51000000-0000-0000-0000-000000000001'),
  1::bigint, 'archiving preserves document log linkage');

select set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000004', true);
select is((select count(*) from public.documents where id = '51000000-0000-0000-0000-000000000001'),
  0::bigint, 'member cannot see archived document');
select is((select count(*) from public.access_codes), 0::bigint, 'member reads no access codes');
select is((select count(*) from public.access_logs), 0::bigint, 'member reads no access logs');
select throws_ok(
  $$insert into public.projects (organization_id, name, slug) values
    ('11000000-0000-0000-0000-000000000001', 'Member Attempt', 'member-attempt')$$,
  '42501', null, 'member cannot write projects');

select set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000002', true);
update public.projects set archived_at = now() where id = '31000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000004', true);
select is((select count(*) from public.projects where id = '31000000-0000-0000-0000-000000000001'),
  0::bigint, 'member cannot see archived project');

reset role;
delete from public.documents where id = '51000000-0000-0000-0000-000000000001';
select is((select count(*) from public.access_logs where document_id is null and
  document_title = 'Archive Test Drawing' and doc_number = 'ARC-101' and project_name = 'RLS Project A'),
  1::bigint, 'physical cleanup clears FK but preserves log snapshots');
select throws_ok('delete from public.projects where id = ''31000000-0000-0000-0000-000000000002''',
  '23503', null, 'project deletion cannot cascade through documents and grants');
select throws_ok(
  $$insert into public.access_code_grants (access_code_id, project_id) values
    ('61000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000002')$$,
  'P0001', 'Code and project organization mismatch', 'database rejects cross-tenant code grants');

select * from finish();
rollback;
