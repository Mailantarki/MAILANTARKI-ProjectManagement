---
name: supabase-rls-migrations
description: Usar SIEMPRE que se cree o modifique el esquema de base de datos del portal de planos: tablas, columnas, índices, funciones SQL, políticas RLS (Row Level Security), el bucket de Storage, el seed o los tests SQL. Aplica ante cualquier mención de migration, migración, policy, RLS, permisos de base de datos, bucket o Supabase schema, aunque el usuario no pida explícitamente RLS.
---

# Supabase: migraciones y RLS

Objetivo: que la BASE DE DATOS impida por sí misma el acceso cruzado entre proyectos y organizaciones,
aunque el frontend o un endpoint tengan un bug.

## Reglas

1. Una migración nueva por cambio, en `supabase/migrations/<timestamp>_<descripcion>.sql`.
   Nunca editar una migración ya aplicada.
2. Toda tabla nueva en `public` lleva `alter table ... enable row level security;` en la MISMA migración
   y sus políticas explícitas. Sin política = nadie accede (es lo correcto por defecto).
3. Políticas separadas por operación (select / insert / update / delete), siempre con `to authenticated`
   o `to service_role` explícito. Nunca `to public` ni `using (true)`.
4. En políticas usar `(select auth.uid())` en vez de `auth.uid()` directo (evita reevaluar por fila).
5. Las funciones helper que consultan otras tablas con RLS son `security definer` con
   `set search_path = public`, para evitar recursión de políticas y secuestro del search_path.
6. Indexar toda columna usada en políticas o filtros: `project_id`, `segment_id`, `user_id`,
   `organization_id`, `code_hash` (único).
7. Escrituras de negocio desde el cliente autenticado del usuario, sujetas a RLS.
   `documents`, `projects` y `organizations` se archivan; no crear políticas DELETE para clientes.
   Una migración aplicada nunca se edita: agregar otra migración para cualquier ajuste.
8. En TODA tabla nueva de `public`, revocar `TRUNCATE`, `REFERENCES`, `TRIGGER` y `MAINTAIN`
   a `PUBLIC`, `anon` y `authenticated`: los grants predeterminados de Supabase los incluyen,
   y `TRUNCATE` salta RLS. Probar privilegios efectivos, no solo políticas.

## Ajustes al esquema base (incluir en la migración inicial)

- `access_codes.allow_download boolean not null default false`
- `user_project_access.can_download boolean not null default false`
- `documents.upload_status text not null default 'pending' check (upload_status in ('pending','ready'))`
- `unique (project_id, segment_id, doc_number, revision)` en `documents`
- `access_codes.code_hash text not null unique`
- `segments` con exactamente 6 filas fijas y `sort_order` 1–6 (slugs: `architecture`, `structure`, `mep`, `interior-design`, `landscaping`, `sales-plan`)

## Helpers de permisos

```sql
create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = (select auth.uid()) and role = 'super_admin');
$$;

create or replace function public.is_project_admin(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin()
      or exists (
        select 1 from profiles pr join projects pj on pj.organization_id = pr.organization_id
        where pr.id = (select auth.uid()) and pr.role = 'org_admin' and pj.id = p_project);
$$;

create or replace function public.has_doc_access(p_project uuid, p_segment uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_project_admin(p_project)
      or exists (
        select 1 from user_project_access a
        where a.user_id = (select auth.uid()) and a.project_id = p_project
          and (a.segment_id is null or a.segment_id = p_segment));
$$;
```

## Políticas por tabla (patrón)

```sql
alter table documents enable row level security;

create policy documents_select on documents for select to authenticated
  using (public.is_project_admin(project_id) or
    (upload_status = 'ready' and archived_at is null and public.is_active_project(project_id)
      and public.has_doc_access(project_id, segment_id)));
create policy documents_insert on documents for insert to authenticated
  with check (public.is_project_admin(project_id));
create policy documents_update on documents for update to authenticated
  using (public.is_project_admin(project_id)) with check (public.is_project_admin(project_id));
create policy documents_delete on documents for delete to authenticated
  using (public.is_project_admin(project_id));
```

- `projects`: select si `has_doc_access` a alguno de sus segmentos o `is_project_admin`; o si `is_public`
  (solo columnas públicas, idealmente vía una vista `public_projects`).
- `profiles`: cada usuario lee su fila; admins leen las de su organización; miembros no cambian su `role`.
- `documents`, `projects`, `organizations`: admin archiva con UPDATE; ninguna política DELETE de cliente.
- `user_project_access`: select propio; escritura solo admins.
- `access_codes`, `access_code_grants`, `access_logs`: SOLO admins (select) y `service_role`.
  Los visitantes con código NO son usuarios de Supabase Auth: se resuelven en servidor con service role
  (ver skill `access-code-flow`). Nunca dar acceso `anon` a estas tablas.

## Storage

```sql
insert into storage.buckets (id, name, public) values ('documents', 'documents', false)
on conflict (id) do update set public = false;
```

No crear políticas sobre `storage.objects` para `anon` ni `authenticated`: solo el servidor (service role)
lee y escribe, y entrega signed URLs. Convención de path: `projects/{project_id}/{segment_slug}/{document_id}.pdf`
(nunca usar el nombre original del archivo en el path).

## Funciones sensibles

Revocar ejecución a los roles de cliente:
`revoke execute on function public.redeem_access_code(text) from public, anon, authenticated;`
y `grant execute ... to service_role;`.

## Tests SQL (obligatorios para cambios de permisos)

En `supabase/tests/`, con pgTAP o SQL plano. Simular un usuario:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<uuid-usuario>', 'role', 'authenticated')::text, true);
-- un member sin grants no ve nada
select is((select count(*) from documents), 0::bigint, 'member sin acceso ve 0 documentos');
rollback;
```

Casos mínimos: (a) member sin grant ve 0; (b) member con grant a UN segmento no ve los otros segmentos
del mismo proyecto; (c) member de un proyecto no ve otro proyecto; (d) org_admin no ve otra organización;
(e) authenticated no puede leer `access_codes` ni `access_logs`; (f) nadie puede insertar en `documents`
sin ser admin del proyecto.

## Verificación antes de terminar

```sql
-- debe devolver 0 filas
select tablename from pg_tables where schemaname = 'public' and not rowsecurity;
-- el bucket debe ser privado
select id, public from storage.buckets where id = 'documents';
```

Correr `npx supabase db reset` y `npx supabase test db` y reportar el resultado.
