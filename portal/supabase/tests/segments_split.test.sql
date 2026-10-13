begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(6);

select is((select count(*) from public.segments), 6::bigint,
  'six fixed disciplines exist');
select is((select name from public.segments where slug = 'architecture'), 'Architecture',
  'architecture is independent');
select is((select name from public.segments where slug = 'structure'), 'Structure',
  'structure is independent');
select is((select name from public.segments where slug = 'sales-plan'), 'Sales Plan',
  'sales plan exists');
select is((select count(*) from public.segments where slug = 'architecture-structure'), 0::bigint,
  'legacy combined slug is absent');
select is((select string_agg(name, ' | ' order by sort_order) from public.segments),
  'Architecture | Structure | Mechanical Electrical & Plumbing (MEP) | Interior Design | Landscaping | Sales Plan',
  'disciplines use the required display order');

select * from finish();
rollback;
