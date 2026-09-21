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

Segmentos (aplican a cada proyecto): Architecture & Structure, Mechanical Electrical & Plumbing (MEP),
Landscaping, Interior Design.

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

1. Bucket de Storage PRIVADO. Nunca URLs públicas de PDFs, nunca exponer `file_path` al cliente.
2. Los PDFs se sirven SOLO con signed URL de vida corta (300 s), generada en servidor DESPUÉS de
   llamar a `authorize()`.
3. RLS activo en TODAS las tablas de `public`. Toda migración que cree una tabla incluye sus políticas.
4. TODA decisión de permiso pasa por `src/lib/auth/authorize.ts`. Prohibido re-implementar permisos
   en endpoints o componentes.
5. Los códigos de acceso se guardan solo como hash (ver skill `access-code-flow`), se muestran una
   única vez y jamás se loguean.
6. La service role key vive solo en el servidor (`import "server-only"`). Nunca con prefijo `NEXT_PUBLIC_`.
7. Validar todo input externo con zod, en servidor. Mensajes de error genéricos en login y códigos.
8. Registrar en `access_logs`: login, code_redeem, view, download.
9. Nunca editar una migración ya aplicada: crear una nueva.

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
