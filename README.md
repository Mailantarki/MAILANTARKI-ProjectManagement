# MAILANTARKI

Monorepo con los dos sitios de Mailantarki:

| Carpeta | Qué es | Stack | Dominio previsto |
|---|---|---|---|
| [`landing/`](landing/) | Landing pública: página principal con los 6 proyectos | HTML estático + CSS + ES modules, sin build | `mailantarki.com` |
| [`portal/`](portal/) | Document hub / portal de documentación técnica (login, códigos de acceso, PDFs) | Next.js + Supabase | `portal.mailantarki.com` |

La landing es la entrada: el botón **Client portal** del header abre `/projects` del portal, y el botón **Project documents** de cada proyecto abre `/projects/<portalSlug>`. La URL del portal se configura en `landing/js/data/projects.js` → `site.portal.url`.

Cada carpeta funciona igual que cuando era un repo aparte: no se cambió código de ninguna de las dos apps. Cada una tiene su propio README con el detalle.

## Estructura

```
.
├── landing/                 ← antes: Documents/RPA/PROJECTS/Mailantarki (repo Mailantarki-web)
├── portal/                  ← antes: dev/portal-documentacion-tecnica (repo MAILANTARKI-ProjectManagement)
├── .github/workflows/
│   └── portal-ci.yml        ← CI del portal (antes en portal/.github), corre solo si cambia portal/
├── .gitignore
└── README.md
```

El historial de commits de los dos repos originales está conservado: cada commit viejo aparece con sus archivos ya dentro de `landing/` o `portal/`. Para ver la historia de un archivo: `git log --follow -- portal/src/app/page.tsx`.

## Desarrollo local

**Landing** (no necesita instalar nada):

```bash
cd landing
python3 serve.py        # http://localhost:8000
```

**Portal** (Node 24, Docker para Supabase local):

```bash
cd portal
npm ci                  # node_modules no se copia: hay que instalarlo una vez
npx supabase start
npm run dev             # http://localhost:3000
```

Los archivos `.env.local`, `.env.cloud.local` y `.env.local.docker` del portal ya están copiados en `portal/` para que funcione igual que antes. Están ignorados por git: **no se suben a GitHub**.

> El `project_id` de Supabase en `portal/supabase/config.toml` se dejó igual (`portal-documentacion-tecnica`) a propósito: así Supabase local reutiliza la misma base de datos y storage que ya tenías.

## Deploy en Vercel (dos proyectos, un solo repo)

Vercel permite varios proyectos apuntando al mismo repo, cada uno con su **Root Directory**:

1. **Portal** → importar el repo, *Root Directory* = `portal`. Framework: Next.js. Install/Build ya están en `portal/vercel.json` (`npm ci` / `npm run build`). Cargar las mismas variables de entorno de producción (ver `portal/.env.example`). Dominio: `portal.mailantarki.com`.
2. **Landing** → importar el mismo repo otra vez, *Root Directory* = `landing`. Framework Preset: *Other*, sin build command ni output directory. Dominio: `mailantarki.com`.

Si ya tenías el portal deployado desde el repo viejo, en ese proyecto de Vercel alcanza con cambiar *Settings → Git* al repo nuevo y poner *Root Directory* = `portal`.

Opcional, para que un cambio en una carpeta no redeploye la otra: en cada proyecto, *Settings → Git → Ignored Build Step* = `git diff HEAD^ HEAD --quiet -- .`

## Subir a GitHub

```bash
cd ~/dev/mailantarki
git remote add origin https://github.com/<usuario>/<repo-nuevo>.git
git push -u origin main
```
