-- Create a code and its segment-scoped grants in one RLS-protected transaction.
create function public.create_access_code_with_grants(
  p_organization uuid, p_hash text, p_label text, p_expires_at timestamptz,
  p_max_uses integer, p_allow_download boolean, p_grants jsonb
) returns uuid language plpgsql security invoker set search_path = public as $$
declare v_id uuid;
begin
  if jsonb_typeof(p_grants) <> 'array' or jsonb_array_length(p_grants) = 0 then
    raise exception 'At least one grant is required';
  end if;
  insert into public.access_codes(organization_id,code_hash,label,created_by,
    expires_at,max_uses,allow_download)
  values(p_organization,p_hash,p_label,auth.uid(),p_expires_at,p_max_uses,p_allow_download)
  returning id into v_id;
  insert into public.access_code_grants(access_code_id,project_id,segment_id)
    select v_id, g.project_id, g.segment_id
    from jsonb_to_recordset(p_grants) as g(project_id uuid,segment_id uuid);
  return v_id;
end;
$$;
revoke execute on function public.create_access_code_with_grants(uuid,text,text,timestamptz,integer,boolean,jsonb)
  from public, anon;
grant execute on function public.create_access_code_with_grants(uuid,text,text,timestamptz,integer,boolean,jsonb)
  to authenticated;
