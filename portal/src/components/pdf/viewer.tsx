"use client";
import "./polyfills";
import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type TouchEvent as ReactTouchEvent, type TouchList as ReactTouchList } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Download, Maximize, Minimize, Minus, Plus, RotateCw, X } from "lucide-react";
import type { ViewerDocument } from "./launcher";
import type { RevisionSummary } from "@/app/api/documents/[id]/revisions/route";
import { formatDate } from "@/lib/format";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// The legacy worker bundles its own polyfills, so older Safari and Chrome can parse PDFs too.
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
type Ticket = { url: string; expiresIn: number; allowDownload: boolean };
type Fit = "width" | "page";
const FOCUSABLE = "button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";

export default function PdfViewer({ document: initial, onClose, siblings = [] }: {
  document: ViewerDocument; onClose: () => void;
  /** The drawings listed on the page, for previous/next drawing. */
  siblings?: ViewerDocument[];
}) {
  // `base` is the listed drawing; the revision picker can switch `doc` to another revision of its number.
  const [base, setBase] = useState(initial);
  const [doc, setDoc] = useState(initial);
  const [revisions, setRevisions] = useState<{ docNumber: string; list: RevisionSummary[] } | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [error, setError] = useState("");
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState<Fit>("width");
  // Measured before the first page is drawn, so the page is never drawn at a guessed size first.
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  // Which page (document:page) has finished drawing; until then the spinner covers the stage.
  const [drawn, setDrawn] = useState("");
  const [aspect, setAspect] = useState(1.414);
  const [progress, setProgress] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const canFullscreen = typeof document !== "undefined" && document.fullscreenEnabled;
  const stage = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const retried = useRef(false);
  const titleId = `viewer-title-${initial.id}`;
  const position = siblings.findIndex((s) => s.id === base.id);
  const previousDrawing = position > 0 ? siblings[position - 1] : undefined;
  const nextDrawing = position >= 0 && position < siblings.length - 1 ? siblings[position + 1] : undefined;
  const openDrawing = useCallback((target: ViewerDocument | undefined) => {
    if (!target) return;
    retried.current = false;
    setTicket(null); setPages(0); setPage(1); setProgress(0); setError(""); setRevisions(null); setZoom(1);
    setBase(target); setDoc(target);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/documents/${base.id}/revisions`, { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((body: { docNumber: string; revisions: RevisionSummary[] } | null) => {
        if (body) setRevisions({ docNumber: body.docNumber, list: body.revisions });
      })
      .catch(() => undefined); // the picker is optional; the document still opens
    return () => controller.abort();
  }, [base.id]);
  const activeRevision = revisions?.list.find((r) => r.id === doc.id);
  const currentRevision = revisions?.list.find((r) => r.isCurrent);
  const superseded = activeRevision && !activeRevision.isCurrent;
  const openRevision = (id: string) => {
    const target = revisions?.list.find((r) => r.id === id);
    if (!target || target.id === doc.id) return;
    retried.current = false;
    setTicket(null); setPages(0); setPage(1); setProgress(0);
    setDoc({ id: target.id, title: target.title, subtitle: `${revisions!.docNumber} · Rev ${target.revision}` });
  };

  const reload = useCallback(async () => {
    setError("");
    try {
      const response = await fetch(`/api/documents/${doc.id}/url?download=0`, { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to open this document.");
      setTicket(await response.json() as Ticket);
    } catch { setError("Unable to open this document."); }
  }, [doc.id]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void reload(); }, 0);
    return () => window.clearTimeout(timer);
  }, [reload]);
  // The signed URL is only needed to start loading. Renewing it on a timer remounted the
  // document and re-downloaded the whole PDF; renew once only if loading actually fails.
  const loadFailed = () => {
    if (retried.current) { setError("Unable to open this document."); return; }
    retried.current = true;
    void reload();
  };

  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = (width: number, height: number) => {
      if (width < 50) return; // not laid out yet
      setBox((old) => {
        const next = { width: Math.max(200, Math.round(width - 32)), height: Math.max(200, Math.round(height - 32)) };
        return old && old.width === next.width && old.height === next.height ? old : next;
      });
    };
    measure(element.clientWidth, element.clientHeight);
    const observer = new ResizeObserver(([entry]) => measure(entry.contentRect.width, entry.contentRect.height));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const change = () => setFullscreen(document.fullscreenElement === stage.current);
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);

  // Modal behaviour: focus moves into the viewer, Tab stays inside, focus returns to the trigger on close.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; previous?.focus?.(); };
  }, []);

  // Loading the PDF can drop focus to <body>; pull it back so keyboard and screen-reader users stay in the dialog.
  useEffect(() => {
    if (stage.current && !stage.current.contains(document.activeElement)) closeButton.current?.focus();
  }, [ticket, pages, error]);

  const toggleFullscreen = useCallback(() => {
    if (!canFullscreen) return;
    if (document.fullscreenElement) void document.exitFullscreen(); else void stage.current?.requestFullscreen();
  }, [canFullscreen]);

  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.fullscreenElement) { onClose(); return; }
      if (event.key === "Tab" && stage.current) {
        const items = [...stage.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (!items.length) return;
        const first = items[0], last = items.at(-1)!;
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "ArrowRight" || event.key === "PageDown") setPage((p) => Math.min(pages || p, p + 1));
      else if (event.key === "ArrowLeft" || event.key === "PageUp") setPage((p) => Math.max(1, p - 1));
      else if (event.key === "+" || event.key === "=") setZoom((z) => Math.min(3, z + .25));
      else if (event.key === "-") setZoom((z) => Math.max(.5, z - .25));
      else if (event.key === "f" || event.key === "F") toggleFullscreen();
      else if ((event.key === "j" || event.key === "J") && nextDrawing) openDrawing(nextDrawing);
      else if ((event.key === "k" || event.key === "K") && previousDrawing) openDrawing(previousDrawing);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [onClose, pages, toggleFullscreen, nextDrawing, previousDrawing, openDrawing]);

  // Touch: swipe sideways to change drawing (at fit zoom), pinch to zoom.
  const touch = useRef<{ x: number; y: number; distance: number; zoom: number } | null>(null);
  const spread = (list: ReactTouchList) => Math.hypot(list[0].clientX - list[1].clientX, list[0].clientY - list[1].clientY);
  const touchStart = (event: ReactTouchEvent) => {
    const t = event.touches;
    touch.current = { x: t[0].clientX, y: t[0].clientY, distance: t.length === 2 ? spread(t) : 0, zoom };
  };
  const touchMove = (event: ReactTouchEvent) => {
    const start = touch.current;
    if (!start || event.touches.length !== 2 || !start.distance) return;
    const next = Math.min(3, Math.max(.5, start.zoom * spread(event.touches) / start.distance));
    setZoom(Math.round(next * 20) / 20);
  };
  const touchEnd = (event: ReactTouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start || start.distance || zoom > 1 || event.changedTouches.length !== 1) return;
    const dx = event.changedTouches[0].clientX - start.x, dy = event.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * .6) return;
    openDrawing(dx < 0 ? nextDrawing : previousDrawing);
  };

  const download = async () => {
    try {
      const response = await fetch(`/api/documents/${doc.id}/url?download=1`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const fresh = await response.json() as Ticket;
      window.location.assign(fresh.url);
    } catch { setError("Unable to download this document."); }
  };
  const baseWidth = box ? (fit === "page" ? Math.min(box.width, box.height * aspect) : box.width) : 0;
  const loadingText = progress > 0 && progress < 100 ? `Loading document… ${progress}%` : "Loading document…";
  const pageKey = `${doc.id}:${page}`;
  const ready = drawn === pageKey;
  const spinner = (text: string) => <div className="viewer-loading" role="status"><span className="spinner" aria-hidden />{text}</div>;

  return <div className="viewer-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="viewer" ref={stage} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="viewer-toolbar">
        <div className="viewer-heading"><strong id={titleId}>{doc.title}</strong>
          {revisions && revisions.list.length > 1
            ? <label className="viewer-revision"><span className="sr-only">Revision</span>
              <select value={doc.id} onChange={(event) => openRevision(event.target.value)}>
                {revisions.list.map((r) => <option key={r.id} value={r.id}>
                  {revisions.docNumber} · Rev {r.revision} · {r.isCurrent ? "Current" : "Superseded"}</option>)}
              </select></label>
            : doc.subtitle && <span>{doc.subtitle}</span>}</div>
        <div className="viewer-controls">
          <button title="Previous page (←)" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={18} /></button>
          <span aria-live="polite">{page} / {pages || "-"}</span>
          <button title="Next page (→)" aria-label="Next page" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight size={18} /></button>
          <span className="viewer-divider" aria-hidden />
          <button title="Zoom out (-)" aria-label="Zoom out" disabled={zoom <= .5} onClick={() => setZoom(Math.max(.5, zoom - .25))}><Minus size={18} /></button>
          <span className="viewer-zoom">{Math.round(zoom * 100)}%</span>
          <button title="Zoom in (+)" aria-label="Zoom in" disabled={zoom >= 3} onClick={() => setZoom(Math.min(3, zoom + .25))}><Plus size={18} /></button>
          <button className={`viewer-fit${fit === "width" ? " active" : ""}`} aria-pressed={fit === "width"} onClick={() => { setFit("width"); setZoom(1); }}>Fit width</button>
          <button className={`viewer-fit${fit === "page" ? " active" : ""}`} aria-pressed={fit === "page"} onClick={() => { setFit("page"); setZoom(1); }}>Fit page</button>
          {canFullscreen && <button className="viewer-fullscreen" title={fullscreen ? "Exit full screen (F)" : "Full screen (F)"} aria-label={fullscreen ? "Exit full screen" : "Full screen"} onClick={toggleFullscreen}>{fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}</button>}
          {ticket?.allowDownload && <button title="Download" aria-label="Download" onClick={() => void download()}><Download size={18} /></button>}
          <button ref={closeButton} title="Close (Esc)" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
      </div>
      {siblings.length > 1 && position >= 0 && <nav className="viewer-drawings" aria-label="Drawings in this list">
        <button type="button" disabled={!previousDrawing} onClick={() => openDrawing(previousDrawing)} title="Previous drawing (K)"><ArrowLeft size={16} aria-hidden />Previous drawing</button>
        <span aria-live="polite">{position + 1} of {siblings.length}</span>
        <button type="button" disabled={!nextDrawing} onClick={() => openDrawing(nextDrawing)} title="Next drawing (J)">Next drawing<ArrowRight size={16} aria-hidden /></button>
      </nav>}
      {superseded && <div className="viewer-superseded" role="status">
        <span>This revision was superseded{activeRevision.supersededAt ? ` on ${formatDate(activeRevision.supersededAt)}` : ""}.</span>
        {currentRevision && <button type="button" className="button" onClick={() => openRevision(currentRevision.id)}>Open Rev {currentRevision.revision}</button>}
      </div>}
      <div className="viewer-stage" ref={viewport} onTouchStart={touchStart} onTouchMove={touchMove} onTouchEnd={touchEnd}>
        {error ? <div className="viewer-message" role="alert">{error} <button className="button secondary" onClick={() => { retried.current = false; void reload(); }}><RotateCw size={16} aria-hidden /> Retry</button></div>
          : <>
            {!ready && spinner(pages ? "Loading page…" : loadingText)}
            {/* Anything in the PDF layer that suspends shows the spinner here, never the whole dialog. */}
            {ticket && box && <Suspense fallback={null}><div className={`pdf-page${ready ? "" : " is-pending"}`}>
              <Document file={ticket.url}
                onLoadProgress={({ loaded, total }) => { if (total) setProgress(Math.round(loaded / total * 100)); }}
                onLoadSuccess={({ numPages }) => { retried.current = false; setPages(numPages); setPage((p) => Math.min(p, numPages)); }}
                onLoadError={loadFailed} loading={null}>
                <Page pageNumber={page} width={Math.round(baseWidth * zoom)} loading={null}
                  onLoadSuccess={(p) => { if (p.originalHeight) setAspect(p.originalWidth / p.originalHeight); }}
                  onRenderSuccess={() => setDrawn(pageKey)} />
              </Document>
              {superseded && pages > 0 && <div className="superseded-mark" aria-hidden>SUPERSEDED</div>}
            </div></Suspense>}
          </>}
      </div>
    </div>
  </div>;
}
