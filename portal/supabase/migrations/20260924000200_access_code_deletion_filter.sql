-- Column-level SELECT grants require explicitly exposing the deletion marker.
-- Existing SELECT RLS still restricts rows to organization administrators.
grant select (deleted_at) on public.access_codes to authenticated;
