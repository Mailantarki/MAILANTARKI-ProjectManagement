-- Restoration is an authenticated admin UPDATE; never a physical delete.
create or replace function public.stamp_archive()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.archived_at is null and new.archived_at is not null then
    new.archived_at := now();
    new.archived_by := auth.uid();
  elsif old.archived_at is not null and new.archived_at is null then
    new.archived_by := null;
  elsif new.archived_at is distinct from old.archived_at then
    raise exception 'Archived records cannot be backdated';
  else
    new.archived_by := old.archived_by;
  end if;
  return new;
end;
$$;

-- Direct PostgREST writes must not grant access across organizations either.
create function public.can_manage_user_project_access(p_user uuid, p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_project_admin(p_project) and exists (
    select 1 from public.profiles u join public.projects p on p.id = p_project
    where u.id = p_user and u.organization_id = p.organization_id
      and u.role <> 'super_admin' and u.id <> auth.uid()
  );
$$;
revoke execute on function public.can_manage_user_project_access(uuid,uuid) from public, anon;
grant execute on function public.can_manage_user_project_access(uuid,uuid) to authenticated;

drop policy user_project_access_insert on public.user_project_access;
drop policy user_project_access_update on public.user_project_access;
drop policy user_project_access_delete on public.user_project_access;
create policy user_project_access_insert on public.user_project_access for insert to authenticated
  with check (public.can_manage_user_project_access(user_id, project_id));
create policy user_project_access_update on public.user_project_access for update to authenticated
  using (public.can_manage_user_project_access(user_id, project_id))
  with check (public.can_manage_user_project_access(user_id, project_id));
create policy user_project_access_delete on public.user_project_access for delete to authenticated
  using (public.can_manage_user_project_access(user_id, project_id));
