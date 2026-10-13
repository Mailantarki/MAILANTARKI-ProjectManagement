alter table public.profiles
  add column suspended_at timestamptz,
  add column must_change_password boolean not null default false;
revoke insert on public.profiles from public, anon, authenticated;
grant insert (id, organization_id, role, full_name) on public.profiles to authenticated;

create function public.account_ready() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles p join auth.users u on u.id=p.id
    where p.id=(select auth.uid()) and p.suspended_at is null and not p.must_change_password
      and u.deleted_at is null and (u.banned_until is null or u.banned_until <= now()));
$$;
revoke execute on function public.account_ready() from public, anon;
grant execute on function public.account_ready() to authenticated;

create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.account_ready() and exists(select 1 from public.profiles
    where id=(select auth.uid()) and role='super_admin');
$$;
create or replace function public.is_org_admin(p_organization uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.account_ready() and (public.is_super_admin() or exists(select 1 from public.profiles
    where id=(select auth.uid()) and role='org_admin' and organization_id=p_organization));
$$;

create table public.admin_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  actor_id uuid references public.profiles(id),
  target_user_id uuid references public.profiles(id),
  action text not null check(action in ('user_created','user_suspended','user_reactivated','access_assigned','access_removed','password_changed')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.admin_events enable row level security;
revoke all on public.admin_events from public, anon, authenticated;
grant select on public.admin_events to authenticated;
grant all on public.admin_events to service_role;
create policy admin_events_select on public.admin_events for select to authenticated
  using(public.is_org_admin(organization_id));
create index admin_events_target_time on public.admin_events(target_user_id,created_at desc);
create index admin_events_org_time on public.admin_events(organization_id,created_at desc);

-- Restrictive gates protect already-issued JWTs and direct PostgREST calls.
do $$ declare t text; begin
  foreach t in array array['organizations','projects','segments','documents','user_project_access',
    'access_codes','access_code_grants','access_logs','admin_events'] loop
    execute format('create policy account_ready_gate on public.%I as restrictive for all to authenticated using ((select public.account_ready())) with check ((select public.account_ready()))', t);
  end loop;
end $$;
create policy account_profile_read on public.profiles as restrictive for select to authenticated
  using(id=(select auth.uid()) or (select public.account_ready()));
create policy account_profile_insert on public.profiles as restrictive for insert to authenticated
  with check((select public.account_ready()));
create policy account_profile_update on public.profiles as restrictive for update to authenticated
  using((select public.account_ready())) with check((select public.account_ready()));
create policy account_profile_delete on public.profiles as restrictive for delete to authenticated
  using((select public.account_ready()));

create function public.set_user_suspended(p_user uuid, p_suspended boolean) returns void
language plpgsql security definer set search_path = public as $$
declare actor public.profiles; target public.profiles;
begin
  -- Serialize account status decisions before reading roles/statuses.
  perform pg_advisory_xact_lock(90240924);
  select * into actor from public.profiles where id=(select auth.uid());
  select * into target from public.profiles where id=p_user for update;
  if not public.account_ready() or actor.id is null or target.id is null or actor.id=target.id
    or not (actor.role='super_admin' or (actor.role='org_admin' and target.role='member'
      and actor.organization_id=target.organization_id)) then raise exception 'Not authorized'; end if;
  if not exists(select 1 from auth.users where id=p_user and deleted_at is null) then
    raise exception 'User unavailable'; end if;
  if p_suspended and target.role='super_admin' and not exists(
    select 1 from public.profiles p join auth.users u on u.id=p.id where p.id<>target.id
      and p.role='super_admin' and p.suspended_at is null and not p.must_change_password
      and u.deleted_at is null and (u.banned_until is null or u.banned_until <= now())) then
    raise exception 'Last active super admin'; end if;
  if (target.suspended_at is not null)=p_suspended then return; end if;
  update public.profiles set suspended_at=case when p_suspended then now() else null end where id=p_user;
  insert into public.admin_events(organization_id,actor_id,target_user_id,action)
    values(target.organization_id,actor.id,target.id,case when p_suspended then 'user_suspended' else 'user_reactivated' end);
end;
$$;
revoke execute on function public.set_user_suspended(uuid,boolean) from public, anon;
grant execute on function public.set_user_suspended(uuid,boolean) to authenticated;

create function public.audit_user_access() returns trigger
language plpgsql security definer set search_path = public as $$
declare row_data public.user_project_access; org uuid;
begin
  row_data := case when tg_op='DELETE' then old else new end;
  select organization_id into org from public.profiles where id=row_data.user_id;
  if (select auth.uid()) is not null then
    insert into public.admin_events(organization_id,actor_id,target_user_id,action,details)
    values(org,(select auth.uid()),row_data.user_id,case when tg_op='DELETE' then 'access_removed' else 'access_assigned' end,
      jsonb_build_object('project_id',row_data.project_id,'segment_id',row_data.segment_id,'can_download',row_data.can_download));
  end if;
  return null;
end;
$$;
revoke execute on function public.audit_user_access() from public, anon, authenticated;
create trigger audit_user_access after insert or update or delete on public.user_project_access
  for each row execute function public.audit_user_access();

-- Only a real Auth password change clears the initial-password requirement.
create function public.complete_initial_password_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.encrypted_password is distinct from new.encrypted_password and new.encrypted_password <> '' then
    update public.profiles set must_change_password=false where id=new.id and must_change_password;
    if found then
      insert into public.admin_events(organization_id,actor_id,target_user_id,action)
      select organization_id,id,id,'password_changed' from public.profiles where id=new.id;
    end if;
  end if;
  return null;
end;
$$;
revoke execute on function public.complete_initial_password_change() from public, anon, authenticated;
create trigger complete_initial_password_change after update of encrypted_password on auth.users
  for each row execute function public.complete_initial_password_change();

-- Read-only directory: fixed projection, scoped before filtering/counting/pagination.
create function public.admin_user_directory(p_query text default '', p_role text default '',
  p_status text default '', p_project uuid default null, p_organization uuid default null, p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare actor public.profiles; result jsonb;
begin
  select * into actor from public.profiles where id=(select auth.uid());
  if not public.account_ready() or actor.id is null or actor.role not in ('super_admin','org_admin') then
    raise exception 'Not authorized'; end if;
  if length(p_query)>120 or p_page<1 or p_page>100000 or p_role not in ('','member','org_admin','super_admin')
    or p_status not in ('','active','suspended','pending') then raise exception 'Invalid filters'; end if;
  with filtered as (
    select p.id,p.full_name,p.role,p.organization_id,p.suspended_at,p.must_change_password,
      u.email,u.last_sign_in_at, o.name as organization_name,
      (select count(*) from public.projects pr join public.organizations org on org.id=pr.organization_id
        where pr.archived_at is null and org.archived_at is null and (p.role='super_admin'
          or (p.organization_id=pr.organization_id and (p.role='org_admin' or exists(
            select 1 from public.user_project_access a where a.user_id=p.id and a.project_id=pr.id))))) as project_count
    from public.profiles p join auth.users u on u.id=p.id left join public.organizations o on o.id=p.organization_id
    where u.deleted_at is null and (actor.role='super_admin' or p.organization_id=actor.organization_id)
      and (p_query='' or strpos(lower(p.full_name),lower(p_query))>0 or strpos(lower(u.email),lower(p_query))>0)
      and (p_role='' or p.role::text=p_role)
      and (p_organization is null or p.organization_id=p_organization)
      and (p_status='' or (p_status='suspended' and p.suspended_at is not null)
        or (p_status='active' and p.suspended_at is null and not p.must_change_password)
        or (p_status='pending' and p.suspended_at is null and p.must_change_password))
      and (p_project is null or exists(select 1 from public.projects pr join public.organizations org on org.id=pr.organization_id
        where pr.id=p_project and pr.archived_at is null and org.archived_at is null
        and public.is_project_admin(pr.id) and (p.role='super_admin' or (p.organization_id=pr.organization_id
          and (p.role='org_admin' or exists(select 1 from public.user_project_access a where a.user_id=p.id and a.project_id=pr.id))))))
  ), total as (select count(*) as n from filtered), paging as (
    select greatest(1,least(p_page,greatest(1,ceil(n/25.0)::integer))) as page from total
  ), rows as (select * from filtered order by lower(full_name),id limit 25 offset ((select page from paging)-1)*25)
  select jsonb_build_object('users',coalesce((select jsonb_agg(to_jsonb(r) order by lower(r.full_name),r.id) from rows r),'[]'::jsonb),
    'total',(select n from total),'page',(select page from paging)) into result;
  return result;
end;
$$;
revoke execute on function public.admin_user_directory(text,text,text,uuid,uuid,integer) from public, anon;
grant execute on function public.admin_user_directory(text,text,text,uuid,uuid,integer) to authenticated;
