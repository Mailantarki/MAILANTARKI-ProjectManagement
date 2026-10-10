# SPEC — Rendimiento de carga (N+1 en Supabase)

## 1. Diagnóstico

**Hipótesis PDF: descartada.** Los PDF no se renderizan en los listados: `PdfViewerLauncher` carga `viewer.tsx` con `dynamic(..., { ssr: false })` y solo al hacer clic en "View". Hay un problema menor en el visor (ver §3.6), pero no explica la lentitud general.

**Hipótesis N+1: confirmada.** La causa principal está en `src/lib/documents/list.ts › visibleProjects()`:

```ts
for (const project of projects)            // P proyectos
  for (const segment of segments)          // S disciplinas
    await authorize(principal, {...})      // 1–3 queries SECUENCIALES cada una
  for (const segment of allowed)
    await client.from("documents").select(..., { count: "exact", head: true })  // 1 query por segmento
  await admin.storage...createSignedUrl()  // 1 request por portada
```

`authorize()` (`lib/auth/authorize.ts`) vuelve a consultar **el mismo proyecto** en cada segmento, y además:
- `member` → +1 query a `user_project_access` por par (proyecto, segmento)
- `visitor` → +2 queries (`access_codes` + `access_code_grants`) por par

Todo con `await` dentro del loop, o sea **secuencial**.

### Round-trips a Supabase por carga de `/projects`

| Principal | Fórmula | Ej. P=10, S=6 |
|---|---|---|
| super_admin / org_admin | 4 + P·S (auth) + P·S (counts) + P (covers) | **~134** |
| member | 4 + 2·P·S + P·S + P | **~194** |
| visitor (código) | 5 + 3·P·S + P·S + P | **~255** |

Con ~40–100 ms de latencia por request (Argentina → región de Supabase), eso son **5–25 s** de TTFB. Además, el costo crece lineal con proyectos × disciplinas.

### Agravantes

1. **`/projects/[slug]` llama a `visibleProjects()` completo** (todos los proyectos, todos los conteos, todas las portadas) solo para hacer `.find(slug)`. La página de detalle paga el costo del listado entero, y lo vuelve a pagar en cada cambio de filtro o de página.
2. **`getPrincipal()` sin deduplicar.** En `/admin/*`, el `layout.tsx` y el `page.tsx` lo llaman cada uno: 2× `auth.getUser()` (request de red al servidor de Auth) y 2× query a `profiles`. En `/projects` el `proxy.ts` además hace `getClaims()`.
3. **RLS por fila en los conteos.** Para usuarios, `count: "exact"` sobre `documents` evalúa la policy `documents_select` en cada fila. Esa policy encadena `is_project_admin → is_org_admin → is_super_admin` y `has_doc_access`, todas `SECURITY DEFINER`, que Postgres no puede inlinear. Resultado: varias subqueries por cada documento contado.
4. **Las portadas no se cachean.** `createSignedUrl(path, 3600)` genera un token nuevo en cada request, así que la URL cambia siempre y el browser vuelve a descargar todas las portadas en cada carga. Las portadas se suben sin redimensionar (`bodySizeLimit: 6mb`).
5. **No hay índice parcial** para el filtro más usado: `upload_status='ready' AND archived_at IS NULL`.
6. **`getAdminClient()`** crea un `SupabaseClient` nuevo en cada llamada (decenas por request).

## 2. Objetivo y criterios de aceptación

- `/projects` y `/projects/[slug]` hacen **≤ 6 round-trips a Supabase**, constantes, sin importar P ni S.
- Las queries independientes se ejecutan en paralelo (`Promise.all`).
- `getPrincipal()` se resuelve **una sola vez por request**.
- Las URLs de portada son estables dentro de una ventana de tiempo, así el browser puede cachearlas.
- La semántica de autorización no cambia: los tests existentes (`authorize.test.ts`, `list.integration.test.ts`, `supabase/tests/*.sql`) pasan sin modificarse.
- TTFB de `/projects` < 500 ms con 20 proyectos × 8 disciplinas (medido con el logging de §3.0).

## 3. Cambios

### 3.0 Medición (antes de tocar nada)
Agregar un wrapper `timed(label, fn)` en `src/lib/perf.ts` que loguee la duración cuando `PERF_LOG=1`. Envolver `getPrincipal`, `visibleProjects`, `projectDocuments` y contar los requests (con un `fetch` custom en `createClient({ global: { fetch } })` que incremente un contador). Registrar el baseline en el PR.

### 3.1 Autorización en lote (elimina el N+1 principal)
En `src/lib/auth/authorize.ts`:

```ts
export async function loadAccessContext(p: Principal, projectIds?: string[]): Promise<Reader>
```

Hace **una sola carga en paralelo** y devuelve un `Reader` en memoria que respeta la misma interfaz:
- `projects` + `organizations(archived_at)` → `.in("id", projectIds)` (o todos los visibles), en 1 query.
- `member` → `user_project_access` donde `user_id = p.userId`, en 1 query.
- `visitor` → `access_codes` por id (1 query) y `access_code_grants` por `access_code_id` (1 query).

Los métodos del `Reader` resuelven desde `Map`s (con `segment_id IS NULL` = todos los segmentos). `authorizeWithReader` **no cambia**, así se reutilizan su lógica y sus tests. El `reader` actual queda para el endpoint `/api/documents/[id]/url`, que autoriza un solo documento.

### 3.2 Conteos agrupados en una sola query
Nueva migración `supabase/migrations/20261006000100_document_counts.sql`:

```sql
create index documents_ready_project_segment_idx
  on public.documents (project_id, segment_id, is_featured desc, issue_date desc nulls last, id)
  where upload_status = 'ready' and archived_at is null;

create function public.document_counts(p_project_ids uuid[])
returns table (project_id uuid, segment_id uuid, count bigint)
language sql stable security definer set search_path = public as $$
  select d.project_id, d.segment_id, count(*)
  from public.documents d
  where d.project_id = any(p_project_ids)
    and d.upload_status = 'ready' and d.archived_at is null
  group by 1, 2;
$$;
revoke execute on function public.document_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.document_counts(uuid[]) to service_role;
```

Se llama con `getAdminClient().rpc(...)` **solo con los project IDs ya autorizados**. Los pares (proyecto, segmento) no autorizados se filtran en TS antes de exponerlos. Esto evita además la evaluación de RLS por fila (§1.3), con el mismo patrón que ya usa la rama `visitor`.

Agregar un test pgTAP que verifique que `authenticated` y `anon` no pueden ejecutar `document_counts`.

### 3.3 Reescribir `visibleProjects()`
```ts
export async function visibleProjects(principal, opts?: { slug?: string }) {
  // 1) en paralelo: proyectos (filtrados por slug si viene), segmentos, AccessContext
  // 2) en memoria: allowed = segments.filter(s => authorizeWithReader(...))  (sin I/O)
  // 3) en paralelo: rpc document_counts(ids autorizados) + createSignedUrls(covers)
}
```
- Usar `storage.from("project-covers").createSignedUrls(paths[], ttl)`, que es **1 request** para todas las portadas.
- Lista de segmentos: cachear en módulo con `unstable_cache` (o `"use cache"`) y `revalidateTag("segments")`, porque es un catálogo casi estático.
- Total esperado: ~3 round-trips en paralelo + 2 en paralelo.

### 3.4 `projectDocuments()` sin cargar todo el listado
Reemplazar `(await visibleProjects(principal)).find(...)` por `visibleProjects(principal, { slug })`, que filtra con `.eq("slug", slug)` en la query de proyectos y calcula auth y conteos solo para ese proyecto. La query de documentos paginada sigue igual (ya usa `range` y aprovecha el índice nuevo).

### 3.5 Deduplicar el principal y el cliente admin
- `src/lib/auth/principal.ts`: `export const getPrincipal = cache(async () => {...})` (con `import { cache } from "react"`). Así `layout` + `page` comparten el resultado dentro del request.
- `src/lib/supabase/admin.ts`: memoizar el cliente en una variable de módulo, porque no tiene sesión (`persistSession: false`) y es seguro reutilizarlo.
- `getUserClient()`: envolver en `cache()`.
- **Opcional (decisión de seguridad):** si el proyecto Supabase usa *JWT signing keys* asimétricas, reemplazar `auth.getUser()` por `auth.getClaims()` (validación local, sin red). Hoy `getUser()` también chequea `banned_until`/`deleted_at`. Si se adopta, la suspensión pasa a depender solo de `profiles.suspended_at`, que ya se consulta. Validar con `principal.test.ts`.

### 3.6 Portadas y visor PDF
- **TTL estable para portadas:** firmar con `expiresIn` alineado a una ventana (por ejemplo, redondear a la hora y firmar hasta el final de la hora siguiente). Para evitar que el token cambie en cada request, cachear el resultado de `createSignedUrls` con `unstable_cache` keyed por `(path, ventana)`, con un TTL de 30 min.
- **Tamaño de portadas:** en `cover-actions.ts`, al subir, generar una versión de ~1200 px de ancho en WebP (con `sharp`) y guardarla como el objeto que se muestra.
- **Visor (`viewer.tsx`):** sacar `key={ticket.url}` del contenedor. Hoy, cuando el ticket se renueva (~cada 255 s), se remonta `<Document>` y **se vuelve a descargar el PDF entero** mientras el usuario lo está leyendo. Solo renovar el ticket cuando `onLoadError`/`onSourceError` falla, y pasar `?refresh=1` para que el endpoint no inserte otro `access_logs` de tipo `view` en las renovaciones.

### 3.7 Admin (menor)
- `admin/layout.tsx` y cada `page.tsx` quedan cubiertos por §3.5 (`cache`).
- `admin/codes/page.tsx` trae **todos** los `access_code_grants` sin filtrar. Filtrar con `.in("access_code_id", codes.map(c => c.id))` después de la query paginada.

## 4. Plan de implementación (orden)
1. §3.0 medición y baseline.
2. §3.5 `cache()` + cliente admin memoizado (bajo riesgo, ganancia inmediata).
3. Migración §3.2 + test pgTAP.
4. §3.1 `loadAccessContext` + tests unitarios (mismo set de casos que `authorize.test.ts`, ejecutados contra el reader en memoria).
5. §3.3 / §3.4 reescritura de `list.ts`. `list.integration.test.ts` debe pasar sin cambios.
6. §3.6 portadas y visor.
7. §3.7 admin.
8. Re-medir y adjuntar en el PR el before/after (round-trips y TTFB).

## 5. Fuera de alcance
- Quitar `await connection()` del root layout: es necesario por el nonce de CSP por request.
- Generar miniaturas de PDF.

## 6. Estado de implementación (2026-10-06)

Implementado: §3.0, §3.1 (`memoryReader` en `authorize.ts`), §3.2 (`document_counts` y su test pgTAP), §3.3, §3.4, §3.5 (sin `getClaims`), §3.6 (caché de URLs firmadas + visor).

Desvíos respecto de la spec:
- **Índice:** no se creó. `documents_project_featured_issue_idx` (migración `20260922000500`) ya cubre `(project_id, segment_id, …) WHERE ready AND NOT archived`.
- **`?refresh=1`:** descartado, porque permitiría a un cliente evitar el registro de auditoría. Sin la renovación periódica del ticket, las renovaciones solo ocurren ante un error de carga y se siguen registrando.
- **Portadas:** se reutilizan las URLs firmadas por 30 min, con un TTL de 1 h (igual que antes) y una caché en memoria por instancia. No se agregó redimensionado con `sharp`.
- **Pendiente:** §3.5 `getClaims` (decisión de seguridad) y §3.7 filtrar los grants en `/admin/codes` (agregaría un round-trip secuencial).

## 7. Latencia por click (2026-10-06)

Medido con un Supabase simulado que agrega 150 ms a cada request, una latencia parecida a la de Córdoba → us-east-1, donde está el proyecto. Usuario member, 6 proyectos y 6 disciplinas. Tiempos de render en el servidor.

| Pantalla | Original (HEAD) | Antes de hoy | Ahora |
|---|---|---|---|
| /projects | 12,8 s · 83 rondas | 482 ms · 3 | 167 ms · 1 |
| Proyecto, pestaña o filtro | 12,9 s · 84 rondas | 642 ms · 4 | 328 ms · 2 |
| Admin (overview, users, codes, logs, projects) | 470–630 ms · 3–4 | 470–480 ms · 3 | 170–180 ms · 1 |
| Admin documentos / subir PDFs | 780 ms · 5 | 620 ms · 4 | 170 ms · 1 |
| Volver a una pantalla ya visitada (< 30 s) | igual que la primera vez | igual | ~6 ms (caché del router) |

Una "ronda" es una espera de red secuencial contra Supabase. En el navegador, el click en una pestaña tarda unos 340 ms hasta mostrar el contenido, y el skeleton aparece al instante.

Cambios:
- `getPrincipal()`: `getClaims()` y la consulta del perfil corren en paralelo. El perfil se busca por el id de la cookie y solo se acepta si el token verificado tiene el mismo `sub`.
- Precarga: `/projects` y `/projects/[slug]` empiezan a cargar los datos con la identidad de la cookie (`getIdentity()`, sin red) mientras se verifica la sesión. Solo se usan si coinciden con el principal verificado.
- Páginas de admin: las consultas, que van bajo RLS, arrancan junto con `getPrincipal()`. La página de documentos carga el proyecto y sus documentos en una sola ronda, y subir PDFs ya no autoriza una vez por disciplina.
- `document_counts(p_project_ids, p_project_slug)` (migración `20261006000200`): los conteos viajan en la primera ronda.
- `proxy.ts`: refresca la sesión también en `/admin` y `/change-password` con `getSession()`, que no hace llamada de red salvo que el token haya vencido. Antes, en admin, un token vencido se refrescaba en cada request sin guardarse.
- `next.config.ts`: `staleTimes.dynamic = 30`, así volver a una sección visitada es instantáneo. `router.refresh()` invalida ese caché después de cada cambio.

Pendiente:
- Correr `npx supabase db push` antes de probar, porque la migración `20261006000200` cambia la firma de `document_counts`.
- En producción en Vercel (región iad1, junto a Supabase us-east-1) cada ronda cuesta pocos ms. Probando con `start:cloud` desde Córdoba, cada ronda cuesta unos 150 ms.
- Activar las JWT signing keys asimétricas en Supabase (Settings → JWT Keys) para que `getClaims()` verifique localmente, sin llamar a Auth.
