-- Current revision ("current set") per drawing number: one current revision per
-- (project, discipline, document number). The database keeps it consistent on every
-- path that makes a document visible or hides it (finalize, direct service inserts,
-- archive, restore, metadata edits), so the app never has to remember to.

-- 1. Members never saw their own organization: in `pr.organization_id = id` the bare `id`
--    resolves to the profiles alias (pr.id), not organizations.id.
drop policy organizations_select on public.organizations;
create policy organizations_select on public.organizations for select to authenticated
  using (public.is_org_admin(id) or (archived_at is null and exists (
    select 1 from public.profiles pr
    where pr.id = (select auth.uid()) and pr.organization_id = organizations.id
  )));

-- 2. Columns. Clients may read them; only the functions below write them.
alter table public.documents
  add column is_current boolean not null default false,
  add column superseded_at timestamptz,
  add column superseded_by uuid references public.documents(id) on delete set null;
grant select (is_current, superseded_at, superseded_by) on public.documents to authenticated;

-- 3. Revision order. Letters and numbers are compared as separate tokens:
--    0 < 1 < 2 < 10 < A < B < Z < AA, P01 < P02, C < C1. Case, spaces and a leading
--    "Rev" are ignored ("Rev B" = "B").
--    src/lib/documents/revision.ts implements the same key; both share test cases.
create function public.revision_sort_key(p_revision text)
returns text language sql immutable parallel safe set search_path = '' as $$
  select coalesce(string_agg(
    case when m.token[1] ~ '^[0-9]+$'
      then '1' || lpad(coalesce(nullif(ltrim(m.token[1], '0'), ''), '0'),
        greatest(12, length(ltrim(m.token[1], '0'))), '0')
      else '2' || lpad(length(m.token[1])::text, 3, '0') || m.token[1]
    end, '.' order by m.n), '')
  from regexp_matches(regexp_replace(upper(coalesce(p_revision, '')), '^\s*REV(ISION)?\M[\s._-]*', ''),
    '[0-9]+|[A-Z]+', 'g') with ordinality as m(token, n);
$$;
grant execute on function public.revision_sort_key(text) to authenticated, service_role;

create index documents_revision_group_idx on public.documents (project_id, segment_id, doc_number)
  where upload_status = 'ready' and archived_at is null;
create unique index documents_one_current_idx on public.documents (project_id, segment_id, doc_number)
  where is_current and upload_status = 'ready' and archived_at is null;

-- 4. Internal helpers (not callable by clients).
create function public.lock_revision_group(p_project uuid, p_segment uuid, p_doc_number text)
returns void language sql volatile set search_path = public as $$
  select pg_advisory_xact_lock(hashtextextended(p_project::text || '/' || p_segment::text || '/' || p_doc_number, 7));
$$;

-- Highest revision first; ties go to the latest issue date, then the latest upload.
create function public.best_revision(p_project uuid, p_segment uuid, p_doc_number text)
returns uuid language sql stable set search_path = public as $$
  select d.id from public.documents d
  where d.project_id = p_project and d.segment_id = p_segment and d.doc_number = p_doc_number
    and d.upload_status = 'ready' and d.archived_at is null
  order by public.revision_sort_key(d.revision) collate "C" desc, d.issue_date desc nulls last,
    d.created_at desc, d.id desc
  limit 1;
$$;

create function public.revision_outranks(p_candidate uuid, p_current uuid)
returns boolean language sql stable set search_path = public as $$
  select coalesce((select d.id = p_candidate from public.documents d where d.id in (p_candidate, p_current)
    order by public.revision_sort_key(d.revision) collate "C" desc, d.issue_date desc nulls last,
      d.created_at desc, d.id desc
    limit 1), false);
$$;

-- Makes p_current the only current revision of its number; every other visible revision
-- points to it as superseded. Demotes first: the unique index allows one current at a time.
create function public.set_current_revision(p_project uuid, p_segment uuid, p_doc_number text, p_current uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  update public.documents d set
      is_current = false,
      superseded_by = p_current,
      superseded_at = case when d.is_current then now() else coalesce(d.superseded_at, now()) end
    where d.project_id = p_project and d.segment_id = p_segment and d.doc_number = p_doc_number
      and d.upload_status = 'ready' and d.archived_at is null
      and d.id is distinct from p_current
      and (d.is_current or d.superseded_by is distinct from p_current or d.superseded_at is null);
  if p_current is not null then
    update public.documents d set is_current = true, superseded_at = null, superseded_by = null
      where d.id = p_current and not d.is_current;
  end if;
end;
$$;

revoke execute on function public.lock_revision_group(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.best_revision(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.revision_outranks(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.set_current_revision(uuid, uuid, text, uuid) from public, anon, authenticated;

-- 5. Triggers. BEFORE clears the flag on rows that leave a group (archive, move, edit) so
--    the unique index never sees two current rows; AFTER places the row in its group.
create function public.documents_revision_before()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.is_current := false;
    new.superseded_at := null;
    new.superseded_by := null;
  elsif new.upload_status <> 'ready' or new.archived_at is not null
     or (new.project_id, new.segment_id, new.doc_number) is distinct from (old.project_id, old.segment_id, old.doc_number) then
    new.is_current := false;
  end if;
  return new;
end;
$$;

create function public.documents_revision_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  was_active boolean := tg_op = 'UPDATE' and old.upload_status = 'ready' and old.archived_at is null;
  is_active boolean := new.upload_status = 'ready' and new.archived_at is null;
  moved boolean := tg_op = 'UPDATE'
    and (new.project_id, new.segment_id, new.doc_number) is distinct from (old.project_id, old.segment_id, old.doc_number);
  current_id uuid;
begin
  -- Leaving a group (archived or renumbered): if this was its current revision, promote the best one left.
  if was_active and old.is_current and (moved or not is_active) then
    perform public.lock_revision_group(old.project_id, old.segment_id, old.doc_number);
    perform public.set_current_revision(old.project_id, old.segment_id, old.doc_number,
      public.best_revision(old.project_id, old.segment_id, old.doc_number));
  end if;
  if not is_active then return null; end if;
  if was_active and not moved and new.revision is not distinct from old.revision then return null; end if;

  perform public.lock_revision_group(new.project_id, new.segment_id, new.doc_number);
  select d.id into current_id from public.documents d
    where d.project_id = new.project_id and d.segment_id = new.segment_id and d.doc_number = new.doc_number
      and d.is_current and d.upload_status = 'ready' and d.archived_at is null;

  if current_id = new.id then
    return null;  -- revision edit on the current one: an explicit choice stays
  elsif current_id is null then
    current_id := public.best_revision(new.project_id, new.segment_id, new.doc_number);
  elsif tg_op = 'UPDATE' and old.archived_at is not null and not moved then
    null;  -- restored: stays in the history; "Make current" brings it back explicitly
  elsif public.revision_outranks(new.id, current_id) then
    current_id := new.id;  -- new upload (or renumbered row) with a higher revision
  end if;
  perform public.set_current_revision(new.project_id, new.segment_id, new.doc_number, current_id);
  return null;
end;
$$;

revoke execute on function public.documents_revision_before() from public, anon, authenticated;
revoke execute on function public.documents_revision_after() from public, anon, authenticated;

create trigger documents_revision_before
  before insert or update of upload_status, archived_at, doc_number, revision, project_id, segment_id
  on public.documents for each row execute function public.documents_revision_before();
create trigger documents_revision_after
  after insert or update of upload_status, archived_at, doc_number, revision, project_id, segment_id
  on public.documents for each row execute function public.documents_revision_after();

-- 6. Explicit choice from the admin ("Make current").
alter table public.admin_events drop constraint admin_events_action_check;
alter table public.admin_events add constraint admin_events_action_check check (action in (
  'user_created', 'user_suspended', 'user_reactivated', 'access_assigned', 'access_removed',
  'password_changed', 'document_made_current'));

create function public.make_document_current(p_document_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  d public.documents%rowtype;
  previous_id uuid;
begin
  select * into d from public.documents where id = p_document_id;
  if d.id is null or not public.account_ready() or not public.is_project_admin(d.project_id) then
    raise exception 'document_not_found' using errcode = 'P0002';
  end if;
  if d.upload_status <> 'ready' or d.archived_at is not null then
    raise exception 'document_not_active';
  end if;
  perform public.lock_revision_group(d.project_id, d.segment_id, d.doc_number);
  select x.id into previous_id from public.documents x
    where x.project_id = d.project_id and x.segment_id = d.segment_id and x.doc_number = d.doc_number
      and x.is_current and x.upload_status = 'ready' and x.archived_at is null;
  if previous_id = d.id then return; end if;
  perform public.set_current_revision(d.project_id, d.segment_id, d.doc_number, d.id);
  insert into public.admin_events (organization_id, actor_id, action, details)
    select p.organization_id, auth.uid(), 'document_made_current', jsonb_build_object(
      'project_id', d.project_id, 'segment_id', d.segment_id, 'document_id', d.id,
      'doc_number', d.doc_number, 'revision', d.revision, 'previous_id', previous_id)
    from public.projects p where p.id = d.project_id;
end;
$$;
revoke execute on function public.make_document_current(uuid) from public, anon;
grant execute on function public.make_document_current(uuid) to authenticated, service_role;

-- 7. Counts show the current set only.
create or replace function public.document_counts(p_project_ids uuid[] default null, p_project_slug text default null)
returns table (project_id uuid, segment_id uuid, count bigint)
language sql stable security definer set search_path = public as $$
  select d.project_id, d.segment_id, count(*)
  from public.documents d
  where d.upload_status = 'ready'
    and d.archived_at is null
    and d.is_current
    and (p_project_ids is null or d.project_id = any(p_project_ids))
    and (p_project_slug is null or d.project_id = (select p.id from public.projects p where p.slug = p_project_slug))
  group by d.project_id, d.segment_id;
$$;
revoke execute on function public.document_counts(uuid[], text) from public, anon, authenticated;
grant execute on function public.document_counts(uuid[], text) to service_role;

-- 8. Backfill: same rule as new uploads. Preview first with scripts/preview-current-set.ts.
do $$
declare g record;
begin
  for g in select distinct d.project_id, d.segment_id, d.doc_number from public.documents d
    where d.upload_status = 'ready' and d.archived_at is null loop
    perform public.set_current_revision(g.project_id, g.segment_id, g.doc_number,
      public.best_revision(g.project_id, g.segment_id, g.doc_number));
  end loop;
end;
$$;
-- "Superseded on" for existing history: when the current revision was issued (or uploaded).
update public.documents d set superseded_at = coalesce(c.issue_date::timestamptz, c.created_at)
  from public.documents c where d.superseded_by = c.id;

-- 9. Access logs remember which revision was opened and whether it was already superseded,
--    so "views of superseded revisions" can be measured (SPEC-ui-ux §7).
alter table public.access_logs
  add column document_revision text,
  add column document_superseded boolean;
create or replace function public.fill_access_log_snapshot()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.document_id is not null then
    select d.title, d.doc_number, d.revision, not d.is_current, p.name
      into new.document_title, new.doc_number, new.document_revision, new.document_superseded, new.project_name
    from public.documents d join public.projects p on p.id = d.project_id
    where d.id = new.document_id;
  elsif new.project_id is not null then
    select p.name into new.project_name from public.projects p where p.id = new.project_id;
  end if;
  return new;
end;
$$;
