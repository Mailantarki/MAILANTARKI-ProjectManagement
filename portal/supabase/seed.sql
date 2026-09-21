insert into public.segments (name, slug) values
  ('Architecture & Structure', 'architecture-structure'),
  ('Mechanical Electrical & Plumbing (MEP)', 'mep'),
  ('Landscaping', 'landscaping'),
  ('Interior Design', 'interior-design')
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
