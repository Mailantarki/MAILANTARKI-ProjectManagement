create table public.auth_attempts (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('login', 'code')),
  ip inet not null,
  created_at timestamptz not null default now()
);
create index auth_attempts_recent_idx on public.auth_attempts(kind, ip, created_at desc);
create index auth_attempts_created_idx on public.auth_attempts(created_at);
alter table public.auth_attempts enable row level security;
revoke all on public.auth_attempts from public, anon, authenticated;
revoke truncate, trigger, references, maintain on public.auth_attempts from public, anon, authenticated;

create function public.auth_attempt_allowed(p_kind text, p_ip inet)
returns boolean language sql security definer set search_path = public as $$
  select p_kind in ('login', 'code') and
    (select count(*) from public.auth_attempts
      where kind = p_kind and ip = p_ip and created_at > now() - interval '15 minutes') < 5 and
    (p_kind <> 'code' or
      (select count(*) from public.auth_attempts
        where kind = 'code' and created_at > now() - interval '15 minutes') < 500);
$$;
revoke execute on function public.auth_attempt_allowed(text, inet) from public, anon, authenticated;
grant execute on function public.auth_attempt_allowed(text, inet) to service_role;

create function public.redeem_access_code(p_hash text)
returns table (id uuid, organization_id uuid, expires_at timestamptz, label text)
language sql security definer set search_path = public as $$
  update public.access_codes
     set uses_count = uses_count + 1
   where code_hash = p_hash
     and is_active
     and (expires_at is null or expires_at > now())
     and (max_uses is null or uses_count < max_uses)
  returning id, organization_id, expires_at, label;
$$;
revoke execute on function public.redeem_access_code(text) from public, anon, authenticated;
grant execute on function public.redeem_access_code(text) to service_role;

create function public.create_access_code(
  p_organization uuid, p_hash text, p_label text, p_expires_at timestamptz,
  p_max_uses integer, p_allow_download boolean, p_project_ids uuid[]
) returns uuid language plpgsql security invoker set search_path = public as $$
declare v_id uuid;
begin
  if array_length(p_project_ids, 1) is null then raise exception 'At least one project is required'; end if;
  insert into public.access_codes(organization_id, code_hash, label, created_by,
    expires_at, max_uses, allow_download)
  values (p_organization, p_hash, p_label, auth.uid(), p_expires_at, p_max_uses, p_allow_download)
  returning id into v_id;
  insert into public.access_code_grants(access_code_id, project_id)
    select v_id, distinct_ids.id from (select distinct unnest(p_project_ids) as id) distinct_ids;
  return v_id;
end;
$$;
revoke execute on function public.create_access_code(uuid,text,text,timestamptz,integer,boolean,uuid[])
  from public, anon;
grant execute on function public.create_access_code(uuid,text,text,timestamptz,integer,boolean,uuid[])
  to authenticated;
