begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into public.organizations(id, name) values
  ('13000000-0000-0000-0000-000000000001', 'Revisions Org A'),
  ('13000000-0000-0000-0000-000000000002', 'Revisions Org B');
insert into public.projects(id, organization_id, name, slug) values
  ('33000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000001', 'Revisions A', 'revisions-a');
insert into auth.users(id, instance_id, aud, role, email, encrypted_password) values
  ('43000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rev-admin@test.invalid', ''),
  ('43000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rev-member@test.invalid', ''),
  ('43000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rev-other@test.invalid', '');
insert into public.profiles(id, organization_id, role, full_name, must_change_password) values
  ('43000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000001', 'org_admin', 'Revisions Admin', false),
  ('43000000-0000-0000-0000-000000000002', '13000000-0000-0000-0000-000000000001', 'member', 'Revisions Member', false),
  ('43000000-0000-0000-0000-000000000003', '13000000-0000-0000-0000-000000000002', 'org_admin', 'Other Admin', false);
insert into public.user_project_access(user_id, project_id, segment_id) values
  ('43000000-0000-0000-0000-000000000002', '33000000-0000-0000-0000-000000000001', null);

create temporary table ids(name text primary key, id uuid);
grant select on ids to authenticated;
insert into ids values
  ('A', '53000000-0000-0000-0000-00000000000a'), ('B', '53000000-0000-0000-0000-00000000000b'),
  ('C', '53000000-0000-0000-0000-00000000000c'), ('OLD', '53000000-0000-0000-0000-0000000000d0'),
  ('X1', '53000000-0000-0000-0000-0000000000e1'), ('X2', '53000000-0000-0000-0000-0000000000e2');

-- Uploads arrive as pending; finalize (or a trusted script) flips them to ready.
create function pg_temp.upload(p_name text, p_number text, p_revision text) returns void language sql as $$
  insert into public.documents(id, project_id, segment_id, title, doc_number, doc_type, revision, file_size)
    values ((select id from ids where name = p_name), '33000000-0000-0000-0000-000000000001',
      (select id from public.segments where slug = 'architecture'), 'Plan ' || p_name, p_number, 'plan', p_revision, 5);
  update public.documents set upload_status = 'ready' where id = (select id from ids where name = p_name);
$$;
create function pg_temp.current_of(p_number text) returns text language sql as $$
  select string_agg(i.name, ',' order by i.name) from public.documents d join ids i on i.id = d.id
  where d.doc_number = p_number and d.is_current;
$$;

-- Privileges
select ok(not has_column_privilege('authenticated', 'public.documents', 'is_current', 'UPDATE'),
  'clients cannot write is_current');
select ok(not has_column_privilege('authenticated', 'public.documents', 'superseded_by', 'UPDATE'),
  'clients cannot write superseded_by');
select ok(has_column_privilege('authenticated', 'public.documents', 'is_current', 'SELECT'),
  'clients can read is_current');
select ok(not has_function_privilege('authenticated', 'public.set_current_revision(uuid,uuid,text,uuid)', 'EXECUTE'),
  'clients cannot call the internal helper');
select ok(not has_function_privilege('anon', 'public.make_document_current(uuid)', 'EXECUTE'),
  'anon cannot make a revision current');

-- Upload order
select pg_temp.upload('A', 'A-101', 'A');
select is(pg_temp.current_of('A-101'), 'A', 'first revision becomes current');
select pg_temp.upload('B', 'A-101', 'B');
select is(pg_temp.current_of('A-101'), 'B', 'a higher revision supersedes the current one');
select is((select superseded_by from public.documents where id = (select id from ids where name = 'A')),
  (select id from ids where name = 'B'), 'the superseded revision points to the current one');
select ok((select superseded_at is not null from public.documents where id = (select id from ids where name = 'A')),
  'the superseded revision records when');
select pg_temp.upload('OLD', 'A-101', '0');
select is(pg_temp.current_of('A-101'), 'B', 'an earlier revision uploaded later goes to the history');
select is((select superseded_by from public.documents where id = (select id from ids where name = 'OLD')),
  (select id from ids where name = 'B'), 'history upload points to the current revision');

-- Explicit choice
set local role authenticated;
select set_config('request.jwt.claim.sub', '43000000-0000-0000-0000-000000000002', true);
select throws_ok($$select public.make_document_current((select id from ids where name = 'A'))$$,
  'P0002', null, 'a member cannot make a revision current');
select throws_ok($$update public.documents set is_current = true where id = (select id from ids where name = 'A')$$,
  '42501', null, 'a member cannot write is_current directly');
select set_config('request.jwt.claim.sub', '43000000-0000-0000-0000-000000000003', true);
select throws_ok($$select public.make_document_current((select id from ids where name = 'A'))$$,
  'P0002', null, 'an admin of another organization cannot make a revision current');
select set_config('request.jwt.claim.sub', '43000000-0000-0000-0000-000000000001', true);
select throws_ok($$update public.documents set is_current = true where id = (select id from ids where name = 'A')$$,
  '42501', null, 'even the project admin cannot write is_current directly');
select lives_ok($$select public.make_document_current((select id from ids where name = 'A'))$$,
  'the project admin can make an earlier revision current');
reset role;
select is(pg_temp.current_of('A-101'), 'A', 'make current switches the current revision');
select is((select superseded_by from public.documents where id = (select id from ids where name = 'B')),
  (select id from ids where name = 'A'), 'the previous current revision is now superseded');
select is((select count(*) from public.admin_events where action = 'document_made_current'
  and details->>'document_id' = (select id::text from ids where name = 'A')), 1::bigint, 'make current is audited');

-- Archive and restore
update public.documents set archived_at = now() where id = (select id from ids where name = 'A');
select is(pg_temp.current_of('A-101'), 'B', 'archiving the current revision promotes the best remaining one');
update public.documents set archived_at = null where id = (select id from ids where name = 'A');
select is(pg_temp.current_of('A-101'), 'B', 'a restored revision stays in the history');
update public.documents set archived_at = now() where doc_number = 'A-101';
select is(pg_temp.current_of('A-101'), null, 'no current revision when every revision is archived');
update public.documents set archived_at = null where id = (select id from ids where name = 'OLD');
select is(pg_temp.current_of('A-101'), 'OLD', 'restoring into an empty number makes it current');

-- Metadata edits
select pg_temp.upload('X1', 'B-200', 'A');
select pg_temp.upload('X2', 'B-201', 'A');
update public.documents set doc_number = 'B-200', revision = 'B' where id = (select id from ids where name = 'X2');
select is(pg_temp.current_of('B-200'), 'X2', 'renumbering into a number with a lower revision takes over');
select is(pg_temp.current_of('B-201'), null, 'the number it left has no current revision');
update public.documents set revision = 'C' where id = (select id from ids where name = 'X1');
select is(pg_temp.current_of('B-200'), 'X1', 'raising a superseded revision above the current one makes it current');
update public.documents set revision = '0' where id = (select id from ids where name = 'X1');
select is(pg_temp.current_of('B-200'), 'X1', 'lowering the current revision keeps it current (explicit choice)');

-- Invariant and counts
select is((select count(*) from (select 1 from public.documents where is_current
  group by project_id, segment_id, doc_number having count(*) > 1) t), 0::bigint, 'never two current revisions');
select is((select count from public.document_counts(array['33000000-0000-0000-0000-000000000001'::uuid])),
  2::bigint, 'counts include current revisions only');

-- Access logs remember whether the opened revision was superseded
insert into public.access_logs(user_id, project_id, document_id, action) values
  ('43000000-0000-0000-0000-000000000002', '33000000-0000-0000-0000-000000000001', (select id from ids where name = 'B'), 'view'),
  ('43000000-0000-0000-0000-000000000002', '33000000-0000-0000-0000-000000000001', (select id from ids where name = 'X1'), 'view');
select is((select document_superseded from public.access_logs where document_id = (select id from ids where name = 'B')),
  true, 'a view of a superseded revision is marked');
select is((select document_revision from public.access_logs where document_id = (select id from ids where name = 'X1')),
  '0', 'the opened revision is recorded');
select is((select document_superseded from public.access_logs where document_id = (select id from ids where name = 'X1')),
  false, 'a view of the current revision is not marked');

-- Members read their own organization (organizations_select fix)
set local role authenticated;
select set_config('request.jwt.claim.sub', '43000000-0000-0000-0000-000000000002', true);
select is((select count(*) from public.organizations), 1::bigint, 'a member reads their own organization');
select is((select count(*) from public.organizations where id = '13000000-0000-0000-0000-000000000002'), 0::bigint,
  'a member does not read other organizations');
reset role;

select * from finish();
rollback;
