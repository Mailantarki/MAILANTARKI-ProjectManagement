insert into public.segments (name, slug, sort_order) values
  ('Architecture', 'architecture', 1),
  ('Structure', 'structure', 2),
  ('Mechanical Electrical & Plumbing (MEP)', 'mep', 3),
  ('Interior Design', 'interior-design', 4),
  ('Landscaping', 'landscaping', 5),
  ('Sales Plan', 'sales-plan', 6)
on conflict (slug) do nothing;

insert into public.organizations (name)
values ('MAILANTARKI.COM')
on conflict (name) do nothing;

insert into public.projects (organization_id, name, slug, location)
select o.id, p.name, p.slug, p.location
from public.organizations o
cross join (values
  ('MAILANTARKI Sports Complex', 'mailantarki-sports-complex', 'Dakibiyu'),
  ('Maylan Plaza', 'maylan-plaza', 'Asokoro'),
  ('Maylan Heights Residence', 'maylan-heights-residence', 'Life Camp, Dape'),
  ('Daige Residences', 'daige-residences', 'Kaura'),
  ('Daige Heights Apartment', 'daige-heights-apartment', 'Katampe'),
  ('Mauritius Golf Estate', 'mauritius-golf-estate', 'Mabushi')
) as p(name, slug, location)
where o.name = 'MAILANTARKI.COM'
on conflict (slug) do nothing;
