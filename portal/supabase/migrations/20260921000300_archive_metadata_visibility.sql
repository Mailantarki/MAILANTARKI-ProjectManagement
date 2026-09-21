-- Admin lists need archive status, while file_path remains private to the server.
grant select (archived_at, archived_by) on public.documents to authenticated;
