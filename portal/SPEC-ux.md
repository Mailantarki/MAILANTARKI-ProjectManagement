# SPEC — Experiencia de usuario: recorrido completo y mejoras

Fecha: 2026-10-06 · Alcance: todas las pantallas, del acceso al último apartado del admin, en escritorio (1440 px) y celular (390 px).

## 0. Resumen

El portal ya cubre lo esencial y se ve consistente después de las fases 1–5 de la auditoría UX:

- **Acceso:** con cuenta o con código.
- **Biblioteca y proyectos:** lista de proyectos, disciplinas, búsqueda en todas las disciplinas y filtros que se aplican solos.
- **Visor:** con título, teclado y modo celular.
- **Admin:** completo, con confirmaciones y avisos de guardado.

Las tres mejoras que más cambiarían la experiencia, en orden:

1. **Mostrar solo la revisión vigente de cada plano.** Hoy, si "A-101" tiene revisiones A, B y C, aparecen las tres como filas independientes. Quien está en obra puede abrir una revisión superada sin saberlo. Procore y Autodesk Docs resuelven esto con un "set vigente" y un historial de revisiones por plano.
2. **Avisar qué cambió.** No hay forma de saber que se publicó algo nuevo sin entrar a revisar. Hace falta un aviso "Nuevo / Actualizado" en el portal y un email opcional, como el *Drawings Log* de Procore.
3. **Admin más rápido para tareas repetitivas.**
   - Leer número y título del nombre del archivo al subir.
   - Acciones en lote: archivar, cambiar estado, destacar.
   - Buscar y paginar la lista de documentos.
   - Formularios de alta que no estén siempre abiertos.

## 1. Método

- **Recorrido real:** usé la app actual con un Supabase simulado con datos realistas (5 proyectos, 6 disciplinas, 38 documentos, 5 usuarios, 4 códigos, logs). Saqué capturas de 16 pantallas y 4 interacciones en dos tamaños; van adjuntas aparte. El visor de PDF lo probé antes con un PDF real de 3 hojas.
- **Productos comparados:**
  - Procore Drawings
  - Autodesk Docs
  - Fieldwire
  - Dalux Box
  - Box, como portal de archivos con controles de acceso
- **Limitaciones:**
  - No probé con usuarios reales.
  - Las prioridades de abajo son una estimación a partir del código y de los productos comparados.
  - Conviene validarlas con 2–3 personas que usen el portal (ver §6).

### Arreglado durante el recorrido

Los botones dentro de tablas y del panel de usuario salían como cajas blancas vacías: "Reactivate" en códigos revocados y "Assign access" en el panel de usuario. La causa era `.document-table button { background: white }` de `globals.css` combinado con el texto blanco de `.button`. Lo corregí en `src/styles/components.css`. Además, "Remove access" pasó de una barra roja de ancho completo a un botón con borde.

## 2. Qué hacen los productos similares y qué conviene copiar

| Capacidad | Dónde existe | Aplica acá | Prioridad |
|---|---|---|---|
| Set vigente: se muestra solo la última revisión de cada plano y las anteriores van al historial | Procore ("Upload Drawing Revisions", "Mark Drawings as Obsolete", "All Sets and Revisions Report") · Autodesk Docs (historial de versiones) | Sí. Hoy cada revisión es una fila (`unique(project_id, segment_id, doc_number, revision)`) | **P0** |
| Comparar revisiones (superposición en colores o lado a lado) | Procore "Compare Drawing Revisions" · Autodesk Docs | Sí, para PDFs vectoriales | P2 |
| Aviso de novedades por email al publicar planos nuevos | Procore "Subscribe to the Drawings Log" | Sí, por proyecto o disciplina | **P1** |
| Búsqueda de texto dentro del PDF (texto vectorial, sin OCR) | Procore "Search Text Within Drawings" | Sí: extraer el texto al subir y sumarlo a `search_vector` | P1 |
| Vínculos automáticos entre planos (un "A-501" dentro de un plano abre ese plano) | Procore "Automatic Drawing Sheet Linking" · Dalux (detecta por el campo Número) | Sí, más adelante | P2 |
| Pasar de un plano al siguiente deslizando, y ver revisiones anteriores deslizando hacia arriba | Fieldwire mobile | Sí: siguiente/anterior en el visor (P1); revisiones en el visor junto con el set vigente | P1 |
| Código QR impreso por plano | Procore "Generate and Print QR Codes for Drawings" (abre el plano en su app) | Sí: acá el QR apuntaría a una URL estable por número de plano, que siempre abre la revisión vigente | P2 |
| Marca de agua con el email o IP de quien ve y la hora | Box (watermarking en vista previa y descarga) | Sí, para visitantes con código y descarga habilitada | P2 |
| Registro formal de envío de documentos (transmittal) | Autodesk Docs Transmittals | Parcial: el código de acceso ya cumple ese rol; falta un "paquete de envío" con lista de documentos | P2 |
| Ingreso sin contraseña (enlace mágico o código por email) | Supabase Auth (`signInWithOtp`) | Sí: para clientes que entran pocas veces | P1 |
| Exportar el listado de planos a PDF o CSV y descargar en lote | Procore "Export the Drawings Log" y "Download Drawings" | Sí: ZIP del set vigente para usuarios con permiso de descarga | P1 |

Fuentes: ver §7.

## 3. Recorrido pantalla por pantalla

Prioridad: **P0** bloquea o induce a error · **P1** mejora clara · **P2** pulido o novedad. Esfuerzo: **S** < 1 día · **M** 1–3 días · **L** > 3 días.

### 3.1 Inicio (`/`)

**Hoy.** Título "Technical documentation", botón "Sign in" que lleva a otra página y, debajo, el campo de código con el botón "Enter access code".

| Problema | Mejora | P | Esf. |
|---|---|---|---|
| Dos caminos sin jerarquía; el botón del código repite el label | Dos tarjetas: "I have an account" (login inline) y "I have a project code" (botón "Open documents") | P1 | S |
| El código acepta cualquier formato | Mayúsculas y guion automáticos; `autocapitalize="characters"` y `spellcheck=false` | P2 | S |
| El h1 usa otro peso y el topbar otro margen que el resto de la app | Usar la misma escala tipográfica y el mismo `.unified-nav` | P2 | S |
| No explica qué es ni a quién pedir acceso | Una línea: "Ask your project manager for an account or a project code." | P2 | S |

### 3.2 Login (`/login`)

**Hoy.** Email, contraseña y "Sign in". El error aparece abajo en rojo chico.

| Problema | Mejora | P | Esf. |
|---|---|---|---|
| No hay "Forgot password?" | Recuperación con `resetPasswordForEmail` y pantalla para la nueva contraseña | **P0** | M |
| No se puede ver la contraseña | Botón de ojo en el campo | P2 | S |
| No hay vuelta al ingreso por código | Link "Have a project code?" | P2 | S |
| Clientes ocasionales olvidan la contraseña | Opción "Email me a sign-in link" con `signInWithOtp` | P1 | M |
| El error queda al final y es chico | Bloque de error arriba del formulario y foco en él | P2 | S |

### 3.3 Cambio de contraseña obligatorio (`/change-password`)

**Hoy.** Dos campos y "Save password"; el mínimo de 12 caracteres solo aparece cuando falla.

| Mejora | P | Esf. |
|---|---|---|
| Ayuda visible ("At least 12 characters") e indicador de coincidencia en vivo | P1 | S |
| Explicar por qué se pide ("Your administrator created this account with a temporary password") | P2 | S |

### 3.4 Biblioteca de proyectos (`/projects`)

**Hoy.** Grilla de 3 columnas con nombre, ubicación y "N documents · N disciplines".

| Problema | Mejora | P | Esf. |
|---|---|---|---|
| Nada indica qué cambió | Badge "3 new" y "Updated 2 days ago" (último documento listo desde la última visita del usuario) | **P1** | M |
| La portada es un círculo chico; sin portada la tarjeta se ve vacía | Portada 16:9 arriba; sin imagen, un bloque con las iniciales del proyecto | P1 | S |
| "6 disciplines" cuenta también las disciplinas sin documentos | Contar solo las disciplinas con documentos | P2 | S |
| Con un solo proyecto igual hay que elegirlo | Redirigir directo al proyecto | P2 | S |
| Sin buscador | Buscar por nombre o ubicación cuando hay más de 6 proyectos | P2 | S |
| No hay atajo a lo último que vio | Sección "Recently viewed" con los últimos 5 documentos abiertos (sale de `access_logs`) | P2 | M |

### 3.5 Proyecto (`/projects/[slug]`)

**Hoy.**
- Hero con nombre y ubicación.
- Pestañas por disciplina y "All".
- Búsqueda y filtros que se aplican solos, con chips de filtros activos.
- Tabla con título clickeable, View y Download; en celular, tarjetas.
- Paginación de a 10.

| Problema | Mejora | P | Esf. |
|---|---|---|---|
| Todas las revisiones aparecen como filas separadas | **Set vigente** por defecto: una fila por número de plano con su última revisión y un badge "Rev C · 2 earlier". Toggle "Show superseded revisions". Las revisiones anteriores se marcan "Superseded" en gris | **P0** | L |
| No se distingue lo nuevo | Badge "New" o "Updated" por documento desde la última visita | P1 | M |
| No se puede ordenar | Ordenar por número, título, revisión y fecha con `aria-sort` | P1 | S |
| De a 10 documentos por página | 25 por página y numeración de páginas | P2 | S |
| Descarga de a un documento | "Download current set (ZIP)" para quien tiene permiso, generado en el servidor con URLs firmadas | P1 | M |
| La búsqueda solo mira título y número | Indexar el texto vectorial del PDF al subir, como Procore | P1 | M |
| Exportar el listado | "Export list (CSV/PDF)" | P2 | S |

### 3.6 Visor de PDF

**Hoy.**
- Título, número y revisión en la barra.
- Página siguiente/anterior y zoom con teclado.
- Ajustar al ancho y a la página.
- Pantalla completa en escritorio; en celular, controles abajo.
- Foco atrapado en el visor.

| Problema | Mejora | P | Esf. |
|---|---|---|---|
| Hay que cerrar para abrir el plano siguiente | Flechas "Previous / Next document" dentro del listado filtrado; en celular, deslizar como Fieldwire | P1 | M |
| No muestra otras revisiones | Selector "Revision C ▾" con las anteriores (depende del set vigente) | P1 | M |
| Una página por vez | Scroll continuo con carga diferida | P2 | M |
| No hay pellizco para hacer zoom en celular | Gestos con `touch-action` y zoom del lienzo | P2 | M |
| No hay link compartible a un plano | URL `/projects/x/documents/A-101`, que siempre abre la revisión vigente y sirve para QR (P2) | P1 | M |
| Comparar revisiones | Superposición rojo/azul de dos revisiones | P2 | L |

### 3.7 Admin: Overview (`/admin`)

**Hoy.** 4 indicadores, actividad reciente y tabla de proyectos con "Manage documents" y "Upload PDFs".

| Problema | Mejora | P | Esf. |
|---|---|---|---|
| "All projects" y el eyebrow "Administration" repiten la navegación | Quitarlos; la barra de admin ya ubica | P2 | S |
| "View all access logs" se ve como texto suelto | Link con estilo de acción | P2 | S |
| Las acciones de la tabla de proyectos parecen texto | Botones o links con el estilo de acciones de tabla | P2 | S |
| Faltan alertas accionables | Tarjetas de "atención": usuarios que nunca entraron, códigos que vencen (con link para extender) y documentos en `draft` hace más de 30 días | P1 | M |
| En celular, la cuarta tarjeta queda con borde de hover después de tocarla | Aplicar `:hover` solo con `@media (hover: hover)` | P2 | S |

### 3.8 Admin: Organizations

**Hoy.** Formulario de alta siempre abierto y, por cada organización, un formulario de edición abierto con zona de logo grande y "Archive" en rojo.

| Problema | Mejora | P | Esf. |
|---|---|---|---|
| Cada fila es un formulario editable con su propia zona de logo: mucho ruido | Lista compacta (logo, nombre, N proyectos, N usuarios) y "Edit" en un panel lateral como el de Usuarios | P1 | M |
| El alta ocupa media pantalla | Botón "New organization" que abre el mismo panel | P1 | S |
| Desalineación entre el label "Name" y la zona de logo | Se resuelve con el panel lateral | P2 | S |

### 3.9 Admin: Projects

**Hoy.** Formulario de alta en línea (Organization, Name, Slug, Location) y tarjetas con "Manage documents", "Upload PDFs", "Archive" y un "Edit project" desplegable.

| Problema | Mejora | P | Esf. |
|---|---|---|---|
| "Slug" es un concepto técnico | Generarlo a partir del nombre y mostrarlo como "Web address: /projects/maylan-plaza" editable | P1 | S |
| "Archive" tiene el mismo estilo que los links | Estilo de peligro, separado de las acciones normales | P1 | S |
| Las tarjetas no muestran datos | Portada, N documentos, N usuarios con acceso y última subida | P2 | S |
| "Edit project" desplegable dentro de la tarjeta | Panel lateral, igual que Organizations | P2 | M |

### 3.10 Admin: Documentos del proyecto

**Hoy.** Tabla con todos los documentos (38 en el ejemplo) sin buscador ni paginación, y por fila: estrella, editar y "Archive" en rojo.

| Problema | Mejora | P | Esf. |
|---|---|---|---|
| Sin búsqueda, filtros ni paginación | Reusar `FilterForm` del portal: búsqueda, disciplina, estado y paginación | **P1** | M |
| Archivar o cambiar estado de a uno | Selección múltiple con acciones en lote: archivar, cambiar estado, destacar y mover de disciplina | **P1** | M |
| "Upload PDFs" se ve como texto gris | Botón principal arriba a la derecha | P2 | S |
| Un "Archive" rojo por fila genera ruido | Menú "⋯" por fila con Edit, Archive y Replace file | P2 | S |
| Las revisiones no se agrupan | Igual que en el portal: agrupar por número y "Upload new revision" desde la fila | P0 (con §3.5) | L |

### 3.11 Admin: Subir PDFs

**Hoy.** Zona para arrastrar archivos, "Discipline for all files" y una tarjeta por archivo con Title, Number, Discipline, Type, Revision, Status, Issue date y Description, más "Upload N files".

| Problema | Mejora | P | Esf. |
|---|---|---|---|
| El número sale del nombre completo ("A-101-GROUND-FLOOR-PLAN") | Leer `NÚMERO[_ -]TÍTULO[_ -]REV` del nombre: "A-101 Ground floor plan Rev B.pdf" → número A-101, título Ground floor plan, revisión B | **P1** | S |
| Solo la disciplina se aplica a todos | "Apply to all" para Type, Status, Revision e Issue date | P1 | S |
| El número duplicado (mismo número y revisión) recién se detecta al subir | Avisarlo apenas se carga el archivo, con la opción "Upload as revision D" | P1 | M |
| La revisión arranca en "0" sin saber cuál era la última | Sugerir la siguiente revisión si el número ya existe | P1 | S |
| El select "Discipline for all files" no tiene el estilo del resto | Usar el estilo de campo común | P2 | S |
| Nada avisa a los usuarios | Checkbox "Notify people with access" que dispara el email de novedades (§3.4) | P1 | M |

### 3.12 Admin: Users y panel de usuario

**Hoy.** Filtros con "Apply filters", tabla (tarjetas en celular) y panel lateral con accesos, asignación y suspensión.

| Problema | Mejora | P | Esf. |
|---|---|---|---|
| "1 projects" | Plural correcto | P1 | S |
| Hay que apretar "Apply filters" | Que se apliquen solos, como en el portal (`FilterForm`) | P1 | S |
| Asignar accesos es de a un proyecto o disciplina | Elegir varios proyectos o disciplinas en un paso | P2 | M |
| No se puede reenviar la invitación ni resetear la contraseña | "Resend invite" y "Send password reset" en el panel | P1 | M |
| En celular, los badges de estado ocupan todo el ancho y las tarjetas son muy largas | Badge de ancho automático y tarjeta compacta (nombre, rol, estado, "Manage") | P2 | S |
| No se ve la actividad del usuario en el panel | Últimos 5 accesos del usuario (hoy hay que ir a Logs) | P2 | S |

### 3.13 Admin: Access codes

**Hoy.** Formulario de alta siempre abierto (organización, etiqueta, vencimiento, usos, descarga, accesos), tabla de códigos con chips de accesos, Revoke/Reactivate y borrar. El código se muestra una sola vez.

| Problema | Mejora | P | Esf. |
|---|---|---|---|
| El formulario de alta ocupa la pantalla | Botón "New code" que abre un panel | P1 | S |
| Al crear solo se puede copiar el código | Pantalla de éxito con "Copy code", "Copy invitation" (texto con link al portal, código y vencimiento) y "Email it" | **P1** | S |
| Los códigos vencidos todavía ofrecen "Revoke" | Para vencidos, "Extend" (nuevo vencimiento); "Revoke" solo para activos | P1 | S |
| "12 / 50" se corta en dos líneas | Barra de uso o `white-space: nowrap` | P2 | S |
| En celular la tabla scrollea horizontalmente | Tarjetas, como en Users | P1 | S |
| Sin buscador ni filtro por estado | Filtro Active/Expired/Revoked y búsqueda por etiqueta | P2 | S |
| Sin marca de agua para visitantes | Marca de agua con etiqueta del código y hora en vista y descarga, opcional por código | P2 | L |

### 3.14 Admin: Access logs

**Hoy.** Siete filtros en dos filas, tabla de accesos, tabla de actividad administrativa y exportación CSV.

| Problema | Mejora | P | Esf. |
|---|---|---|---|
| Los filtros ocupan dos filas y piden "Filter" | Búsqueda de texto (usuario, documento o número) y rango de fechas visibles; el resto en el panel "Filters"; aplicar solos | P1 | S |
| "Document ID" pide un UUID | Buscar por título o número de documento | P1 | S |
| Lista plana sin agrupar | Agrupar por día ("Today", "Yesterday", fecha) | P2 | S |
| Cada fila no lleva a ningún lado | Clic en actor → filtrar por esa persona; clic en documento → abrir el visor | P2 | S |
| En celular la tabla scrollea horizontalmente | Tarjetas o lista de dos líneas | P1 | S |
| Accesos y actividad administrativa en la misma página, una debajo de la otra | Pestañas "Portal access" / "Admin activity" | P2 | S |

### 3.15 Transversal

| Tema | Mejora | P | Esf. |
|---|---|---|---|
| Idioma | Definir inglés, español o bilingüe. Si es bilingüe, mover todos los textos a `lib/copy.ts` por idioma y agregar un selector en el topbar | P1 | M |
| Navegación en celular (admin) | Las 6 secciones scrollean horizontalmente; pasar a un menú con ícono o barra inferior | P2 | M |
| Cuenta | Menú de usuario (nombre, rol, "Change password", "Sign out") en lugar de "Sign out" suelto | P2 | S |
| Formularios de alta siempre abiertos (Organizations, Projects, Codes) | Un solo patrón: botón principal arriba a la derecha que abre el panel lateral de `UserDialog` | P1 | M |
| Tablas en celular | Usar `responsive-table` en Codes y Logs, como ya hacen Users y Documentos | P1 | S |
| Hover en táctil | Agrupar los `:hover` bajo `@media (hover: hover)` | P2 | S |

## 4. Cambios de modelo de datos necesarios

1. **Set vigente (P0):**
   - Vista `current_documents` (o columna `is_current` mantenida por trigger) con la última revisión por `(project_id, segment_id, doc_number)`, ordenando por `issue_date` y luego `created_at`.
   - Las listas del portal consultan esa vista por defecto; `?revisions=all` muestra también las anteriores.
2. **Última visita (P1):** tabla `user_project_visits(user_id, project_id, last_seen_at)`, actualizada al entrar al proyecto. "New" = documentos con `created_at > last_seen_at`. Para visitantes, guardar el dato en una cookie firmada.
3. **Suscripciones (P1):**
   - Tabla `document_subscriptions(user_id, project_id, segment_id null)`.
   - Al finalizar una subida, se encola un email con el resumen de novedades. Procore lo envía apenas se publican planos nuevos; acá conviene agrupar las subidas de un mismo lote en un solo email.
4. **Texto del PDF (P1):** extraer el texto con `pdfjs-dist` en `finalizeUpload` (servidor), guardarlo en `documents.content_text` y sumarlo a `search_vector` con un peso menor.
5. **URL estable por plano (P1):** `/projects/[slug]/documents/[docNumber]` resuelve la revisión vigente. Es la base para compartir links y para los QR.

## 5. Plan sugerido

| Fase | Contenido | Resultado esperado |
|---|---|---|
| A · 1 semana | Recuperar contraseña; plural y filtros automáticos en Users; Codes y Logs en tarjetas en celular; pantalla de éxito de código con invitación; "Extend" para vencidos; leer número, título y revisión del nombre de archivo; slug automático | Menos consultas de soporte y menos pasos en admin |
| B · 2 semanas | Set vigente (modelo, portal, admin y visor con selector de revisión); URL estable por plano; "Upload new revision" | Nadie abre una revisión superada por error |
| C · 1–2 semanas | Badges "New/Updated", suscripción por email y "Notify people with access" al subir; "Recently viewed" | Los usuarios se enteran de lo nuevo sin buscarlo |
| D · 2 semanas | Búsqueda en el texto del PDF; ZIP del set vigente; documento siguiente/anterior en el visor; acciones en lote en admin | Encontrar y entregar documentos más rápido |
| E · a definir | Comparar revisiones; QR por plano; marca de agua; vínculos automáticos entre planos; idioma | Diferenciales frente a un portal de archivos genérico |

## 6. Validación sugerida antes de la fase B

Tres sesiones cortas (20 min) con roles distintos: alguien en obra que usa el celular, un consultor externo con código y un administrador de la organización.

Tareas:
1. "Encontrá la última revisión del plano de fachada norte."
2. "Descargá todos los planos de estructura vigentes."
3. "Dale acceso a un contratista solo a MEP por 2 semanas."

Medir el tiempo y los errores. Confirmar si el set vigente y los avisos son las prioridades reales.

## 7. Fuentes

- Procore, tutoriales de Drawings (set, revisiones, búsqueda, QR, export, suscripción): https://v2.support.procore.com/en-gb/product-manuals/drawings-project/tutorials
- Procore, Search Text Within Drawings: https://support.procore.com/products/online/user-guide/project-level/drawings/tutorials/search-text-within-drawings
- Procore, Automatic Drawing Sheet Linking: https://support.procore.com/products/online/user-guide/project-level/drawings/tutorials/automatic-drawing-sheet-linking
- Procore, Compare Documents (superposición y lado a lado): https://support.procore.com/products/online/user-guide/project-level/document-management/tutorials/compare-documents-in-the-document-management-tool
- Procore, Subscribe to the Drawings Log: https://support.procore.com/products/online/user-guide/project-level/drawings/tutorials/subscribe-to-the-drawings-log
- Procore, QR Codes for Drawings: https://support.procore.com/products/online/user-guide/project-level/drawings/tutorials/generate-and-print-qr-codes-for-drawings
- Autodesk Docs, resumen de funciones (versiones, comparación, permisos por carpeta): https://www.cad-notes.com/getting-to-know-autodesk-docs/
- Autodesk Docs, Transmittals: https://help.autodesk.com/cloudhelp/ENU/Docs-Transmittals/files/Transmittals.html
- Fieldwire, uso en celular (deslizar entre planos y versiones, búsqueda, offline): https://www.fieldwire.com/support/fieldwire-on-mobile
- Dalux, hipervínculos entre planos y documentos: https://support.dalux.com/hc/en-us/articles/7492038354844
- Box, marca de agua: https://support.box.com/hc/en-us/articles/360044195253
- Supabase, ingreso sin contraseña: https://supabase.com/docs/guides/auth/auth-email-passwordless

## 8. Plan de ejecución

Una PR por fase. En cada fase, primero las migraciones (`supabase db push`) y después el código. Calculo unas 7–8 semanas para una persona.

### Decisiones previas
1. **Idioma:** ✅ decidido el 2026-10-06, la interfaz queda en inglés. Todos los textos nuevos se escriben en inglés y la §3.15 (selector de idioma) queda descartada.
2. **Proveedor de email** (SMTP de Supabase, Resend o Postmark): antes de la fase C. El SMTP incluido en Supabase Cloud tiene un límite bajo de envíos por hora y no sirve para producción.
3. **Revisión vigente:** la marca explícitamente "Upload new revision". No se deduce ordenando letras ni fechas.

### Fase A · Mejoras rápidas (1 semana, sin cambios de base)
- "Forgot password?" → `/forgot-password` → email → `/auth/confirm` → `/reset-password`. Sin revelar si el email existe y con rate limit.
- Users: plural correcto y filtros que se aplican solos.
- Codes y Logs en tarjetas en celular.
- Códigos: alta en panel lateral, pantalla de éxito con "Copy invitation", "Extend" para vencidos y "Revoke" solo para activos.
- Subir PDFs: número, título y revisión leídos del nombre del archivo; "Apply to all" para tipo, estado, revisión y fecha.
- Projects: slug generado a partir del nombre.
- **Cierre:** e2e actualizados en verde y capturas de escritorio y celular.

### Fase B · Revisión vigente (2 semanas)
1. Migración: `is_current` y `superseded_at` en `documents`, índice parcial por `(project_id, segment_id, doc_number) where is_current` y backfill en modo prueba con listado para revisar. pgTAP: una sola revisión vigente por número.
2. "Upload new revision" desde la fila; `finalize_document_upload` marca la anterior como superada en la misma transacción.
3. Portal: solo lo vigente por defecto, badge "Rev C · 2 earlier" y "Show superseded revisions". `document_counts` cuenta solo lo vigente.
4. Visor: selector de revisión y marca "Superseded".
5. Link fijo `/projects/[slug]/documents/[docNumber]` que abre siempre la vigente.
6. Admin: agrupar por número y marcar manualmente cuál es la vigente.
- **Cierre:** el test de integración cubre subir A, subir B y ver solo B, con A en el historial; en e2e, el link fijo abre B.

### Fase C · Avisos (1–2 semanas, requiere la decisión 2)
- Tablas `user_project_visits` y `document_subscriptions`.
- Badges "New / Updated" y "Recently viewed".
- Casilla "Notify people with access" al subir; un solo email por lote.
- **Cierre:** al subir 3 PDFs llega un único email, solo a quienes tienen acceso a esas disciplinas.

### Fase D · Encontrar y entregar (2 semanas)
- Texto del PDF en `content_text` y en `search_vector`, con script para los documentos existentes.
- ZIP del set vigente, registrado en los logs.
- Documento anterior/siguiente en el visor.
- Acciones en lote, buscador y paginación en el admin de documentos.

### Fase E · Diferenciales
- Comparar revisiones.
- QR por plano (usa el link fijo de la fase B).
- Marca de agua para visitantes.
- Vínculos automáticos entre planos.

### Orden y riesgos
- **Dependencias:** A es independiente. B necesita la decisión 3; C, el ZIP y el QR se apoyan en B. C necesita la decisión 2.
- **Validar antes de B:** 2–3 sesiones con usuarios reales (§6).
- **Mayor riesgo:** el backfill de revisiones vigentes. Se corre primero en modo prueba con listado para revisar.
