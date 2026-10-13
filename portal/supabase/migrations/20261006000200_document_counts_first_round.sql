-- Let the portal fetch counts in the same round-trip as the project list, before the
-- project IDs are known: no filter = every project; p_project_slug = one project.
-- Server-only (service role). The app shows counts only for project/segment pairs it has
-- already authorized for the current principal.
drop function if exists public.document_counts(uuid[]);

create function public.document_counts(p_project_ids uuid[] default null, p_project_slug text default null)
returns table (project_id uuid, segment_id uuid, count bigint)
language sql stable security definer set search_path = public as $$
  select d.project_id, d.segment_id, count(*)
  from public.documents d
  where d.upload_status = 'ready'
    and d.archived_at is null
    and (p_project_ids is null or d.project_id = any(p_project_ids))
    and (p_project_slug is null or d.project_id = (select p.id from public.projects p where p.slug = p_project_slug))
  group by d.project_id, d.segment_id;
$$;

revoke execute on function public.document_counts(uuid[], text) from public, anon, authenticated;
grant execute on function public.document_counts(uuid[], text) to service_role;
