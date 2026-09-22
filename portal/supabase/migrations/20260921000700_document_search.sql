alter table public.documents add column search_vector tsvector generated always as
  (to_tsvector('simple'::regconfig, coalesce(title, '') || ' ' || coalesce(doc_number, ''))) stored;
create index documents_search_vector_idx on public.documents using gin(search_vector);
grant select (search_vector) on public.documents to authenticated;
