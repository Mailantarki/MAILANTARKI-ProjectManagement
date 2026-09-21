---
name: pdf-viewer-react
description: Usar al construir o modificar el visor de PDF del portal (react-pdf / pdf.js en Next.js) y la página de listado de documentos con filtros: paginación, zoom, ajustar al ancho, pantalla completa, miniaturas, marca de agua, botón de descarga condicional, y filtros sincronizados con la URL. Aplica ante cualquier mención de visor, viewer, "ver el plano", preview de PDF, zoom, filtros de documentos o tabla de documentos.
---

# Visor de PDF y listado con filtros

## Visor

Librería: `react-pdf` (usa pdf.js). Es un componente SOLO de cliente.

### Setup en Next.js (App Router)

```tsx
// src/components/pdf/PdfViewer.tsx
"use client";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();
```

- Importarlo con `next/dynamic` y `ssr: false` desde el componente que lo abre.
- No instalar `pdfjs-dist` con una versión distinta de la que `react-pdf` trae como dependencia:
  una discrepancia rompe el worker. Si falla el worker, revisar primero las versiones.
- Si el build no resuelve el worker, copiarlo a `public/` como último recurso.

### Obtención de la URL

El visor recibe el `documentId`, NO una URL. Al montar (y al recibir un error de carga):

1. `fetch(\`/api/documents/${id}/url\`)` -> `{ url, allowDownload, watermark }`.
2. Pasar `url` a `<Document file={url}>`.
3. Si la carga falla (URL expirada, red), pedir una URL nueva UNA vez y reintentar; si vuelve a fallar,
   mostrar un estado de error con botón "Retry".
4. Las URLs duran 5 minutos: para sesiones largas, renovar antes de que expire al navegar entre páginas.

### Funcionalidades mínimas

- Navegación: anterior / siguiente / ir a página N, atajos de teclado (← →, +, -).
- Zoom (50% a 300%) y "Fit to width" (default), recalculado con `ResizeObserver` del contenedor.
- Pantalla completa con la Fullscreen API.
- Renderizar solo la página visible (o virtualizar si se hace scroll continuo) para no colgar el navegador
  con planos pesados. Los planos suelen ser hojas grandes: probar con PDFs de varios MB.
- Miniaturas laterales opcionales (renderizar en baja escala y de forma diferida).
- Estados: cargando (skeleton), error, PDF vacío.
- Accesible: botones con `aria-label`, foco visible, se cierra con Esc si está en modal.

### Descarga y marca de agua

- Mostrar el botón "Download" solo si `allowDownload === true`. Al pulsarlo, pedir una URL nueva con
  `?download=1` (así queda registrado y autorizado en servidor). No reutilizar la URL de visualización.
- Marca de agua: superponer el texto `watermark` (email o etiqueta del código, más fecha) en diagonal
  y repetido sobre cada página, con `pointer-events: none` y baja opacidad.
- Deshabilitar el menú contextual en el canvas es un disuasivo menor, no una protección.

Aclarar en el README: un visor en el navegador no puede impedir que alguien capture la pantalla
o guarde lo que ve. La marca de agua y el registro de accesos son disuasivos y trazabilidad;
la protección real es no dar acceso a quien no corresponde (ver skill `pdf-signed-url-access`).

## Página de proyecto: listado y filtros

Ruta `/projects/[slug]`.

- Pestañas por segmento, mostrando SOLO los segmentos autorizados para el principal.
- Tabla ordenable con: título, número de documento, tipo, revisión, estado, fecha, tamaño y botón "View".
- Filtros: segmento, tipo (`plan, section, elevation, detail, specification, schedule, report, other`),
  estado (`draft, for review, issued for construction, as-built`), revisión, rango de fechas,
  búsqueda de texto por título o número.
- Los filtros viven en la URL (`searchParams`) para poder compartir la vista. Validarlos con zod y
  ignorar valores inválidos en lugar de romper.
- Filtrar y paginar en el servidor (consulta a la BD), no traer todo y filtrar en el cliente.
- La consulta se hace con el cliente del usuario (para que RLS aplique) o, para visitantes, con el
  cliente admin PERO acotando por los grants del código (nunca una consulta sin filtro de acceso).
- Tamaño de página 25 y controles de paginación; orden por defecto: `issue_date desc`.
- Estados vacíos claros ("No documents match these filters") y botón "Clear filters".
- Mostrar el conteo de documentos por segmento en cada pestaña.

## Verificación

1. Abrir un plano grande: no se congela y el zoom es fluido.
2. Esperar más de 5 minutos con el visor abierto y cambiar de página: se renueva la URL sin error visible.
3. Un visitante sin permiso de descarga no ve el botón y `?download=1` por API responde 404.
4. Copiar la URL de la página con filtros y abrirla en otra sesión con acceso: muestra la misma vista.
