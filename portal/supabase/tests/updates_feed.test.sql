begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into public.organizations(id, name) values
  ('14000000-0000-0000-0000-000000000001', 'Feed Org A'),
  ('14000000-0000-0000-0000-000000000002', 'Feed Org B');
insert into public.projects(id, organization_id, name, slug) values
  ('34000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000001', 'Feed A', 'feed-a');
insert into auth.users(id, instance_id, aud, role, email, encrypted_password) values
  ('44000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'feed-admin@test.invalid', ''),
  ('44000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'feed-member@test.invalid', ''),
  ('44000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'feed-other@test.invalid', ''),
  ('44000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'feed-struct@test.invalid', '');
insert into public.profiles(id, organization_id, role, full_name, must_change_password) values
  ('44000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000001', 'org_admin', 'Feed Admin', false),
  ('44000000-0000-0000-0000-000000000002', '14000000-0000-0000-0000-000000000001', 'member', 'Feed Member', false),
  ('44000000-0000-0000-0000-000000000003', '14000000-0000-0000-0000-000000000002', 'member', 'Other Member', false),
  ('44000000-0000-0000-0000-000000000004', '14000000-0000-0000-0000-000000000001', 'member', 'Structure Member', false);
insert into public.user_project_access(user_id, project_id, segment_id) values
  ('44000000-0000-0000-0000-000000000002', '34000000-0000-0000-0000-000000000001', null),
  ('44000000-0000-0000-0000-000000000004', '34000000-0000-0000-0000-000000000001', (select id from public.segments where slug = 'structure'));

create function pg_temp.upload(p_id uuid, p_number text, p_revision text) returns void language sql as $$
  insert into public.documents(id, project_id, segment_id, title, doc_number, doc_type, revision, file_size)
    values (p_id, '34000000-0000-0000-0000-000000000001', (select id from public.segments where slug = 'architecture'),
      'Plan ' || p_number, p_number, 'plan', p_revision, 5);
  update public.documents set upload_status = 'ready' where id = p_id;
$$;
create function pg_temp.kinds(p_id uuid) returns text language sql as $$
  select string_agg(kind || coalesce(':' || from_value, '') || coalesce('>' || to_value, ''), ',' order by created_at, kind)
  from public.document_events where document_id = p_id;
$$;

-- Privileges
select ok(not has_table_privilege('authenticated', 'public.document_events', 'INSERT'), 'clients cannot write events');
select ok(not has_table_privilege('authenticated', 'public.document_events', 'UPDATE'), 'clients cannot change events');
select ok(not has_table_privilege('anon', 'public.document_events', 'SELECT'), 'anon cannot read events');
select ok(not has_table_privilege('authenticated', 'public.user_project_visits', 'DELETE'), 'visits are not deleted by clients');
select ok(not has_table_privilege('authenticated', 'public.project_watchers', 'TRUNCATE'), 'no truncate on watchers');
select ok(not has_function_privilege('authenticated', 'public.record_document_event()', 'EXECUTE'), 'trigger function is not callable');
select ok(not has_function_privilege('anon', 'public.record_project_visit(uuid,boolean)', 'EXECUTE'), 'anon cannot record visits');

-- Writers
select pg_temp.upload('54000000-0000-0000-0000-00000000000a', 'F-101', 'A');
select is(pg_temp.kinds('54000000-0000-0000-0000-00000000000a'), 'published>A', 'a new number is published');
select pg_temp.upload('54000000-0000-0000-0000-00000000000b', 'F-101', 'B');
select is(pg_temp.kinds('54000000-0000-0000-0000-00000000000b'), 'revised>B', 'a second revision is revised');
insert into public.documents(id, project_id, segment_id, title, doc_number, doc_type, revision, file_size)
  values ('54000000-0000-0000-0000-00000000000c', '34000000-0000-0000-0000-000000000001',
    (select id from public.segments where slug = 'architecture'), 'Pending', 'F-102', 'plan', 'A', 5);
select is(pg_temp.kinds('54000000-0000-0000-0000-00000000000c'), null, 'a pending upload has no event');
update public.documents set status = 'for_review' where id = '54000000-0000-0000-0000-00000000000b';
select is(pg_temp.kinds('54000000-0000-0000-0000-00000000000b'), 'revised>B,status_changed:draft>for_review', 'status changes are recorded');
update public.documents set title = 'Renamed' where id = '54000000-0000-0000-0000-00000000000b';
select is((select count(*) from public.document_events where document_id = '54000000-0000-0000-0000-00000000000b'), 2::bigint,
  'other edits are not events');

set local role authenticated;
select set_config('request.jwt.claim.sub', '44000000-0000-0000-0000-000000000001', true);
select lives_ok($$select public.make_document_current('54000000-0000-0000-0000-00000000000a')$$, 'admin makes A current');
reset role;
select is((select actor_id from public.document_events where document_id = '54000000-0000-0000-0000-00000000000a' and kind = 'made_current'),
  '44000000-0000-0000-0000-000000000001'::uuid, 'make current is an event with its actor');
update public.documents set archived_at = now() where id = '54000000-0000-0000-0000-00000000000b';
select is((select count(*) from public.document_events where document_id = '54000000-0000-0000-0000-00000000000b' and kind = 'archived'),
  1::bigint, 'archiving is recorded');

-- Readers see the events of the documents they can read
set local role authenticated;
select set_config('request.jwt.claim.sub', '44000000-0000-0000-0000-000000000002', true);
select is((select count(*) from public.document_events where document_id = '54000000-0000-0000-0000-00000000000a'), 2::bigint,
  'a member reads events of their documents');
select set_config('request.jwt.claim.sub', '44000000-0000-0000-0000-000000000004', true);
select is((select count(*) from public.document_events where project_id = '34000000-0000-0000-0000-000000000001'), 0::bigint,
  'a member of another discipline reads none');
select set_config('request.jwt.claim.sub', '44000000-0000-0000-0000-000000000003', true);
select is((select count(*) from public.document_events where project_id = '34000000-0000-0000-0000-000000000001'), 0::bigint,
  'another organization reads none');

-- Visits
select set_config('request.jwt.claim.sub', '44000000-0000-0000-0000-000000000002', true);
select lives_ok($$select public.record_project_visit('34000000-0000-0000-0000-000000000001')$$, 'a member records a visit');
select is((select previous_seen_at from public.user_project_visits), null, 'first visit has no previous visit');
reset role;
update public.user_project_visits set last_seen_at = now() - interval '2 days' where user_id = '44000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '44000000-0000-0000-0000-000000000002', true);
select public.record_project_visit('34000000-0000-0000-0000-000000000001');
select ok((select previous_seen_at < now() - interval '1 day' from public.user_project_visits), 'a new visit moves the previous visit forward');
select public.record_project_visit('34000000-0000-0000-0000-000000000001');
select ok((select previous_seen_at < now() - interval '1 day' from public.user_project_visits), 'a reload keeps the same previous visit');
select public.record_project_visit('34000000-0000-0000-0000-000000000001', true);
select ok((select previous_seen_at = now() from public.user_project_visits), 'mark as seen clears the updates');
select throws_ok($$insert into public.user_project_visits(user_id, project_id) values ('44000000-0000-0000-0000-000000000004', '34000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'nobody writes another user''s visits');

-- Watchers
select lives_ok($$insert into public.project_watchers(user_id, project_id, enabled) values ('44000000-0000-0000-0000-000000000002', '34000000-0000-0000-0000-000000000001', false)$$,
  'a member opts out of emails');
select set_config('request.jwt.claim.sub', '44000000-0000-0000-0000-000000000004', true);
select is((select count(*) from public.project_watchers), 0::bigint, 'watch settings are private');
reset role;

select * from finish();
rollback;
