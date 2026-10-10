begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into public.organizations(id, name) values ('14000000-0000-0000-0000-000000000001', 'Search Org');
insert into public.projects(id, organization_id, name, slug) values
  ('34000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000001', 'Search A', 'search-a'),
  ('34000000-0000-0000-0000-000000000002', '14000000-0000-0000-0000-000000000001', 'Search B', 'search-b');
insert into auth.users(id, instance_id, aud, role, email, encrypted_password) values
  ('44000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'search-member@test.invalid', '');
insert into public.profiles(id, organization_id, role, full_name, must_change_password) values
  ('44000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000001', 'member', 'Search Member', false);
insert into public.user_project_access(user_id, project_id, segment_id, can_download) values
  ('44000000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000001', (select id from public.segments where slug = 'architecture'), false);

create function pg_temp.doc(p_project text, p_segment text, p_number text, p_title text, p_rev text) returns void language sql as $$
  insert into public.documents(project_id, segment_id, title, doc_number, doc_type, revision, file_size, upload_status)
  values (p_project::uuid, (select id from public.segments where slug = p_segment), p_title, p_number, 'plan', p_rev, 5, 'ready');
$$;
select pg_temp.doc('34000000-0000-0000-0000-000000000001', 'architecture', 'AR-101', 'Ground floor plan', 'A');
select pg_temp.doc('34000000-0000-0000-0000-000000000001', 'architecture', 'AR-101', 'Ground floor plan', 'B');
select pg_temp.doc('34000000-0000-0000-0000-000000000001', 'architecture', 'AR-1010', 'Roof plan', 'A');
select pg_temp.doc('34000000-0000-0000-0000-000000000001', 'architecture', 'AR-200', 'North elevation', 'A');
select pg_temp.doc('34000000-0000-0000-0000-000000000001', 'structure', 'ST-101', 'Foundation plan', 'A');
select pg_temp.doc('34000000-0000-0000-0000-000000000002', 'architecture', 'AR-101', 'Other project plan', 'A');

create temporary table scope_a as select jsonb_build_array(jsonb_build_object(
  'project_id', '34000000-0000-0000-0000-000000000001', 'segment_id', (select id from public.segments where slug = 'architecture'))) as s;
grant select on scope_a to authenticated;

select is((select doc_number || ' ' || revision from public.search_documents('ar-101', (select s from scope_a)) limit 1),
  'AR-101 B', 'an exact number comes first, current revision only');
select is((select count(*) from public.search_documents('ar-101', (select s from scope_a))), 2::bigint,
  'number prefix matches follow (AR-1010); other projects and disciplines are out of scope');
select is((select count(*) from public.search_documents('ar-101', (select s from scope_a), true)), 3::bigint,
  'history includes superseded revisions');
select is((select doc_number from public.search_documents('nor elev', (select s from scope_a))), 'AR-200',
  'partial words find titles');
select is((select count(*) from public.search_documents('plan', '[]'::jsonb)), 0::bigint, 'an empty scope finds nothing');
select is((select count(*) from public.search_documents('a', (select s from scope_a))), 0::bigint, 'one character is too short');
select lives_ok($$select * from public.search_documents('50%_ off'' or 1=1 --', (select s from scope_a))$$,
  'special characters are inert');

-- RLS still applies for users: a member outside the discipline sees nothing even with a wider scope.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"44000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*) from public.search_documents('st-101', jsonb_build_array(jsonb_build_object(
  'project_id', '34000000-0000-0000-0000-000000000001', 'segment_id', null)))), 0::bigint,
  'RLS hides disciplines the member has no access to');
select is((select count(*) from public.search_documents('ar-101', (select s from scope_a))), 2::bigint,
  'the member finds documents in their discipline');
reset role;
select ok(not has_function_privilege('anon', 'public.search_documents(text,jsonb,boolean,integer)', 'EXECUTE'), 'anon cannot search');

select * from finish();
rollback;
