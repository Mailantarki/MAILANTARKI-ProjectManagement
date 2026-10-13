alter table public.segments drop constraint if exists segments_slug_check;
alter table public.segments add column sort_order smallint;

update public.segments set
  name = case slug
    when 'architecture' then 'Architecture'
    when 'structure' then 'Structure'
    when 'mep' then 'Mechanical Electrical & Plumbing (MEP)'
    when 'interior-design' then 'Interior Design'
    when 'landscaping' then 'Landscaping'
    when 'sales-plans' then 'Sales Plan'
  end,
  slug = case when slug = 'sales-plans' then 'sales-plan' else slug end,
  sort_order = case slug
    when 'architecture' then 1
    when 'structure' then 2
    when 'mep' then 3
    when 'interior-design' then 4
    when 'landscaping' then 5
    when 'sales-plans' then 6
  end;

alter table public.segments alter column sort_order set not null;
alter table public.segments add constraint segments_sort_order_check check (sort_order between 1 and 6);
alter table public.segments add constraint segments_sort_order_key unique (sort_order);
alter table public.segments add constraint segments_slug_check
  check (slug in ('architecture', 'structure', 'mep', 'interior-design', 'landscaping', 'sales-plan'));
