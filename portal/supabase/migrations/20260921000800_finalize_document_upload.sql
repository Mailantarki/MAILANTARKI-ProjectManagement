-- Authenticated clients may edit metadata, but cannot change upload_status directly.
create function public.current_document_upload_status(p_document_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select d.upload_status from public.documents d
  where d.id = p_document_id and public.is_project_admin(d.project_id);
$$;
revoke execute on function public.current_document_upload_status(uuid) from public, anon;
grant execute on function public.current_document_upload_status(uuid) to authenticated;

drop policy if exists documents_update on public.documents;
create policy documents_update on public.documents for update to authenticated
  using (public.is_project_admin(project_id))
  with check (
    public.is_project_admin(project_id)
    and upload_status = public.current_document_upload_status(id)
  );

revoke update (upload_status) on public.documents from authenticated;

create function public.finalize_document_upload(p_document_id uuid, p_file_size bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_project_id uuid;
  v_status text;
begin
  if p_file_size is null or p_file_size < 5 or p_file_size > 52428800 then
    raise exception 'invalid_file_size';
  end if;

  select d.project_id, d.upload_status into v_project_id, v_status
    from public.documents d where d.id = p_document_id for update;
  if v_project_id is null then raise exception 'document_not_found'; end if;
  if not public.is_project_admin(v_project_id) then raise exception 'forbidden'; end if;
  if v_status <> 'pending' then raise exception 'invalid_status_transition'; end if;

  update public.documents set upload_status = 'ready', file_size = p_file_size
    where id = p_document_id;
end;
$$;
revoke execute on function public.finalize_document_upload(uuid, bigint) from public, anon;
grant execute on function public.finalize_document_upload(uuid, bigint) to authenticated;
