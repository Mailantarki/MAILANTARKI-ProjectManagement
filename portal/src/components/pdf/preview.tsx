"use client";
import "./polyfills";
import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();

/**
 * First page of a document, small, for the details panel. The file is opened like in the viewer
 * (authorize + log, short-lived signed URL) but read in ranges, so a large drawing set does not
 * have to download in full just to show page 1.
 */
export default function PdfPreview({ id, title, onPages, onOpen }: {
  id: string; title: string; onPages?: (pages: number) => void; onOpen?: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [width, setWidth] = useState(320);
  const box = useRef<HTMLButtonElement>(null);
  const options = useMemo(() => ({ disableAutoFetch: true, disableStream: true }), []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/documents/${id}/url?download=0`, { cache: "no-store", signal: controller.signal })
      .then((r) => r.ok ? r.json() as Promise<{ url: string }> : Promise.reject(new Error()))
      .then((ticket) => setUrl(ticket.url))
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setFailed(true); });
    return () => controller.abort();
  }, [id]);
  useEffect(() => {
    if (!box.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(160, Math.round(entry.contentRect.width - 16))));
    observer.observe(box.current);
    return () => observer.disconnect();
  }, []);

  return <button ref={box} type="button" className={`peek-preview${ready ? " is-ready" : ""}`} onClick={onOpen}
    aria-label={`Open ${title}`} title="Open in the viewer">
    {failed ? <span className="peek-preview-message">Preview unavailable</span>
      : !url ? <span className="peek-preview-message">Loading preview…</span>
      : <Document file={url} options={options} loading={<span className="peek-preview-message">Loading preview…</span>}
          error={<span className="peek-preview-message">Preview unavailable</span>}
          onLoadSuccess={({ numPages }) => onPages?.(numPages)} onLoadError={() => setFailed(true)}>
          <Page pageNumber={1} width={width} renderTextLayer={false} renderAnnotationLayer={false}
            loading={<span className="peek-preview-message">Loading preview…</span>} onRenderSuccess={() => setReady(true)} />
        </Document>}
  </button>;
}
