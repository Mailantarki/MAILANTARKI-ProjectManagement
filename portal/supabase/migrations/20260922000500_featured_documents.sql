alter table public.documents
  add column is_featured boolean not null default false;

create index documents_project_featured_issue_idx
  on public.documents(project_id, segment_id, is_featured desc, issue_date desc)
  where upload_status = 'ready' and archived_at is null;

grant select (is_featured) on public.documents to authenticated;
grant update (is_featured) on public.documents to authenticated;
