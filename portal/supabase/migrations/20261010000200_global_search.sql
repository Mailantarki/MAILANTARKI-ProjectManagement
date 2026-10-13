-- Global search (⌘K): exact number first, then number prefix, then words in title and number.
-- security invoker: users search through their own session (RLS). The server passes the
-- (project, discipline) pairs it already authorized as p_scope, so archived projects and
-- visitors' code grants are respected too (visitors search with the service client).
create index documents_number_lookup_idx on public.documents (project_id, lower(doc_number))
  where upload_status = 'ready' and archived_at is null;

create function public.search_documents(
  p_query text,
  p_scope jsonb,
  p_include_history boolean default false,
  p_limit integer default 20
)
returns table (id uuid, project_id uuid, segment_id uuid, doc_number text, title text, revision text,
  status public.document_status, is_current boolean, rank real)
language sql stable security invoker set search_path = public as $$
  with q as (
    select lower(trim(p_query)) as text,
      -- Words only (letters and digits), each as a prefix: "nor elev" finds "North elevation".
      nullif(array_to_string(array(
        select token || ':*' from regexp_split_to_table(lower(p_query), '[^[:alnum:]]+') as token where token <> ''
      ), ' & '), '') as prefix
  ), scope as (
    select (s->>'project_id')::uuid as project_id, nullif(s->>'segment_id', '')::uuid as segment_id
    from jsonb_array_elements(coalesce(p_scope, '[]'::jsonb)) as s
  )
  select d.id, d.project_id, d.segment_id, d.doc_number, d.title, d.revision, d.status, d.is_current,
    (case
      when lower(d.doc_number) = q.text then 3
      when lower(d.doc_number) like replace(replace(q.text, '%', ''), '_', '\_') || '%' then 2
      else 1
    end + coalesce(ts_rank(d.search_vector, to_tsquery('simple', q.prefix)), 0))::real as rank
  from public.documents d, q
  where d.upload_status = 'ready' and d.archived_at is null
    and (p_include_history or d.is_current)
    and exists (select 1 from scope s where s.project_id = d.project_id
      and (s.segment_id is null or s.segment_id = d.segment_id))
    and length(q.text) between 2 and 80
    and (lower(d.doc_number) like '%' || replace(replace(q.text, '%', ''), '_', '\_') || '%'
      or (q.prefix is not null and d.search_vector @@ to_tsquery('simple', q.prefix)))
  order by rank desc, d.doc_number, d.is_current desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;
revoke execute on function public.search_documents(text, jsonb, boolean, integer) from public, anon;
grant execute on function public.search_documents(text, jsonb, boolean, integer) to authenticated, service_role;
