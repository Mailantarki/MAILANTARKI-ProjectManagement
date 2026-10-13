---
name: access-code-flow
description: Usar al implementar o tocar los códigos de acceso del portal: generarlos en el admin, hashearlos, canjearlos desde la landing ("Enter access code"), validar vencimiento/usos/revocación, rate limiting de intentos, sesión de visitante (cookie) y sus permisos. Aplica ante cualquier mención de código de acceso, access code, invitación, visitante, acceso temporal o "ingresar con código".
---

# Códigos de acceso

Un código habilita, en modo solo lectura, ciertos proyectos y segmentos (`access_code_grants`).
Los visitantes NO son usuarios de Supabase Auth: se resuelven siempre en servidor.

## 1. Generación (solo admin, en servidor)

```ts
import { randomInt, createHmac } from "node:crypto";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 símbolos, sin 0/O/1/I

export function generateCode(len = 10) {
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[randomInt(ALPHABET.length)]; // CSPRNG
  return `${s.slice(0, 5)}-${s.slice(5)}`; // legible: XXXXX-XXXXX
}

export function hashCode(code: string) {
  const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return createHmac("sha256", process.env.ACCESS_CODE_PEPPER!).update(normalized).digest("hex");
}
```

Decisión de diseño (mantenerla): se usa HMAC-SHA256 con un pepper del servidor en vez de bcrypt/argon2
porque el código es aleatorio de alta entropía (10 símbolos de 32 = 50 bits) y necesitamos buscarlo por
igualdad indexada (`where code_hash = $1`). Un hash con sal aleatoria por fila obligaría a recorrer toda
la tabla. La defensa contra fuerza bruta es el rate limiting (sección 3), no el costo del hash.

- `ACCESS_CODE_PEPPER`: secreto de 32+ bytes, solo en variables de entorno del servidor.
- Guardar en `access_codes`: `code_hash`, `label`, `expires_at`, `max_uses`, `allow_download`, `created_by`.
- Mostrar el código en claro UNA sola vez, en la respuesta de creación. Nunca guardarlo ni loguearlo.
- Crear los `access_code_grants` en la misma transacción. `segment_id` nulo = todos los segmentos del proyecto.
- Revocar = `is_active = false`. Debe tener efecto inmediato (ver sección 4).

## 2. Canje (POST /api/access-code/redeem)

1. Validar el body con zod (string, longitud razonable). Aplicar rate limit ANTES de tocar la BD.
2. Calcular `hashCode(code)` y llamar a la función SQL atómica:

```sql
create or replace function public.redeem_access_code(p_hash text)
returns table (id uuid, allow_download boolean, label text)
language sql security definer set search_path = public as $$
  update access_codes
     set uses_count = uses_count + 1
   where code_hash = p_hash
     and is_active
     and (expires_at is null or expires_at > now())
     and (max_uses is null or uses_count < max_uses)
  returning id, allow_download, label;
$$;
revoke execute on function public.redeem_access_code(text) from public, anon, authenticated;
grant execute on function public.redeem_access_code(text) to service_role;
```

   El `update ... where` atómico evita que dos canjes simultáneos superen `max_uses`.
3. Si no devuelve fila: responder siempre el MISMO mensaje genérico ("Invalid or expired code") para
   código inexistente, revocado, vencido o agotado. No dar pistas.
4. Si devuelve fila: crear la sesión (sección 4), registrar `code_redeem` en `access_logs` y devolver
   `{ redirectTo: "/projects" }`.

## 3. Rate limiting

- Por IP: máximo 5 intentos fallidos cada 15 minutos; luego 429 con `Retry-After`.
- Adicional global suave para frenar ataques distribuidos.
- En Vercel la memoria no se comparte entre invocaciones: usar Upstash Ratelimit, o una tabla
  `auth_attempts (ip, created_at)` con limpieza periódica. No usar un Map en memoria.
- IP: primer valor de `x-forwarded-for`. Contar solo los fallos (o todos, pero con el límite ajustado).
- El login por email/contraseña tiene su propio límite (además del de Supabase).

## 4. Sesión de visitante

- Cookie `visitor_session`: JWT firmado (librería `jose`, HS256, secreto `VISITOR_SESSION_SECRET`),
  con `{ sid: <access_code_id> }` y `exp` = mínimo entre 8 h y el vencimiento del código.
- Flags: `httpOnly`, `secure`, `sameSite: "lax"`, `path: "/"`.
- El JWT NO contiene permisos. En cada request se valida la firma y se relee de la BD que el código siga
  activo, no vencido, y se cargan sus grants. Así revocar un código corta el acceso al instante.
  Si el código ya no es válido: borrar la cookie y tratar como no autenticado.
- El visitante nunca accede a `/admin` ni a acciones de escritura.
- `getPrincipal()` (ver skill `pdf-signed-url-access`) devuelve `{ kind: "visitor", accessCodeId }`.

## 5. UI

- Landing: botones "Sign in" y "Enter access code". El input acepta pegado con o sin guion y en minúsculas.
- Admin: crear (elige proyectos/segmentos, vencimiento, máx. usos, descarga), listar con usos y estado,
  revocar/reactivar. El código en claro aparece en un diálogo con botón "Copy" y aviso de que no se
  volverá a mostrar.

## Tests obligatorios

1. Código válido: canjea, crea cookie, `/projects` muestra solo lo habilitado.
2. Código vencido / revocado / agotado: mismo error genérico.
3. Revocar tras haber canjeado: la siguiente request del visitante ya no tiene acceso.
4. Dos canjes concurrentes con `max_uses = 1`: solo uno tiene éxito.
5. 6º intento fallido desde la misma IP -> 429.
6. En la BD no existe ningún código en texto plano y los logs no lo contienen.
