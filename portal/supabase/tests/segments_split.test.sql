begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(5);

select is((select count(*) from public.segments), 6::bigint,
  'six fixed disciplines exist');
select is((select name from public.segments where slug = 'architecture'), 'Architecture',
  'architecture is independent');
select is((select name from public.segments where slug = 'structure'), 'Structure',
  'structure is independent');
select is((select name from public.segments where slug = 'sales-plans'), 'Sales Plans',
  'sales plans exists');
select is((select count(*) from public.segments where slug = 'architecture-structure'), 0::bigint,
  'legacy combined slug is absent');

select * from finish();
rollback;
