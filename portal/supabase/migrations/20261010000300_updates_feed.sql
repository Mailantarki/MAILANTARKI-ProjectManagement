-- SPEC-ui-ux Fase 5: what changed since the last visit, and who to email when documents are published.
--
--   document_events      one row per publish / new revision / status change / archive / make current.
--                        Written only by triggers; readers see the events of documents they can read.
--   user_project_visits  when each user last opened each project (the "since" of the updates feed).
--   project_watchers     opt-out of publish emails per project (no row = watching).

create table public.document_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  segment_id uuid not null references public.segments(id),
  kind text not null check (kind in ('published', 'revised', 'status_changed', 'archived', 'made_current')),
  from_value text,
  to_value text,
  actor_id uuid references public.profiles(id) on delete set null,
  -- Set by the server when one email went out for a publish batch.
  batch_id uuid,
  created_at timestamptz not null default now()
);
create index document_events_project_created_idx on public.document_events(project_id, created_at desc);
create index document_events_document_idx on public.document_events(document_id);

alter table public.document_events enable row level security;
-- An event is visible exactly when its document is (documents RLS applies inside the subquery).
create policy document_events_select on public.document_events for select to authenticated
  using (exists (select 1 from public.documents d where d.id = document_events.document_id));
revoke all on public.document_events from public, anon, authenticated;
grant select on public.document_events to authenticated;
grant select, update (batch_id) on public.document_events to service_role;

create table public.user_project_visits (
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  -- Updates are counted from previous_seen_at, so they stay visible for the whole visit.
  previous_seen_at timestamptz,
  last_seen_at timestamptz not null default now(),
  primary key (user_id, project_id)
);
alter table public.user_project_visits enable row level security;
create policy user_project_visits_own on public.user_project_visits for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.user_project_visits from public, anon, authenticated;
grant select, insert, update on public.user_project_visits to authenticated;

create table public.project_watchers (
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, project_id)
);
alter table public.project_watchers enable row level security;
create policy project_watchers_own on public.project_watchers for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.project_watchers from public, anon, authenticated;
grant select, insert, update on public.project_watchers to authenticated;

-- Defence in depth on every new table (AGENTS.md).
revoke truncate, references, trigger, maintain on public.document_events, public.user_project_visits, public.project_watchers
  from public, anon, authenticated;

-- Event writers --------------------------------------------------------------------------------------

create function public.record_document_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := (select auth.uid());
  v_kind text;
begin
  if tg_op = 'INSERT' then
    if new.upload_status <> 'ready' then return null; end if;
  elsif new.upload_status = 'ready' and old.upload_status <> 'ready' then
    null; -- finalize: published or revised below
  else
    if new.upload_status <> 'ready' then return null; end if;
    if new.archived_at is not null and old.archived_at is null then
      insert into public.document_events(document_id, project_id, segment_id, kind, from_value, to_value, actor_id)
        values (new.id, new.project_id, new.segment_id, 'archived', old.revision, null, v_actor);
    end if;
    if new.status is distinct from old.status and new.archived_at is null then
      insert into public.document_events(document_id, project_id, segment_id, kind, from_value, to_value, actor_id)
        values (new.id, new.project_id, new.segment_id, 'status_changed', old.status::text, new.status::text, v_actor);
    end if;
    return null;
  end if;

  v_kind := case when exists (
    select 1 from public.documents d
    where d.project_id = new.project_id and d.segment_id = new.segment_id and d.doc_number = new.doc_number
      and d.id <> new.id and d.upload_status = 'ready'
  ) then 'revised' else 'published' end;
  insert into public.document_events(document_id, project_id, segment_id, kind, from_value, to_value, actor_id)
    values (new.id, new.project_id, new.segment_id, v_kind, null, new.revision, v_actor);
  return null;
end;
$$;
revoke execute on function public.record_document_event() from public, anon, authenticated;

create trigger documents_record_event
  after insert or update of upload_status, status, archived_at on public.documents
  for each row execute function public.record_document_event();

-- "Make current" is audited in admin_events; mirror it as a document event.
create function public.record_made_current_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_doc public.documents;
begin
  if new.action <> 'document_made_current' then return null; end if;
  select * into v_doc from public.documents where id = (new.details->>'document_id')::uuid;
  if v_doc.id is null then return null; end if;
  insert into public.document_events(document_id, project_id, segment_id, kind, from_value, to_value, actor_id)
    values (v_doc.id, v_doc.project_id, v_doc.segment_id, 'made_current', null, v_doc.revision, new.actor_id);
  return null;
end;
$$;
revoke execute on function public.record_made_current_event() from public, anon, authenticated;

create trigger admin_events_made_current
  after insert on public.admin_events
  for each row execute function public.record_made_current_event();

-- Visits ----------------------------------------------------------------------------------------------

-- Records a visit. A visit that starts more than 30 minutes after the last one moves the "since"
-- forward; reloads and filter changes within a visit keep the same updates on screen.
create function public.record_project_visit(p_project_id uuid, p_mark_seen boolean default false)
returns void language sql security invoker set search_path = public as $$
  insert into public.user_project_visits as v(user_id, project_id, previous_seen_at, last_seen_at)
    values ((select auth.uid()), p_project_id, case when p_mark_seen then now() end, now())
  on conflict (user_id, project_id) do update set
    previous_seen_at = case
      when p_mark_seen then now()
      when v.last_seen_at < now() - interval '30 minutes' then v.last_seen_at
      else v.previous_seen_at end,
    last_seen_at = now();
$$;
revoke execute on function public.record_project_visit(uuid, boolean) from public, anon;
grant execute on function public.record_project_visit(uuid, boolean) to authenticated;
