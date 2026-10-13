alter table public.access_codes add column deleted_at timestamptz;
alter table public.access_codes add constraint deleted_codes_inactive
  check (deleted_at is null or not is_active);
grant update (deleted_at) on public.access_codes to authenticated;

-- Existing organization-scoped UPDATE RLS remains the authorization boundary.
-- A deleted code is terminal: even direct client writes cannot restore it.
create function public.keep_access_code_deleted() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if old.deleted_at is not null and new.deleted_at is distinct from old.deleted_at then
    raise exception 'deleted_code_cannot_be_restored';
  end if;
  return new;
end;
$$;
revoke execute on function public.keep_access_code_deleted() from public, anon, authenticated;
create trigger keep_access_code_deleted before update on public.access_codes
for each row execute function public.keep_access_code_deleted();
