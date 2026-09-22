begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into public.organizations(id, name) values
  ('12000000-0000-0000-0000-000000000001', 'Finalize Org A'),
  ('12000000-0000-0000-0000-000000000002', 'Finalize Org B');
insert into public.projects(id, organization_id, name, slug) values
  ('32000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000001', 'Finalize A', 'finalize-a'),
  ('32000000-0000-0000-0000-000000000002', '12000000-0000-0000-0000-000000000002', 'Finalize B', 'finalize-b');
insert into auth.users(id, instance_id, aud, role, email, encrypted_password) values
  ('42000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'finalize-a@test.invalid', ''),
  ('42000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'finalize-b@test.invalid', '');
insert into public.profiles(id, organization_id, role, full_name) values
  ('42000000-0000-0000-0000-000000000011', '12000000-0000-0000-0000-000000000001', 'org_admin', 'Finalize Admin A'),
  ('42000000-0000-0000-0000-000000000012', '12000000-0000-0000-0000-000000000002', 'org_admin', 'Finalize Admin B');
insert into public.documents(id, project_id, segment_id, title, doc_number, doc_type, file_size) values
  ('52000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001',
   (select id from public.segments where slug='architecture'), 'Pending A', 'PENDING-A', 'plan', 5);

select ok(not has_column_privilege('authenticated', 'public.documents', 'upload_status', 'UPDATE'),
  'authenticated client cannot update upload_status column');
select ok(not has_function_privilege('anon', 'public.finalize_document_upload(uuid,bigint)', 'EXECUTE'),
  'anon cannot call finalize RPC');
select ok(not has_function_privilege('authenticated', 'public.finalize_document_upload(uuid,bigint)', 'EXECUTE'),
  'authenticated client cannot call finalize RPC');
select ok(has_function_privilege('service_role', 'public.finalize_document_upload(uuid,bigint)', 'EXECUTE'),
  'service role can call finalize RPC');

set local role authenticated;
select set_config('request.jwt.claim.sub', '42000000-0000-0000-0000-000000000011', true);
select throws_ok($$update public.documents set upload_status='ready'
  where id='52000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'direct authenticated update cannot mark pending document ready');
select is((select upload_status from public.documents where id='52000000-0000-0000-0000-000000000001'),
  'pending', 'blocked direct update leaves document pending');
update public.documents set title='Edited pending' where id='52000000-0000-0000-0000-000000000001';
select is((select title from public.documents where id='52000000-0000-0000-0000-000000000001'),
  'Edited pending', 'regular metadata update remains possible');

select set_config('request.jwt.claim.sub', '42000000-0000-0000-0000-000000000012', true);
select throws_ok($$select public.finalize_document_upload('52000000-0000-0000-0000-000000000001', 100)$$,
  '42501', null, 'admin from another organization cannot execute finalize RPC');

select set_config('request.jwt.claim.sub', '42000000-0000-0000-0000-000000000011', true);
select throws_ok($$select public.finalize_document_upload('52000000-0000-0000-0000-000000000001', 100)$$,
  '42501', null, 'owner admin also cannot execute finalize RPC directly');
reset role;
select throws_ok($$select public.finalize_document_upload('52000000-0000-0000-0000-000000000001', 100)$$,
  'P0001', 'storage_object_missing', 'pending document without Storage object cannot be finalized');
insert into storage.objects(bucket_id, name, metadata) values
  ('documents', (select file_path from public.documents where id='52000000-0000-0000-0000-000000000001'),
   '{"size": 100}'::jsonb);
select throws_ok($$select public.finalize_document_upload('52000000-0000-0000-0000-000000000001', 101)$$,
  'P0001', 'file_size_mismatch', 'wrong size cannot finalize');
select lives_ok($$select public.finalize_document_upload('52000000-0000-0000-0000-000000000001', 100)$$,
  'service role path can finalize when Storage metadata matches');
select is((select upload_status from public.documents where id='52000000-0000-0000-0000-000000000001'),
  'ready', 'RPC makes the document ready');
select is((select file_size from public.documents where id='52000000-0000-0000-0000-000000000001'),
  100::bigint, 'RPC records server-verified size');
select throws_ok($$select public.finalize_document_upload('52000000-0000-0000-0000-000000000001', 100)$$,
  'P0001', 'invalid_status_transition', 'second finalization fails without changing ready document');
update public.documents set title='Edited ready' where id='52000000-0000-0000-0000-000000000001';
select is((select title from public.documents where id='52000000-0000-0000-0000-000000000001'),
  'Edited ready', 'regular metadata updates still work after finalization');

insert into public.documents(id, project_id, segment_id, title, doc_number, doc_type, file_size) values
  ('52000000-0000-0000-0000-000000000002', '32000000-0000-0000-0000-000000000001',
   (select id from public.segments where slug='architecture'), 'Retry A', 'RETRY-NUMBER', 'plan', 5),
  ('52000000-0000-0000-0000-000000000003', '32000000-0000-0000-0000-000000000001',
   (select id from public.segments where slug='architecture'), 'Retry B', 'RETRY-NUMBER', 'plan', 5);
select is((select count(*) from public.documents where doc_number='RETRY-NUMBER'), 2::bigint,
  'multiple pending attempts can share a document number');
insert into storage.objects(bucket_id, name, metadata)
  select 'documents', file_path, '{"size": 100}'::jsonb
  from public.documents where doc_number='RETRY-NUMBER';
select lives_ok($$select public.finalize_document_upload('52000000-0000-0000-0000-000000000002', 100)$$,
  'first pending attempt becomes ready');
select throws_ok($$select public.finalize_document_upload('52000000-0000-0000-0000-000000000003', 100)$$,
  '23505', null, 'second attempt cannot duplicate a ready document');
select is((select upload_status from public.documents where id='52000000-0000-0000-0000-000000000003'),
  'pending', 'rejected duplicate remains pending for controlled cleanup');

select * from finish();
rollback;
