# Portal de documentación técnica (planos PDF por proyecto y disciplina)

Portal web donde se organizan y consultan planos y documentos PDF por PROYECTO y por SEGMENTO
(disciplina). El acceso es por usuario/contraseña o por CÓDIGO DE ACCESO generado por un admin.

## Contexto de negocio

Proyectos (seed inicial):
1. MAILANTARKI Sports Complex, Dakibiyu
2. Maylan Plaza, Asokoro
3. Maylan Heights Residence, Life Camp, Dape
4. Daige Residences, Kaura
5. Daige Heights Apartment, Katampe
6. Mauritius Golf Estate, Mabushi

Segmentos (aplican a cada proyecto): Architecture, Structure, Mechanical Electrical & Plumbing (MEP),
Landscaping, Interior Design, Sales Plans.

Roles: `super_admin` (todo), `org_admin` (solo su organización), `member` (solo lo asignado),
y visitante con código (solo lectura, solo lo que el código habilita).

## Stack

Next.js (App Router) + TypeScript + Tailwind · Supabase (Postgres, Auth, Storage privado) ·
react-pdf (pdf.js) · zod · jose · Vercel. UI en inglés, con textos centralizados para poder traducir.

## Comandos (ajustar si el proyecto difiere)

- `npm run dev` · `npm run lint` · `npm run typecheck` · `npm test`
- `npx supabase db reset` (recrea BD local con migraciones + seed)
- `npx supabase test db` (tests SQL de RLS)

## Estructura esperada

```
src/app/                 rutas (landing, /projects, /admin, /api)
src/lib/auth/            principal.ts (quién es el que pide) y authorize.ts (ÚNICA fuente de permisos)
src/lib/supabase/        client.ts, server.ts, admin.ts (service role, solo servidor)
src/lib/access-codes/    generate, hash, redeem, session
src/components/pdf/      visor
supabase/migrations/     SQL versionado
supabase/tests/          tests SQL de RLS
supabase/seed.sql
```

## Reglas no negociables

1. Bucket de Storage PRIVADO. Nunca URLs públicas de PDFs. `file_path` no aparece en lecturas,
   listados ni columnas legibles por clientes. Única excepción: la respuesta efímera de
   `prepareUpload` al admin autorizado del proyecto, si `uploadToSignedUrl` exige el path.
2. Los PDFs se sirven SOLO con signed URL de vida corta (300 s), generada en servidor DESPUÉS de
   llamar a `authorize()`.
3. RLS activo en TODAS las tablas de `public`. Toda migración que cree una tabla incluye sus políticas.
   Revocar `TRUNCATE`, `TRIGGER`, `REFERENCES` y `MAINTAIN` a roles de cliente en cada
   tabla nueva: los grants predeterminados de Supabase pueden saltar RLS.
4. TODA decisión de permiso pasa por `src/lib/auth/authorize.ts`. Prohibido re-implementar permisos
   en endpoints o componentes.
5. Los códigos de acceso se guardan solo como hash (ver skill `access-code-flow`), se muestran una
   única vez y jamás se loguean.
6. La service role key vive solo en el servidor (`import "server-only"`). Nunca con prefijo `NEXT_PUBLIC_`.
7. Validar todo input externo con zod, en servidor. Mensajes de error genéricos en login y códigos.
8. Registrar en `access_logs`: login, code_redeem, view, download.
9. Nunca editar una migración ya aplicada: crear una nueva.
10. Las escrituras de admin en `organizations`, `projects`, `documents`, `profiles`,
    `user_project_access`, `access_codes` y `access_code_grants` usan el cliente autenticado
    del usuario y quedan sujetas a RLS. `service_role` se limita a signed URLs y operaciones
    de Storage, canje atómico de códigos, invitaciones de Auth, inserción de `access_logs`,
    lecturas de `authorize()` para visitantes y la tarea controlada de limpieza.
    Excepciones de Fase 2: los scripts CLI confiables crean el usuario Auth y su perfil
    inicial con service role; los endpoints usan service role para canje atómico, rate
    limit persistente y `access_logs`. La creación de códigos usa cliente autenticado y RLS.
    La única transición de `documents.upload_status` de `pending` a `ready` usa
    `finalize_document_upload(id, size)`: RPC `security definer` ejecutable solo por
    `service_role`, después de autorizar con el cliente del usuario y validar bytes y
    tamaño desde Storage. El RPC reconfirma objeto y tamaño en `storage.objects`.
    Es una excepción acotada a las escrituras de service role; `authenticated` no
    puede invocarlo ni actualizar directamente `upload_status`.
11. `organizations`, `projects` y documentos `ready` se archivan con `archived_at`;
    solo los `pending` del proyecto pueden cancelarse (DELETE sujeto a RLS). Los
    documentos archivados permanecen 30 días antes de la limpieza
    de Storage con `--execute`. Los logs conservan snapshots del documento y proyecto.
12. El panel de admin usa server actions que reconfirman `getPrincipal()` y
    `authorize()` aun cuando el layout esté protegido. Crear/listar usuarios mediante
    Auth admin API e insertar su perfil inicial es la excepción documentada; asignar
    proyectos, crear códigos y archivar/restaurar usan el cliente del usuario y RLS.

## Flujo de trabajo

- Trabajar por fases (1 esquema+RLS+seed, 2 auth+landing+códigos, 3 /projects+filtros+visor,
  4 admin, 5 hardening+deploy). No pasar a la siguiente sin lint, typecheck y tests en verde.
- Al cerrar cada fase: correr el skill `security-review`, actualizar el README y listar lo pendiente.
- Ante una decisión ambigua que cambie el modelo de datos o la seguridad, preguntar antes de implementar.
- Fuera de alcance del MVP: mapas, renders, 360°, avance de obra, unidades, comentarios, emails, pagos.

## Skills del proyecto (en .agents/skills/)

- `supabase-rls-migrations` — migraciones, RLS, bucket, tests SQL
- `access-code-flow` — generar, canjear y revocar códigos; sesión de visitante
- `pdf-signed-url-access` — endpoint que autoriza y devuelve la signed URL
- `pdf-viewer-react` — visor de PDF
- `admin-upload-metadata` — carga de PDFs con metadatos desde el admin
- `security-review` — checklist obligatorio al cerrar cada fase

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
