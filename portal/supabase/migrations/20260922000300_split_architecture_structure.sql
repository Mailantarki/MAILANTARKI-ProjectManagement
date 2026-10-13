-- Split the legacy combined discipline without changing its UUID, grants or documents.
alter table public.segments drop constraint if exists segments_slug_check;

do $$
begin
  if exists (select 1 from public.segments where slug = 'architecture-structure') then
    update public.segments
      set name = 'Architecture', slug = 'architecture'
      where slug = 'architecture-structure';
    insert into public.segments(name, slug)
      values ('Structure', 'structure')
      on conflict (slug) do update set name = excluded.name;
    insert into public.segments(name, slug)
      values ('Sales Plans', 'sales-plans')
      on conflict (slug) do update set name = excluded.name;
  end if;
end;
$$;

alter table public.segments add constraint segments_slug_check
  check (slug in ('architecture', 'structure', 'mep', 'landscaping', 'interior-design', 'sales-plans'));
