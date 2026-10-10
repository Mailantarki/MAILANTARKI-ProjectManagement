-- SPEC-ui-ux Fase 6: admin bulk actions and the activity feed.

-- Bulk edit of documents. Only status, featured and archived can change; anything else is refused.
-- Security invoker: the caller's RLS decides which rows may change, and if any requested row cannot
-- be changed nothing is changed. Returns the previous values so the admin can undo.
create function public.bulk_update_documents(p_ids uuid[], p_patch jsonb)
returns table(id uuid, status public.document_status, is_featured boolean, archived boolean, was_current boolean)
language plpgsql security invoker set search_path = public as $$
#variable_conflict use_column
declare
  v_expected int := (select count(distinct x) from unnest(p_ids) x);
  v_changed int;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb
    or exists (select 1 from jsonb_object_keys(p_patch) k where k not in ('status', 'is_featured', 'archived'))
    or (p_patch ? 'is_featured' and jsonb_typeof(p_patch->'is_featured') <> 'boolean')
    or (p_patch ? 'archived' and jsonb_typeof(p_patch->'archived') <> 'boolean') then
    raise exception 'invalid_patch' using errcode = '22023';
  end if;
  if v_expected = 0 or v_expected > 500 then raise exception 'invalid_ids' using errcode = '22023'; end if;

  return query
    with before as (
      select d.id, d.status, d.is_featured, d.archived_at is not null as archived, d.is_current as was_current
      from public.documents d where d.id = any(p_ids) and d.upload_status = 'ready'
      for update
    ), changed as (
      update public.documents d set
        status = coalesce((p_patch->>'status')::public.document_status, d.status),
        is_featured = coalesce((p_patch->>'is_featured')::boolean, d.is_featured),
        archived_at = case when not (p_patch ? 'archived') then d.archived_at
          when (p_patch->>'archived')::boolean then coalesce(d.archived_at, now()) else null end
      from before b where d.id = b.id
      returning d.id
    )
    select b.id, b.status, b.is_featured, b.archived, b.was_current from before b join changed c on c.id = b.id;
  get diagnostics v_changed = row_count;
  -- Every requested row must have changed (RLS hides or protects the others): all or nothing.
  if v_changed <> v_expected then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function public.bulk_update_documents(uuid[], jsonb) from public, anon;
grant execute on function public.bulk_update_documents(uuid[], jsonb) to authenticated;

-- One feed for the admin overview: portal access, document changes and admin actions, with names.
-- security_invoker: every underlying table's RLS applies to the caller.
create view public.activity_feed with (security_invoker = true) as
  select l.id, l.created_at, 'access'::text as source, l.action::text as action,
    coalesce(p.full_name, c.label) as actor_name, l.user_id as actor_id, l.access_code_id,
    l.project_id, l.project_name, l.document_title, l.doc_number, null::text as detail
  from public.access_logs l
  left join public.profiles p on p.id = l.user_id
  left join public.access_codes c on c.id = l.access_code_id
  union all
  select e.id, e.created_at, 'document', e.kind, p.full_name, e.actor_id, null,
    e.project_id, pr.name, d.title, d.doc_number,
    case when e.kind = 'status_changed' then e.from_value || ' → ' || e.to_value else e.to_value end
  from public.document_events e
  join public.documents d on d.id = e.document_id
  left join public.projects pr on pr.id = e.project_id
  left join public.profiles p on p.id = e.actor_id
  union all
  select a.id, a.created_at, 'admin', a.action, p.full_name, a.actor_id, null,
    (a.details->>'project_id')::uuid, pr.name, null, a.details->>'doc_number', t.full_name
  from public.admin_events a
  left join public.profiles p on p.id = a.actor_id
  left join public.profiles t on t.id = a.target_user_id
  left join public.projects pr on pr.id = (a.details->>'project_id')::uuid;

revoke all on public.activity_feed from public, anon, authenticated;
grant select on public.activity_feed to authenticated;
