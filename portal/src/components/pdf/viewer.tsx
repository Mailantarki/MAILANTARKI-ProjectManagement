"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ChevronLeft, ChevronRight, Download, Maximize, Minimize, Minus, Plus, RotateCw, X } from "lucide-react";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
type Ticket = { url: string; expiresIn: number; allowDownload: boolean };

export default function PdfViewer({ documentId, onClose }: { documentId: string; onClose: () => void }) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [error, setError] = useState("");
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(800);
  const [fullscreen, setFullscreen] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const reload = useCallback(async () => {
    setError("");
    try {
      const response = await fetch(`/api/documents/${documentId}/url?download=0`, { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to open this document.");
      setTicket(await response.json() as Ticket);
    } catch { setError("Unable to open this document."); }
  }, [documentId]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void reload(); }, 0);
    return () => window.clearTimeout(timer);
  }, [reload]);
  useEffect(() => {
    if (!ticket) return;
    const timer = window.setTimeout(() => { void reload(); }, Math.max(1, ticket.expiresIn - 45) * 1000);
    return () => window.clearTimeout(timer);
  }, [ticket, reload]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(200, entry.contentRect.width - 32)));
    if (viewport.current) observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const change = () => setFullscreen(document.fullscreenElement === stage.current);
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !document.fullscreenElement) onClose(); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onClose]);
  const download = async () => {
    try {
      const response = await fetch(`/api/documents/${documentId}/url?download=1`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const fresh = await response.json() as Ticket;
      window.location.assign(fresh.url);
    } catch { setError("Unable to download this document."); }
  };
  return <div className="viewer-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="viewer" ref={stage} role="dialog" aria-modal="true" aria-label="PDF viewer">
      <div className="viewer-toolbar"><span>Document preview</span><div className="viewer-controls">
        <button title="Previous page" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={18} /></button><span>{page} / {pages || "-"}</span>
        <button title="Next page" aria-label="Next page" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight size={18} /></button>
        <button title="Zoom out" aria-label="Zoom out" disabled={zoom <= .5} onClick={() => setZoom(Math.max(.5, zoom - .25))}><Minus size={18} /></button><span>{Math.round(zoom * 100)}%</span>
        <button title="Zoom in" aria-label="Zoom in" disabled={zoom >= 3} onClick={() => setZoom(Math.min(3, zoom + .25))}><Plus size={18} /></button>
        <button title="Fit to width" onClick={() => setZoom(1)}>Fit width</button>
        <button title={fullscreen ? "Exit full screen" : "Full screen"} aria-label={fullscreen ? "Exit full screen" : "Full screen"} onClick={() => { if (fullscreen) void document.exitFullscreen(); else void stage.current?.requestFullscreen(); }}>{fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}</button>
        {ticket?.allowDownload && <button title="Download" aria-label="Download" onClick={() => void download()}><Download size={18} /></button>}
        <button title="Close" aria-label="Close" onClick={onClose}><X size={18} /></button>
      </div></div>
      <div className="viewer-stage" ref={viewport}>{error ? <div role="alert">{error} <button onClick={() => void reload()}><RotateCw size={16} /> Retry</button></div> : ticket ? <div className="pdf-page" key={ticket.url}>
        <Document file={ticket.url} onLoadSuccess={({ numPages }) => { setPages(numPages); setPage((p) => Math.min(p, numPages)); }} onLoadError={() => setError("Unable to open this document.")} loading="Loading document...">
          <Page pageNumber={page} width={Math.round(width * zoom)} loading="Loading page..." />
        </Document>
      </div> : "Loading document..."}</div>
    </div>
  </div>;
}
