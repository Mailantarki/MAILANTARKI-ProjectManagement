---
name: admin-upload-metadata
description: Usar al implementar el panel /admin del portal: carga de PDFs con drag & drop y formulario de metadatos, validación de archivos, CRUD de proyectos/usuarios/documentos y vista de logs con exportación CSV. Aplica ante cualquier mención de subir planos, upload, carga masiva, metadatos, revisión, "panel de administración" o exportar logs.
---

# Panel de administración y carga de PDFs

Acceso: solo `super_admin` y `org_admin` (este último limitado a los proyectos de su organización).
Verificar el rol en servidor en cada server action y en cada route handler bajo `/admin`
(el middleware es una capa adicional, no la única).

## Carga de PDFs: subida directa a Storage

Las funciones de Vercel rechazan cuerpos de más de ~4.5 MB, y los planos pesan bastante más.
Por eso el archivo NO pasa por el servidor de Next.js: se sube directo a Supabase Storage con una
signed upload URL. Flujo en 3 pasos:

### 1. `prepareUpload(meta)` — server action

```ts
const meta = documentMetaSchema.parse(input);            // zod
await authorize(principal, { projectId: meta.projectId, segmentId: meta.segmentId }, "admin_upload");
const docId = crypto.randomUUID();
const path = `projects/${meta.projectId}/${segmentSlug}/${docId}.pdf`;   // nunca el nombre original
const { data, error } = await admin.storage.from("documents").createSignedUploadUrl(path);
// insertar fila en documents con el cliente autenticado del usuario (RLS),
// sin enviar file_path: el trigger de la BD lo deriva del proyecto, segmento e id.
return { docId, path, token: data.token };
```

### 2. Subida desde el cliente

```ts
await supabase.storage.from("documents").uploadToSignedUrl(path, token, file, {
  contentType: "application/pdf",
});
```

Mostrar progreso por archivo, permitir varios en paralelo (máx. 3 a la vez) y reintentar los fallidos.

`file_path` es una excepción SOLO en esta respuesta efímera para el admin del proyecto:
`uploadToSignedUrl(path, token, file)` lo exige. Nunca aparece en listados, lecturas de documentos,
logs ni respuestas del visor. No registrar el path ni el token. La signed upload URL y el path
deben crearse solo después de `authorize()`.

### 3. `finalizeUpload(docId)` — server action

1. Confirmar que el usuario es admin del proyecto del documento.
2. Verificar que el objeto existe y obtener su tamaño real (no confiar en el tamaño que informó el cliente).
3. Verificar los magic bytes: pedir una signed URL de descarga corta y leer los primeros bytes con
   `Range: bytes=0-4`; deben ser `%PDF-`. Si no coinciden, borrar el objeto y dejar
   la fila `pending` para cancelar el intento o purgarla tras una hora.
4. Rechazar si supera el límite (50 MB, configurable en una constante).
5. Invocar `finalize_document_upload(docId, fileSize)` solo con el cliente admin
   de servidor, después de autorizar al usuario y verificar bytes y tamaño reales.
   Es un RPC `security definer` ejecutable solo por `service_role`, limitado al flip
   `pending -> ready`. También verifica objeto y tamaño en `storage.objects`.
   `authenticated` no puede ejecutarlo ni actualizar `upload_status`. Si el RPC
   devuelve `invalid_status_transition`, tratarlo como finalización concurrente.
   Solo después del RPC aparece el documento en el portal.

Los documentos en `pending` por más de 1 hora se purgan con la tarea server-only
`npm run cleanup:archived -- --execute`, que borra primero objeto y luego fila.
Un reintento desde la UI cancela su preparación anterior con `cancelUpload`.

## Metadatos (schema zod)

Campos: `projectId` (uuid), `segmentId` (uuid), `title` (1–200), `docNumber` (1–60, ej. `MPL-ARC-101`),
`docType` (enum: plan, section, elevation, detail, specification, schedule, report, other),
`revision` (1–10, ej. `C`), `status` (enum: draft, for review, issued for construction, as-built),
`issueDate` (fecha), `description` (opcional, hasta 1000).

- Validar en el cliente para dar feedback rápido y SIEMPRE otra vez en el servidor.
- Unicidad de documentos `ready` no archivados por `(project_id, segment_id, doc_number, revision)`: si choca, mostrar un error claro y ofrecer
  subir como nueva revisión.
- Carga múltiple: tabla editable con una fila por archivo; permitir aplicar proyecto/segmento a todas
  las filas a la vez. Intentar autocompletar `title`/`docNumber` desde el nombre del archivo, pero
  siempre dejarlos editables antes de confirmar.

## Otras pantallas del admin

- **Proyectos y organizaciones**: CRUD con slug único, imagen de portada (bucket público SOLO para
  portadas, o portadas también privadas con signed URL) y flag `is_public`.
- **Usuarios**: alta por invitación (Supabase Auth admin API, solo servidor), rol, y asignación de
  proyectos/segmentos con permiso de descarga. Un `org_admin` no puede crear `super_admin` ni tocar
  otra organización. Verificar esto en servidor.
- **Códigos de acceso**: ver skill `access-code-flow`.
- **Logs**: tabla paginada de `access_logs` con filtros (usuario/código, proyecto, acción, fechas) y
  botón "Export CSV" generado en servidor (streaming si hay muchas filas). Escapar celdas que empiecen con
  `=`, `+`, `-`, `@` para evitar inyección de fórmulas en Excel.
- Confirmación antes de archivar. La app actualiza `archived_at` con el cliente del usuario;
  el trigger fija fecha y actor. El documento desaparece del portal, pero Storage y logs quedan.
  Después de 30 días, `npm run cleanup:archived -- --execute` elimina objeto y fila con
  `service_role`, conservando los snapshots de `access_logs`. Sin `--execute` es dry-run.

## Tests obligatorios

1. Un `org_admin` no puede preparar una subida en un proyecto de otra organización.
2. Un archivo `.pdf` que en realidad es otra cosa se rechaza en `finalizeUpload` y no queda basura.
3. Un PDF de 20 MB sube sin pasar por el servidor de Next.js.
4. Documentos `pending` no aparecen en el listado del portal.
5. Duplicado `(proyecto, segmento, número, revisión)` devuelve error entendible.
6. El CSV de logs neutraliza celdas que empiezan con `=`.
