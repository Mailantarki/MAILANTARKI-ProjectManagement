begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into organizations(id,name) values
 ('91000000-0000-4000-8000-000000000001','UM Org A'),('91000000-0000-4000-8000-000000000002','UM Org B');
insert into projects(id,organization_id,name,slug) values
 ('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','UM Project','um-project');
insert into auth.users(id,instance_id,aud,role,email,encrypted_password)
select ('93000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 '00000000-0000-0000-0000-000000000000','authenticated','authenticated','um-'||n||'@example.test','initial-hash'
 from generate_series(1,50) n;
insert into profiles(id,organization_id,role,full_name)
select ('93000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'91000000-0000-4000-8000-000000000001','member',
 'UM member '||lpad(n::text,2,'0') from generate_series(1,30) n;
insert into profiles(id,organization_id,role,full_name) values
 ('93000000-0000-4000-8000-000000000040','91000000-0000-4000-8000-000000000001','org_admin','UM admin'),
 ('93000000-0000-4000-8000-000000000041','91000000-0000-4000-8000-000000000001','org_admin','UM peer'),
 ('93000000-0000-4000-8000-000000000042',null,'super_admin','UM super'),
 ('93000000-0000-4000-8000-000000000043',null,'super_admin','UM super peer'),
 ('93000000-0000-4000-8000-000000000050','91000000-0000-4000-8000-000000000002','member','UM member foreign');
insert into user_project_access(user_id,project_id) values
 ('93000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001'),
 ('93000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000001');
insert into documents(project_id,segment_id,title,doc_number,doc_type,file_size,upload_status,file_path)
values('92000000-0000-4000-8000-000000000001',(select id from segments where slug='architecture'),
 'UM document','UM-01','plan',100,'ready','projects/um-fixture/test.pdf');

set local role authenticated;
select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000040',true);
select is((admin_user_directory(p_query=>'UM member')->>'total')::integer,30,'directory scopes users before counting');
select is(jsonb_array_length(admin_user_directory(p_query=>'UM member')->'users'),25,'first page has 25 users');
select is(jsonb_array_length(admin_user_directory(p_query=>'UM member',p_page=>2)->'users'),5,'second page has 5 users');
select is((select count(distinct item->>'id') from (
 select jsonb_array_elements(admin_user_directory(p_query=>'UM member')->'users') as item
 union all select jsonb_array_elements(admin_user_directory(p_query=>'UM member',p_page=>2)->'users')) x),30::bigint,'pages contain all 30 distinct users');
select is((admin_user_directory(p_query=>'UM member',p_page=>999)->>'page')::integer,2,'out-of-range page clamps');
select is((admin_user_directory(p_query=>'um-1@example.test')->>'total')::integer,1,'search matches exact email substring');
select is((admin_user_directory(p_query=>'UM ',p_project=>'92000000-0000-4000-8000-000000000001')->>'total')::integer,4,'project filter includes both members and role-based admins');
select is((admin_user_directory(p_query=>'UM ',p_organization=>'91000000-0000-4000-8000-000000000002')->>'total')::integer,0,'foreign organization filter cannot escape scope');
select throws_ok($$select set_user_suspended('93000000-0000-4000-8000-000000000050',true)$$,'P0001','Not authorized','foreign member suspension rejected');
select throws_ok($$select set_user_suspended('93000000-0000-4000-8000-000000000041',true)$$,'P0001','Not authorized','org admin cannot suspend peer admin');
select throws_ok($$select set_user_suspended('93000000-0000-4000-8000-000000000040',true)$$,'P0001','Not authorized','self suspension rejected');
select throws_ok($$update profiles set suspended_at=now() where id='93000000-0000-4000-8000-000000000001'$$,'42501',null,'direct suspension column write denied');
select lives_ok($$select set_user_suspended('93000000-0000-4000-8000-000000000001',true)$$,'own member suspension succeeds');
select is((admin_user_directory(p_query=>'UM ',p_status=>'suspended')->>'total')::integer,1,'suspended filter is exact');
select is((select count(*) from admin_events where target_user_id='93000000-0000-4000-8000-000000000001' and action='user_suspended'),1::bigint,'suspension is audited once');
select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000001',true);
select ok(not account_ready(),'existing member JWT loses account readiness');
select is((select count(*) from documents),0::bigint,'existing JWT cannot read documents');
select is((select count(*) from projects),0::bigint,'existing JWT cannot read projects');
select throws_ok($$select admin_user_directory()$$,'P0001','Not authorized','member cannot enumerate Auth emails');
select throws_ok($$select set_user_suspended('93000000-0000-4000-8000-000000000002',true)$$,'P0001','Not authorized','member cannot suspend users');
select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000040',true);
select lives_ok($$select set_user_suspended('93000000-0000-4000-8000-000000000001',false)$$,'reactivation preserves assignments');
select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000001',true);
select is((select count(*) from documents where doc_number='UM-01'),1::bigint,'reactivated user retains prior access');
select throws_ok($$update profiles set must_change_password=false where id=auth.uid()$$,'42501',null,'client cannot clear initial password requirement');
reset role;
update profiles set must_change_password=true where id='93000000-0000-4000-8000-000000000001';
set local role authenticated;
select ok(not account_ready(),'initial password cannot access portal');
select is((select count(*) from documents),0::bigint,'initial password cannot read PDFs via direct API');
reset role;
update auth.users set raw_user_meta_data='{"must_change_password":false}' where id='93000000-0000-4000-8000-000000000001';
select ok((select must_change_password from profiles where id='93000000-0000-4000-8000-000000000001'),'user metadata cannot clear password requirement');
update auth.users set encrypted_password='new-hash' where id='93000000-0000-4000-8000-000000000001';
select ok(not (select must_change_password from profiles where id='93000000-0000-4000-8000-000000000001'),'real Auth password change clears requirement');
set local role authenticated;
select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000042',true);
select lives_ok($$select set_user_suspended('93000000-0000-4000-8000-000000000040',true)$$,'superadmin can suspend org admin');
select lives_ok($$select set_user_suspended('93000000-0000-4000-8000-000000000043',true)$$,'superadmin can suspend other superadmin');
select throws_ok($$select set_user_suspended('93000000-0000-4000-8000-000000000042',true)$$,'P0001','Not authorized','remaining superadmin cannot self suspend');
select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000040',true);
select ok(not is_org_admin('91000000-0000-4000-8000-000000000001'),'suspended org admin loses helper permissions');
select is((select count(*) from access_codes),0::bigint,'suspended admin cannot read codes');
select throws_ok($$select set_user_suspended('93000000-0000-4000-8000-000000000002',true)$$,'P0001','Not authorized','suspended admin cannot mutate through RPC');
reset role;
select ok(not has_function_privilege('anon','public.admin_user_directory(text,text,text,uuid,uuid,integer)','EXECUTE'),'anonymous cannot enumerate directory');
select ok(not has_table_privilege('authenticated','public.admin_events','INSERT'),'clients cannot forge audit events');
select ok(not has_table_privilege('authenticated','public.admin_events','TRUNCATE'),'clients cannot erase audit history');
select * from finish();
rollback;
