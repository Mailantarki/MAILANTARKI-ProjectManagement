-- Only ready, active documents reserve a document number and revision.
alter table public.documents drop constraint if exists documents_project_id_segment_id_doc_number_revision_key;
create unique index documents_ready_unique on public.documents
  (project_id, segment_id, doc_number, revision)
  where upload_status = 'ready' and archived_at is null;

create or replace function public.finalize_document_upload(p_document_id uuid, p_file_size bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_file_path text;
  v_storage_size bigint;
begin
  if p_file_size is null or p_file_size < 5 or p_file_size > 52428800 then
    raise exception 'invalid_file_size';
  end if;

  select d.upload_status, d.file_path into v_status, v_file_path
    from public.documents d where d.id = p_document_id for update;
  if v_file_path is null then raise exception 'document_not_found'; end if;
  if v_status <> 'pending' then raise exception 'invalid_status_transition'; end if;

  select (o.metadata->>'size')::bigint into v_storage_size
    from storage.objects o where o.bucket_id = 'documents' and o.name = v_file_path;
  if v_storage_size is null then raise exception 'storage_object_missing'; end if;
  if v_storage_size <> p_file_size then raise exception 'file_size_mismatch'; end if;

  update public.documents set upload_status = 'ready', file_size = p_file_size
    where id = p_document_id;
end;
$$;
revoke execute on function public.finalize_document_upload(uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.finalize_document_upload(uuid, bigint) to service_role;

-- Pending metadata is deleted only by authorized project admins; Storage cleanup stays server-only.
create policy documents_delete_pending on public.documents for delete to authenticated
  using (upload_status = 'pending' and public.is_project_admin(project_id));
grant delete on public.documents to authenticated;
