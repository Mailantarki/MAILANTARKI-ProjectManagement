-- Per-(project, segment) counts of visible documents in a single grouped query.
-- Server-only: callers must pass project IDs already authorized for the principal.
-- Uses documents_project_featured_issue_idx (partial on ready, non-archived rows).
create function public.document_counts(p_project_ids uuid[])
returns table (project_id uuid, segment_id uuid, count bigint)
language sql stable security definer set search_path = public as $$
  select d.project_id, d.segment_id, count(*)
  from public.documents d
  where d.project_id = any(p_project_ids)
    and d.upload_status = 'ready'
    and d.archived_at is null
  group by d.project_id, d.segment_id;
$$;

revoke execute on function public.document_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.document_counts(uuid[]) to service_role;
