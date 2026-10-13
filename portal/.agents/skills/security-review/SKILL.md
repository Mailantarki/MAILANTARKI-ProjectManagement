---
name: security-review
description: Usar OBLIGATORIAMENTE al cerrar cada fase del proyecto, antes de un deploy, y cuando el usuario pida revisar seguridad, auditar, hacer un checklist o "revisar antes de subir". También al terminar cualquier cambio en autenticación, permisos, RLS, storage, códigos de acceso o endpoints. Revisa RLS, secretos, IDOR, signed URLs, cookies, headers, rate limiting y logs, y produce un reporte con severidades.
---

# Revisión de seguridad del portal

Ejecutar todas las secciones y producir el reporte del final. No arreglar en silencio: primero
reportar, después corregir lo Crítico y Alto, y volver a verificar.

## 1. Base de datos y RLS

```sql
select tablename from pg_tables where schemaname = 'public' and not rowsecurity;   -- debe ser 0 filas
select id, public from storage.buckets;                                            -- 'documents' con public = false
select schemaname, tablename, policyname, roles, cmd, qual from pg_policies where schemaname = 'public';
```

- Ninguna política con `using (true)` ni `to public`/`anon` sobre tablas con datos de negocio.
- `access_codes`, `access_code_grants` y `access_logs` no legibles por `authenticated` no-admin.
- Funciones `security definer` con `set search_path = public`; `redeem_access_code` solo para `service_role`.
- `authenticated` carece de UPDATE directo sobre `documents.upload_status` y la política
  `documents_update` impide cambiar su valor. `finalize_document_upload` es invocable
  solo por `service_role` después de autorización y validación de bytes en servidor;
  comprueba objeto y tamaño en `storage.objects`. Probar bypass directo y doble llamada.
- Correr `npx supabase test db`: todos los tests de permisos en verde.

## 2. Secretos y separación cliente/servidor

```bash
grep -rn "SERVICE_ROLE\|ACCESS_CODE_PEPPER\|VISITOR_SESSION_SECRET" src/ --include=*.ts --include=*.tsx
grep -rn "NEXT_PUBLIC_" .env* src/ | grep -i "secret\|service\|pepper\|key"
```

- La service role solo se importa en módulos con `import "server-only"`.
- Ningún componente `"use client"` importa `lib/supabase/admin` ni `lib/auth/authorize`.
- `.env*` en `.gitignore`; existe `.env.example` sin valores reales.
- `git log -p | grep` sobre patrones de claves si hay historial previo (no debe haber secretos commiteados).

## 3. Autorización (IDOR)

Para CADA route handler y server action:
- ¿Llama a `getPrincipal()` y luego a `authorize()` (o a un chequeo de rol admin) ANTES de leer o escribir?
- ¿Toma ids del cliente (project, document, user) y los usa sin verificar pertenencia?
- ¿Responde 404 (no 403) cuando el recurso existe pero el principal no tiene acceso?
- Probar manualmente con dos usuarios: el usuario A intenta leer/modificar recursos del B por id.

## 4. Archivos y PDFs

- Ningún uso de `getPublicUrl` sobre el bucket `documents`.
- Signed URLs de 300 s como máximo, generadas después de `authorize`, con `Cache-Control: no-store`.
- Ninguna respuesta de API incluye `file_path`.
- Subida: validación de tipo por magic bytes, tamaño real y path sin nombre original.

## 5. Códigos, sesiones y autenticación

- En la BD no hay códigos en claro (`select code_hash from access_codes` solo muestra hex).
- Respuesta idéntica para código inválido/vencido/revocado/agotado.
- Rate limiting activo en canje de código y login; probar el 6º intento fallido.
- Cookie de visitante: `httpOnly`, `secure`, `sameSite`, expiración acotada, y revalidada contra la BD.
- Revocar un código corta el acceso en la request siguiente.

## 6. Superficie web

- Headers en `next.config` o middleware: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY` (o `frame-ancestors 'none'`), `Referrer-Policy`, `Permissions-Policy` y una CSP
  razonable (ojo con el worker de pdf.js: `worker-src` y `blob:` si hace falta).
- Route handlers con método POST/PUT/DELETE: verificar `Origin`/`Host` o depender de cookies `sameSite`;
  los server actions ya validan origen, no desactivar esa protección.
- Sin `dangerouslySetInnerHTML` con datos del usuario. Sin logs de tokens, códigos ni cookies.
- Errores al cliente sin stack traces ni detalles de SQL.

## 7. Dependencias y trazabilidad

```bash
npm audit --omit=dev
npm run lint && npm run typecheck && npm test
```

- `access_logs` registra login, code_redeem, view y download con ip y user_agent.
- Sin vulnerabilidades altas/críticas sin justificar en `npm audit`.

## Formato del reporte (responder siempre así)

```
## Security review — Fase N
Resultado: APROBADA | APROBADA CON OBSERVACIONES | BLOQUEADA

### Crítico (bloquea avanzar)
- [archivo:línea] hallazgo → corrección propuesta

### Alto
### Medio
### Bajo / mejoras

### Verificado OK
- lista breve de lo que se comprobó y pasó

### Comandos ejecutados y resultado
```

Criterio: cualquier hallazgo Crítico o Alto sin resolver = BLOQUEADA. No pasar a la fase siguiente.
