create extension if not exists pgcrypto with schema extensions;

create type public.profile_role as enum ('super_admin', 'org_admin', 'member');
create type public.document_type as enum ('plan', 'section', 'elevation', 'detail', 'specification', 'schedule', 'report', 'other');
create type public.document_status as enum ('draft', 'for_review', 'issued_for_construction', 'as_built');
create type public.access_action as enum ('login', 'code_redeem', 'view', 'download');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  logo_url text,
  brand_colors jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.segments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique check (slug in ('architecture-structure', 'mep', 'landscaping', 'interior-design'))
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  slug text not null unique,
  location text,
  description text,
  cover_image_url text,
  status text not null default 'active' check (status in ('active', 'archived')),
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id),
  role public.profile_role not null default 'member',
  full_name text not null,
  created_at timestamptz not null default now(),
  constraint profile_org_required check (role = 'super_admin' or organization_id is not null)
);

create table public.user_project_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  segment_id uuid references public.segments(id),
  can_download boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index user_project_access_unique on public.user_project_access
  (user_id, project_id, coalesce(segment_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  segment_id uuid not null references public.segments(id),
  title text not null,
  doc_number text not null,
  doc_type public.document_type not null,
  revision text not null default '0',
  status public.document_status not null default 'draft',
  issue_date date,
  description text,
  file_path text not null unique,
  file_size bigint not null check (file_size > 0 and file_size <= 52428800),
  upload_status text not null default 'pending' check (upload_status in ('pending', 'ready')),
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (project_id, segment_id, doc_number, revision)
);

create table public.access_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  label text not null,
  created_by uuid references public.profiles(id),
  expires_at timestamptz,
  max_uses integer check (max_uses is null or max_uses > 0),
  uses_count integer not null default 0 check (uses_count >= 0),
  is_active boolean not null default true,
  allow_download boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.access_code_grants (
  id uuid primary key default gen_random_uuid(),
  access_code_id uuid not null references public.access_codes(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  segment_id uuid references public.segments(id)
);
create unique index access_code_grants_unique on public.access_code_grants
  (access_code_id, project_id, coalesce(segment_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table public.access_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  user_id uuid references public.profiles(id),
  access_code_id uuid references public.access_codes(id),
  project_id uuid references public.projects(id),
  document_id uuid references public.documents(id),
  action public.access_action not null,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint access_log_actor check (user_id is not null or access_code_id is not null)
);

create index projects_organization_id_idx on public.projects(organization_id);
create index profiles_organization_id_idx on public.profiles(organization_id);
create index user_project_access_user_project_idx on public.user_project_access(user_id, project_id, segment_id);
create index user_project_access_project_id_idx on public.user_project_access(project_id);
create index documents_project_segment_idx on public.documents(project_id, segment_id);
create index documents_filter_idx on public.documents(doc_type, status, revision, issue_date);
create index access_codes_organization_id_idx on public.access_codes(organization_id);
create index access_code_grants_code_idx on public.access_code_grants(access_code_id, project_id, segment_id);
create index access_code_grants_project_id_idx on public.access_code_grants(project_id);
create index access_logs_organization_created_idx on public.access_logs(organization_id, created_at desc);
create index access_logs_user_id_idx on public.access_logs(user_id);
create index access_logs_code_id_idx on public.access_logs(access_code_id);
create index access_logs_project_id_idx on public.access_logs(project_id);
create index access_logs_document_id_idx on public.access_logs(document_id);

create function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'super_admin');
$$;

create function public.is_org_admin(p_organization uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'org_admin' and organization_id = p_organization
  );
$$;

create function public.is_project_admin(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects p where p.id = p_project and public.is_org_admin(p.organization_id)
  );
$$;

create function public.has_doc_access(p_project uuid, p_segment uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_project_admin(p_project) or exists (
    select 1 from public.user_project_access a
    join public.profiles pr on pr.id = a.user_id
    join public.projects p on p.id = a.project_id
    where a.user_id = (select auth.uid()) and a.project_id = p_project
      and pr.organization_id = p.organization_id
      and (a.segment_id is null or a.segment_id = p_segment)
  );
$$;

create function public.has_project_access(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_project_admin(p_project) or exists (
    select 1 from public.user_project_access a
    join public.profiles pr on pr.id = a.user_id
    join public.projects p on p.id = a.project_id
    where a.user_id = (select auth.uid()) and a.project_id = p_project
      and pr.organization_id = p.organization_id
  );
$$;

-- Reject tenant mismatches even when a privileged server writes with the service role.
create function public.check_grant_organization()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'user_project_access' then
    if not exists (
      select 1 from public.profiles pr join public.projects p on p.organization_id = pr.organization_id
      where pr.id = new.user_id and p.id = new.project_id
    ) then raise exception 'User and project organization mismatch'; end if;
  elsif tg_table_name = 'access_code_grants' then
    if not exists (
      select 1 from public.access_codes c join public.projects p on p.organization_id = c.organization_id
      where c.id = new.access_code_id and p.id = new.project_id
    ) then raise exception 'Code and project organization mismatch'; end if;
  end if;
  return new;
end;
$$;
create trigger user_project_access_org_check before insert or update on public.user_project_access
  for each row execute function public.check_grant_organization();
create trigger access_code_grants_org_check before insert or update on public.access_code_grants
  for each row execute function public.check_grant_organization();

alter table public.organizations enable row level security;
alter table public.segments enable row level security;
alter table public.projects enable row level security;
alter table public.profiles enable row level security;
alter table public.user_project_access enable row level security;
alter table public.documents enable row level security;
alter table public.access_codes enable row level security;
alter table public.access_code_grants enable row level security;
alter table public.access_logs enable row level security;

create policy organizations_select on public.organizations for select to authenticated
  using (public.is_org_admin(id) or exists (
    select 1 from public.profiles pr where pr.id = (select auth.uid()) and pr.organization_id = id
  ));
create policy segments_select on public.segments for select to authenticated
  using (exists (select 1 from public.profiles pr where pr.id = (select auth.uid())));
create policy projects_select on public.projects for select to authenticated
  using (public.has_project_access(id));
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_org_admin(organization_id));
create policy user_project_access_select on public.user_project_access for select to authenticated
  using (user_id = (select auth.uid()) or public.is_project_admin(project_id));
create policy documents_select on public.documents for select to authenticated
  using (upload_status = 'ready' and public.has_doc_access(project_id, segment_id));
create policy access_codes_select on public.access_codes for select to authenticated
  using (public.is_org_admin(organization_id));
create policy access_code_grants_select on public.access_code_grants for select to authenticated
  using (public.is_project_admin(project_id) and exists (
    select 1 from public.access_codes c where c.id = access_code_id and c.organization_id =
      (select p.organization_id from public.projects p where p.id = project_id)
  ));
create policy access_logs_select on public.access_logs for select to authenticated
  using (public.is_super_admin() or (organization_id is not null and public.is_org_admin(organization_id)));

-- Authenticated clients can list document metadata, but cannot select private object paths.
revoke select on public.documents from public, anon, authenticated;
grant select (id, project_id, segment_id, title, doc_number, doc_type, revision, status,
  issue_date, description, file_size, upload_status, uploaded_by, created_at)
  on public.documents to authenticated;
revoke select on public.access_codes from public, anon, authenticated;
grant select (id, organization_id, label, created_by, expires_at, max_uses, uses_count,
  is_active, allow_download, created_at) on public.access_codes to authenticated;

revoke execute on function public.check_grant_organization() from public, anon, authenticated;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;
grant execute on function public.is_project_admin(uuid) to authenticated;
grant execute on function public.has_doc_access(uuid, uuid) to authenticated;
grant execute on function public.has_project_access(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 52428800, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 52428800,
  allowed_mime_types = array['application/pdf'];
-- No storage.objects policies: only the server service role can upload and sign private files.
