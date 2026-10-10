begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into public.organizations(id, name) values
  ('15000000-0000-0000-0000-000000000001', 'Inbox Org A'),
  ('15000000-0000-0000-0000-000000000002', 'Inbox Org B');
insert into public.projects(id, organization_id, name, slug) values
  ('35000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000001', 'Inbox A', 'inbox-a'),
  ('35000000-0000-0000-0000-000000000002', '15000000-0000-0000-0000-000000000002', 'Inbox B', 'inbox-b');
insert into auth.users(id, instance_id, aud, role, email, encrypted_password) values
  ('45000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inbox-admin@test.invalid', ''),
  ('45000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inbox-member@test.invalid', '');
insert into public.profiles(id, organization_id, role, full_name, must_change_password) values
  ('45000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000001', 'org_admin', 'Inbox Admin', false),
  ('45000000-0000-0000-0000-000000000002', '15000000-0000-0000-0000-000000000001', 'member', 'Inbox Member', false);
insert into public.user_project_access(user_id, project_id, segment_id) values
  ('45000000-0000-0000-0000-000000000002', '35000000-0000-0000-0000-000000000001', null);

insert into public.documents(id, project_id, segment_id, title, doc_number, doc_type, revision, file_size, upload_status) values
  ('55000000-0000-0000-0000-000000000001', '35000000-0000-0000-0000-000000000001', (select id from public.segments where slug = 'architecture'), 'One', 'I-1', 'plan', 'A', 5, 'ready'),
  ('55000000-0000-0000-0000-000000000002', '35000000-0000-0000-0000-000000000001', (select id from public.segments where slug = 'architecture'), 'Two', 'I-2', 'plan', 'A', 5, 'ready'),
  ('55000000-0000-0000-0000-000000000003', '35000000-0000-0000-0000-000000000002', (select id from public.segments where slug = 'architecture'), 'Other', 'I-3', 'plan', 'A', 5, 'ready');

select ok(not has_function_privilege('anon', 'public.bulk_update_documents(uuid[],jsonb)', 'EXECUTE'), 'anon cannot bulk update');
select ok(not has_table_privilege('anon', 'public.activity_feed', 'SELECT'), 'anon cannot read the activity feed');

set local role authenticated;
select set_config('request.jwt.claim.sub', '45000000-0000-0000-0000-000000000002', true);
select throws_ok($$select * from public.bulk_update_documents(array['55000000-0000-0000-0000-000000000001'::uuid], '{"status":"as_built"}')$$,
  '42501', null, 'a member cannot bulk update');

select set_config('request.jwt.claim.sub', '45000000-0000-0000-0000-000000000001', true);
select throws_ok($$select * from public.bulk_update_documents(array['55000000-0000-0000-0000-000000000001'::uuid], '{"title":"x"}')$$,
  '22023', null, 'only status, featured and archived can change');
select throws_ok($$select * from public.bulk_update_documents(array['55000000-0000-0000-0000-000000000001'::uuid, '55000000-0000-0000-0000-000000000003'::uuid], '{"status":"as_built"}')$$,
  '42501', null, 'a row of another organization refuses the whole batch');
select is((select status::text from public.documents where id = '55000000-0000-0000-0000-000000000001'), 'draft', 'nothing changed after a refused batch');
select is((select count(*) from public.bulk_update_documents(array['55000000-0000-0000-0000-000000000001'::uuid, '55000000-0000-0000-0000-000000000002'::uuid],
  '{"status":"issued_for_construction","is_featured":true}') where status = 'draft' and not is_featured), 2::bigint, 'returns the previous values');
select is((select count(*) from public.documents where project_id = '35000000-0000-0000-0000-000000000001' and status = 'issued_for_construction' and is_featured),
  2::bigint, 'the batch is applied');
select is((select count(*) from public.bulk_update_documents(array['55000000-0000-0000-0000-000000000002'::uuid], '{"archived":true}') where was_current),
  1::bigint, 'archiving reports that the row was current');
select ok((select archived_at is not null from public.documents where id = '55000000-0000-0000-0000-000000000002'), 'archived');

-- Activity feed: names, and only what the caller can read
select ok((select count(*) from public.activity_feed where source = 'document' and actor_name = 'Inbox Admin') >= 2,
  'document changes appear with the admin''s name');
select is((select count(*) from public.activity_feed where project_id = '35000000-0000-0000-0000-000000000002'), 0::bigint,
  'nothing from another organization');
reset role;

select * from finish();
rollback;
