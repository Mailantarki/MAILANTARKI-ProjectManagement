alter table public.organizations
  add column archived_at timestamptz,
  add column archived_by uuid references public.profiles(id) on delete set null;
alter table public.projects
  add column archived_at timestamptz,
  add column archived_by uuid references public.profiles(id) on delete set null;
alter table public.documents
  add column archived_at timestamptz,
  add column archived_by uuid references public.profiles(id) on delete set null;

alter table public.documents drop constraint documents_project_id_fkey;
alter table public.documents add constraint documents_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete restrict;
alter table public.user_project_access drop constraint user_project_access_project_id_fkey;
alter table public.user_project_access add constraint user_project_access_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete restrict;
alter table public.access_code_grants drop constraint access_code_grants_project_id_fkey;
alter table public.access_code_grants add constraint access_code_grants_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete restrict;
alter table public.access_logs drop constraint access_logs_project_id_fkey;
alter table public.access_logs add constraint access_logs_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete restrict;
alter table public.access_logs drop constraint access_logs_document_id_fkey;
alter table public.access_logs add constraint access_logs_document_id_fkey
  foreign key (document_id) references public.documents(id) on delete set null;

alter table public.access_logs
  add column document_title text,
  add column doc_number text,
  add column project_name text;

update public.access_logs l
set document_title = d.title, doc_number = d.doc_number, project_name = p.name
from public.documents d join public.projects p on p.id = d.project_id
where l.document_id = d.id;
update public.access_logs l
set project_name = p.name
from public.projects p
where l.project_id = p.id and l.project_name is null;

create function public.fill_access_log_snapshot()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.document_id is not null then
    select d.title, d.doc_number, p.name
      into new.document_title, new.doc_number, new.project_name
    from public.documents d join public.projects p on p.id = d.project_id
    where d.id = new.document_id;
  elsif new.project_id is not null then
    select p.name into new.project_name from public.projects p where p.id = new.project_id;
  end if;
  return new;
end;
$$;
create trigger access_logs_snapshot before insert on public.access_logs
  for each row execute function public.fill_access_log_snapshot();

create function public.stamp_archive()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.archived_at is null and new.archived_at is not null then
    new.archived_at := now();
    new.archived_by := auth.uid();
  elsif old.archived_at is not null and new.archived_at is distinct from old.archived_at then
    raise exception 'Archived records cannot be restored or backdated';
  else
    new.archived_by := old.archived_by;
  end if;
  return new;
end;
$$;
create trigger organizations_archive before update on public.organizations
  for each row execute function public.stamp_archive();
create trigger projects_archive before update on public.projects
  for each row execute function public.stamp_archive();
create trigger documents_archive before update on public.documents
  for each row execute function public.stamp_archive();

create function public.is_active_organization(p_organization uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organizations o
    where o.id = p_organization and o.archived_at is null);
$$;
create function public.is_active_project(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects p join public.organizations o on o.id = p.organization_id
    where p.id = p_project and p.archived_at is null and o.archived_at is null);
$$;
create function public.is_code_project_admin(p_code uuid, p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.access_codes c join public.projects p on p.organization_id = c.organization_id
    where c.id = p_code and p.id = p_project and public.is_project_admin(p_project)
  );
$$;

-- The database chooses the object path; authenticated clients cannot insert or alter it.
create function public.set_document_path()
returns trigger language plpgsql security definer set search_path = public as $$
declare segment_slug text;
begin
  if tg_op = 'INSERT' then
    select slug into segment_slug from public.segments where id = new.segment_id;
    if segment_slug is null then raise exception 'Invalid segment'; end if;
    new.file_path := 'projects/' || new.project_id || '/' || segment_slug || '/' || new.id || '.pdf';
    if auth.uid() is not null then
      new.uploaded_by := auth.uid();
      new.upload_status := 'pending';
    end if;
  elsif new.project_id is distinct from old.project_id
     or new.segment_id is distinct from old.segment_id
     or new.file_path is distinct from old.file_path then
    raise exception 'Document storage identity is immutable';
  end if;
  return new;
end;
$$;
create trigger documents_path before insert or update on public.documents
  for each row execute function public.set_document_path();

create function public.prevent_tenant_reassignment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'Organization assignment is immutable';
  end if;
  return new;
end;
$$;
create trigger projects_organization_immutable before update on public.projects
  for each row execute function public.prevent_tenant_reassignment();
create trigger access_codes_organization_immutable before update on public.access_codes
  for each row execute function public.prevent_tenant_reassignment();

drop policy organizations_select on public.organizations;
create policy organizations_select on public.organizations for select to authenticated
  using (public.is_org_admin(id) or (archived_at is null and exists (
    select 1 from public.profiles pr where pr.id = (select auth.uid()) and pr.organization_id = id
  )));
create policy organizations_insert on public.organizations for insert to authenticated
  with check (public.is_super_admin() and archived_at is null);
create policy organizations_update on public.organizations for update to authenticated
  using (public.is_org_admin(id)) with check (public.is_org_admin(id));

drop policy projects_select on public.projects;
create policy projects_select on public.projects for select to authenticated
  using (public.is_project_admin(id) or (archived_at is null
    and public.is_active_organization(organization_id) and public.has_project_access(id)));
create policy projects_insert on public.projects for insert to authenticated
  with check (public.is_org_admin(organization_id) and archived_at is null
    and (public.is_super_admin() or public.is_active_organization(organization_id)));
create policy projects_update on public.projects for update to authenticated
  using (public.is_project_admin(id)) with check (public.is_org_admin(organization_id));

drop policy documents_select on public.documents;
create policy documents_select on public.documents for select to authenticated
  using (public.is_project_admin(project_id) or (upload_status = 'ready'
    and archived_at is null and public.is_active_project(project_id)
    and public.has_doc_access(project_id, segment_id)));
create policy documents_insert on public.documents for insert to authenticated
  with check (public.is_project_admin(project_id) and public.is_active_project(project_id)
    and archived_at is null);
create policy documents_update on public.documents for update to authenticated
  using (public.is_project_admin(project_id)) with check (public.is_project_admin(project_id));

create policy profiles_insert on public.profiles for insert to authenticated
  with check (public.is_super_admin() or (role <> 'super_admin'
    and public.is_org_admin(organization_id)));
create policy profiles_update on public.profiles for update to authenticated
  using (public.is_super_admin() or (role <> 'super_admin' and public.is_org_admin(organization_id)))
  with check (public.is_super_admin() or (role <> 'super_admin' and public.is_org_admin(organization_id)));

create policy user_project_access_insert on public.user_project_access for insert to authenticated
  with check (public.is_project_admin(project_id));
create policy user_project_access_update on public.user_project_access for update to authenticated
  using (public.is_project_admin(project_id)) with check (public.is_project_admin(project_id));
create policy user_project_access_delete on public.user_project_access for delete to authenticated
  using (public.is_project_admin(project_id));

create policy access_codes_insert on public.access_codes for insert to authenticated
  with check (public.is_org_admin(organization_id) and created_by = (select auth.uid()));
create policy access_codes_update on public.access_codes for update to authenticated
  using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));

drop policy access_code_grants_select on public.access_code_grants;
create policy access_code_grants_select on public.access_code_grants for select to authenticated
  using (public.is_code_project_admin(access_code_id, project_id));
create policy access_code_grants_insert on public.access_code_grants for insert to authenticated
  with check (public.is_code_project_admin(access_code_id, project_id));
create policy access_code_grants_update on public.access_code_grants for update to authenticated
  using (public.is_code_project_admin(access_code_id, project_id))
  with check (public.is_code_project_admin(access_code_id, project_id));
create policy access_code_grants_delete on public.access_code_grants for delete to authenticated
  using (public.is_code_project_admin(access_code_id, project_id));

-- Column grants prevent tenant reassignment and prevent clients from writing file_path.
revoke insert, update, delete on public.organizations, public.projects, public.documents,
  public.access_codes, public.access_logs from public, anon, authenticated;
grant insert (name, logo_url, brand_colors) on public.organizations to authenticated;
grant update (name, logo_url, brand_colors, archived_at) on public.organizations to authenticated;
grant insert (organization_id, name, slug, location, description, cover_image_url, status, is_public)
  on public.projects to authenticated;
grant update (name, slug, location, description, cover_image_url, status, is_public, archived_at)
  on public.projects to authenticated;
grant insert (id, project_id, segment_id, title, doc_number, doc_type, revision, status,
  issue_date, description, file_size, upload_status) on public.documents to authenticated;
grant update (title, doc_number, doc_type, revision, status, issue_date, description,
  file_size, upload_status, archived_at) on public.documents to authenticated;
grant insert (organization_id, code_hash, label, created_by, expires_at, max_uses,
  is_active, allow_download) on public.access_codes to authenticated;
grant update (label, expires_at, max_uses, is_active, allow_download)
  on public.access_codes to authenticated;

revoke update on public.profiles from public, anon, authenticated;
grant update (organization_id, role, full_name) on public.profiles to authenticated;

revoke execute on function public.is_super_admin() from public, anon;
revoke execute on function public.is_org_admin(uuid) from public, anon;
revoke execute on function public.is_project_admin(uuid) from public, anon;
revoke execute on function public.has_doc_access(uuid, uuid) from public, anon;
revoke execute on function public.has_project_access(uuid) from public, anon;
revoke execute on function public.is_active_organization(uuid) from public, anon;
revoke execute on function public.is_active_project(uuid) from public, anon;
revoke execute on function public.is_code_project_admin(uuid, uuid) from public, anon;
grant execute on function public.is_active_organization(uuid) to authenticated;
grant execute on function public.is_active_project(uuid) to authenticated;
grant execute on function public.is_code_project_admin(uuid, uuid) to authenticated;
revoke execute on function public.fill_access_log_snapshot() from public, anon, authenticated;
revoke execute on function public.stamp_archive() from public, anon, authenticated;
revoke execute on function public.set_document_path() from public, anon, authenticated;
revoke execute on function public.prevent_tenant_reassignment() from public, anon, authenticated;

create index organizations_archived_at_idx on public.organizations(archived_at);
create index projects_organization_archived_idx on public.projects(organization_id, archived_at);
create index documents_archived_at_idx on public.documents(archived_at) where archived_at is not null;
