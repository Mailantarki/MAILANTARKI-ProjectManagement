begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
select set_config('test.code_count',(select count(*)::text from public.access_codes),true);
select ok(not has_function_privilege('anon',
  'public.create_access_code_with_grants(uuid,text,text,timestamptz,integer,boolean,jsonb)','EXECUTE'),
  'anonymous visitors cannot create codes through RPC');

insert into public.organizations(id,name) values
  ('14000000-0000-0000-0000-000000000001','Code Panel A'),
  ('14000000-0000-0000-0000-000000000002','Code Panel B');
insert into public.projects(id,organization_id,name,slug) values
  ('34000000-0000-0000-0000-000000000001','14000000-0000-0000-0000-000000000001','Code A','code-panel-a'),
  ('34000000-0000-0000-0000-000000000002','14000000-0000-0000-0000-000000000002','Code B','code-panel-b');
insert into auth.users(id,instance_id,aud,role,email,encrypted_password) values
  ('44000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','code-panel@test.invalid','');
insert into public.profiles(id,organization_id,role,full_name) values
  ('44000000-0000-0000-0000-000000000001','14000000-0000-0000-0000-000000000001','org_admin','Code Admin');

set local role authenticated;
select set_config('request.jwt.claim.sub','44000000-0000-0000-0000-000000000001',true);
select throws_ok($$select public.create_access_code_with_grants(
  '14000000-0000-0000-0000-000000000001',repeat('c',64),'Cross tenant',null,1,false,
  '[{"project_id":"34000000-0000-0000-0000-000000000002","segment_id":null}]'::jsonb)$$,
  'P0001','Code and project organization mismatch',
  'cross-organization grant rolls back code creation');
reset role;
select is((select count(*) from public.access_codes),current_setting('test.code_count')::bigint,
  'failed grant leaves no code row');
set local role authenticated;
select set_config('request.jwt.claim.sub','44000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.create_access_code_with_grants(
  '14000000-0000-0000-0000-000000000001',repeat('d',64),'Architecture only',null,1,false,
  jsonb_build_array(jsonb_build_object('project_id','34000000-0000-0000-0000-000000000001',
    'segment_id',(select id from public.segments where slug='architecture'))))$$,
  'org admin creates segment-scoped code under RLS');
select is((select count(*) from public.access_code_grants g join public.access_codes c on c.id=g.access_code_id
  where c.label='Architecture only' and g.segment_id=(select id from public.segments where slug='architecture')),
  1::bigint,'segment grant is stored atomically');
reset role;
select is((select count(*) from public.access_codes where label='Architecture only' and code_hash ~ '^[0-9a-f]{64}$'),
  1::bigint,'only hash is stored');

select * from finish();
rollback;
