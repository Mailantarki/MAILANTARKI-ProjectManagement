---
name: pdf-signed-url-access
description: Usar al implementar o modificar cómo se sirven, abren o descargan los PDFs del portal: endpoint de signed URLs, función authorize(), verificación de permisos por usuario o por código de acceso, control de descarga y registro en access_logs. Aplica ante cualquier mención de "servir PDF", "URL del archivo", "signed URL", "permisos de documento", "descarga" o "IDOR", aunque no se nombre este skill.
---

# Servir PDFs de forma segura

Principio: el cliente NUNCA conoce el path del archivo ni recibe una URL permanente.
Cada vez que necesita ver un PDF, pide una signed URL a un endpoint que verifica permisos primero.

## Piezas (todas en servidor)

### 1. Principal: quién está pidiendo

```ts
// src/lib/auth/principal.ts
import "server-only";
export type Principal =
  | { kind: "user"; userId: string; role: "super_admin" | "org_admin" | "member"; organizationId: string | null }
  | { kind: "visitor"; accessCodeId: string };

export async function getPrincipal(): Promise<Principal | null> {
  // 1) sesión de Supabase Auth  -> kind: "user"
  // 2) cookie de visitante firmada, revalidada contra la BD (ver skill access-code-flow) -> kind: "visitor"
  // 3) ninguna -> null
}
```

### 2. authorize(): la ÚNICA fuente de verdad de permisos

```ts
// src/lib/auth/authorize.ts
import "server-only";
export type Action = "view" | "download" | "admin_upload";

export async function authorize(
  p: Principal,
  target: { projectId: string; segmentId: string },
  action: Action,
): Promise<boolean> {
  // Usa el cliente admin (service role) para consultar. Reglas:
  // user super_admin            -> true (download: true)
  // user org_admin              -> project.organization_id === p.organizationId
  // user member                 -> fila en user_project_access con project_id y
  //                                (segment_id IS NULL o = target.segmentId);
  //                                download requiere can_download = true
  // visitor                     -> access_code activo y no vencido, con grant en access_code_grants
  //                                (project_id, segment_id NULL o = target.segmentId);
  //                                download requiere access_codes.allow_download = true
  // admin_upload                -> solo super_admin u org_admin del proyecto activo;
  //                                nunca member ni visitante
  // cualquier otro caso         -> false
}
```

Si `authorize` no está implementada aún, implementarla primero. Ningún otro archivo debe decidir permisos.

### 3. Endpoint

`GET /api/documents/[id]/url?download=0|1`

Orden estricto:
1. `getPrincipal()`; si es null responder 401.
2. Validar `id` (uuid) y `download` con zod.
3. Cargar el documento con el cliente admin: `project_id, segment_id, file_path, upload_status, title`.
   Si no existe o `upload_status !== 'ready'`, responder **404**.
4. `authorize(principal, {projectId, segmentId}, download ? "download" : "view")`.
   Si es false, responder **404** (no 403): no revelar que el documento existe.
5. Registrar en `access_logs` (`view` o `download`) con user_id o access_code_id, project_id,
   document_id, ip y user_agent. El log no debe romper la respuesta si falla (try/catch + console.error).
6. Crear la signed URL:
   ```ts
   const { data, error } = await admin.storage
     .from("documents")
     .createSignedUrl(doc.file_path, 300, download ? { download: fileNameFrom(doc) } : undefined);
   ```
7. Responder `{ url, expiresIn: 300, allowDownload }` con
   `Cache-Control: no-store`. NUNCA incluir `file_path` en la respuesta.

No devolver emails ni textos de marca de agua al visor.

## Anti-patrones (rechazar en revisión)

- Bucket público o `getPublicUrl`.
- Devolver `file_path` o el objeto `document` completo al cliente.
- Generar la signed URL antes de `authorize`.
- Signed URLs con vida larga (> 5 min) o cacheadas.
- Autorizar comparando solo `project_id` e ignorando `segment_id`.
- Responder distinto ("existe pero no tenés permiso" vs "no existe").
- Verificar permisos solo en el componente de UI.

## Tests obligatorios (vitest o similar, contra la BD local)

1. Sin sesión ni cookie -> 401.
2. Member con acceso solo a MEP pide un documento de Landscaping del mismo proyecto -> 404.
3. Member del proyecto A pide un documento del proyecto B -> 404.
4. Visitante con código revocado o vencido -> no obtiene URL.
5. `download=1` con `allow_download = false` -> 404.
6. Caso feliz: devuelve URL, expira (a los ~300 s deja de funcionar) y queda fila en `access_logs`.

Al terminar, correr el skill `security-review` sobre los archivos tocados.
