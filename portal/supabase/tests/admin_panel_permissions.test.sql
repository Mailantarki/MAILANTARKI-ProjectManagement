begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into public.organizations(id,name) values
  ('13000000-0000-0000-0000-000000000001','Panel Test A'),
  ('13000000-0000-0000-0000-000000000002','Panel Test B');
insert into public.projects(id,organization_id,name,slug) values
  ('33000000-0000-0000-0000-000000000001','13000000-0000-0000-0000-000000000001','Panel A','panel-a'),
  ('33000000-0000-0000-0000-000000000002','13000000-0000-0000-0000-000000000002','Panel B','panel-b');
insert into auth.users(id,instance_id,aud,role,email,encrypted_password) values
  ('43000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','panel-admin@test.invalid',''),
  ('43000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','panel-other@test.invalid','');
insert into public.profiles(id,organization_id,role,full_name) values
  ('43000000-0000-0000-0000-000000000001','13000000-0000-0000-0000-000000000001','org_admin','Panel Admin'),
  ('43000000-0000-0000-0000-000000000002','13000000-0000-0000-0000-000000000002','member','Other Member');
insert into public.documents(id,project_id,segment_id,title,doc_number,doc_type,file_size,upload_status) values
  ('53000000-0000-0000-0000-000000000001','33000000-0000-0000-0000-000000000001',
   (select id from public.segments where slug='architecture'),'Panel Drawing','PANEL-1','plan',10,'ready');
insert into public.access_logs(organization_id,user_id,project_id,document_id,action) values
  ('13000000-0000-0000-0000-000000000001','43000000-0000-0000-0000-000000000001',
   '33000000-0000-0000-0000-000000000001','53000000-0000-0000-0000-000000000001','view');

set local role authenticated;
select set_config('request.jwt.claim.sub','43000000-0000-0000-0000-000000000001',true);
select throws_ok($$insert into public.user_project_access(user_id,project_id)
  values('43000000-0000-0000-0000-000000000002','33000000-0000-0000-0000-000000000001')$$,
  'P0001','User and project organization mismatch',
  'direct client cannot assign outside-organization user to own project');
with changed as (update public.profiles set role='super_admin'
  where id='43000000-0000-0000-0000-000000000002' returning id)
select is((select count(*) from changed),0::bigint,
  'org admin cannot promote outside user to super admin');
with changed as (update public.projects set name='Forbidden' where id='33000000-0000-0000-0000-000000000002' returning id)
select is((select count(*) from changed),0::bigint,'org admin cannot edit other organization project');
update public.documents set archived_at=now() where id='53000000-0000-0000-0000-000000000001';
select is((select count(*) from public.access_logs where document_id='53000000-0000-0000-0000-000000000001'),
  1::bigint,'document archive preserves access log');
update public.documents set archived_at=null where id='53000000-0000-0000-0000-000000000001';
select is((select archived_at from public.documents where id='53000000-0000-0000-0000-000000000001'),
  null::timestamptz,'project admin can restore document');
update public.projects set archived_at=now() where id='33000000-0000-0000-0000-000000000001';
update public.projects set archived_at=null where id='33000000-0000-0000-0000-000000000001';
select is((select archived_at from public.projects where id='33000000-0000-0000-0000-000000000001'),
  null::timestamptz,'project archive can be restored');
select is((select document_title from public.access_logs where document_id='53000000-0000-0000-0000-000000000001'),
  'Panel Drawing','restore leaves log snapshot unchanged');

select * from finish();
rollback;
