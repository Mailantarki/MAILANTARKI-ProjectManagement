"use client";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Download, Eye, QrCode, X } from "lucide-react";
import type { DocumentDetails, RevisionSummary } from "@/app/api/documents/[id]/revisions/route";
import type { ViewerDocument } from "@/components/pdf/launcher";
import { CopyLinkButton } from "@/components/ui/copy-link";
import { StatusBadge } from "@/components/ui/status-badge";
import { useDocumentSet } from "./document-set";
import { preloadViewer, ViewerSkeleton } from "@/components/pdf/viewer-skeleton";
import { docTypeLabels, formatDate, formatFileSize, label } from "@/lib/format";

const Viewer = dynamic(() => import("@/components/pdf/viewer"), { ssr: false, loading: () => <ViewerSkeleton /> });
const Preview = dynamic(() => import("@/components/pdf/preview"), { ssr: false,
  loading: () => <span className="peek-preview"><span className="peek-preview-message">Loading preview…</span></span> });
type Peek = { document: DocumentDetails; revisions: RevisionSummary[]; docNumber: string };
type Context = { selected: string | null; toggle: (doc: ViewerDocument) => void };
const PeekContext = createContext<Context>({ selected: null, toggle: () => undefined });
const PANEL_ID = "document-peek";

/**
 * Click a document in the list → a panel beside the list with a preview of page 1, the details,
 * the revision history and Open / Download / Copy link. On phones it opens as a bottom sheet.
 * Metadata comes from /api/documents/[id]/revisions; the preview goes through /url like the viewer.
 */
export function DocumentPeekProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<ViewerDocument | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const toggle = useCallback((doc: ViewerDocument) => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    setSelected((current) => current?.id === doc.id ? null : doc);
  }, []);
  const close = useCallback(() => {
    setSelected(null);
    returnFocus.current?.focus?.();
  }, []);
  return <PeekContext.Provider value={{ selected: selected?.id ?? null, toggle }}>
    <div className={`peek-layout${selected ? " has-peek" : ""}`}>
      <div className="peek-main">{children}</div>
      {selected && <>
        <div className="peek-scrim" onClick={close} aria-hidden />
        <PeekPanel key={selected.id} document={selected} onClose={close} />
      </>}
    </div>
  </PeekContext.Provider>;
}

/** The document title in the list: opens its panel (again: closes it). */
export function PeekTrigger({ document }: { document: ViewerDocument }) {
  const { selected, toggle } = useContext(PeekContext);
  const open = selected === document.id;
  return <button type="button" className="document-open" aria-expanded={open} aria-controls={open ? PANEL_ID : undefined}
    onClick={() => toggle(document)}>{document.title}</button>;
}

function PeekPanel({ document, onClose }: { document: ViewerDocument; onClose: () => void }) {
  const [data, setData] = useState<Peek | null>(null);
  const [failed, setFailed] = useState(false);
  const [pages, setPages] = useState(0);
  const [viewing, setViewing] = useState<ViewerDocument | null>(null);
  const [qr, setQr] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const siblings = useDocumentSet();

  useEffect(() => {
    heading.current?.focus();
    preloadViewer(); // "Open" is the likely next step
    const controller = new AbortController();
    fetch(`/api/documents/${document.id}/revisions`, { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<Peek> : Promise.reject(new Error()))
      .then(setData)
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setFailed(true); });
    return () => controller.abort();
  }, [document.id]);
  useEffect(() => {
    if (viewing) return; // the viewer handles Esc itself
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose, viewing]);

  const d = data?.document;
  const view = (revision?: RevisionSummary) => setViewing(revision && data
    ? { id: revision.id, title: revision.title, subtitle: `${data.docNumber} · Rev ${revision.revision}` } : document);
  const download = async () => {
    const response = await fetch(`/api/documents/${document.id}/url?download=1`, { cache: "no-store" });
    if (response.ok) window.location.assign((await response.json() as { url: string }).url);
  };
  const showQr = async () => {
    if (qr || !d) { setQr(""); return; }
    const { toString } = await import("qrcode");
    setQr(await toString(new URL(d.link, window.location.origin).toString(), { type: "svg", margin: 1, width: 180 }));
  };

  return <aside id={PANEL_ID} className="peek-panel" aria-labelledby={`${PANEL_ID}-title`}>
    <header className="peek-header">
      <div><span className="peek-kicker">{d ? `${d.docNumber} · ${label(docTypeLabels, d.type)}` : document.subtitle}</span>
        <h2 id={`${PANEL_ID}-title`} ref={heading} tabIndex={-1}>{document.title}</h2></div>
      <button type="button" className="icon-button" onClick={onClose} aria-label="Close details"><X size={18} aria-hidden /></button>
    </header>
    {d && <div className="peek-chips">
      <StatusBadge status={d.status} />
      <span className={`peek-rev-chip${d.isCurrent ? "" : " is-superseded"}`}>Rev {d.revision} · {d.isCurrent ? "Current" : "Superseded"}</span>
    </div>}
    <Preview id={document.id} title={document.title} onPages={setPages} onOpen={() => view()} />
    {failed && <p className="peek-message" role="alert">These details are unavailable right now.</p>}
    <div className="peek-actions">
      <button type="button" className="button" onClick={() => view()}><Eye size={16} aria-hidden />Open</button>
      {d?.canDownload && <button type="button" className="button secondary" onClick={() => void download()}><Download size={16} aria-hidden />Download</button>}
      {d && <CopyLinkButton path={d.link} compact className="peek-icon" label="Copy link to this drawing" />}
      {d && <button type="button" className="button secondary icon-button-text peek-icon" aria-pressed={!!qr} aria-label="QR code" title="QR code for site use"
        onClick={() => void showQr()}><QrCode size={16} aria-hidden /></button>}
    </div>
    {qr && d && <figure className="peek-qr">
      {/* Generated locally from the fixed link: no file URL, no secret. */}
      <span dangerouslySetInnerHTML={{ __html: qr }} />
      <figcaption>Scan to open the current revision of {d.docNumber}. Sign-in is still required.</figcaption>
    </figure>}
    {!d && !failed && <p className="peek-message">Loading details…</p>}
    {d && <>
      <dl className="peek-facts">
        <div><dt>Discipline</dt><dd>{d.discipline}</dd></div>
        <div><dt>Issued</dt><dd>{formatDate(d.issueDate)}</dd></div>
        <div><dt>File</dt><dd>{formatFileSize(d.fileSize)}{pages ? ` · ${pages} ${pages === 1 ? "page" : "pages"}` : ""}</dd></div>
        <div><dt>Uploaded by</dt><dd>{d.uploadedBy ?? "-"}</dd></div>
      </dl>
      {d.description && <p className="peek-description">{d.description}</p>}
      <div className="peek-history">
        <h3>Revision history <span>{data.revisions.length} {data.revisions.length === 1 ? "revision" : "revisions"}</span></h3>
        <ol>{data.revisions.map((r) => <li key={r.id} className={r.id === document.id ? "is-this" : undefined}>
          <span className={`peek-dot${r.isCurrent ? " is-current" : ""}`} aria-hidden />
          <div><strong>Rev {r.revision}</strong> <span className={r.isCurrent ? "peek-current" : "peek-superseded"}>{r.isCurrent ? "Current" : "Superseded"}</span>
            <p>{[formatDate(r.issueDate, ""), r.description].filter(Boolean).join(" · ") || "No notes"}</p></div>
          <button type="button" className="link-button" onClick={() => view(r)} aria-label={`Open Rev ${r.revision}`}>Open</button>
        </li>)}</ol>
      </div>
    </>}
    {viewing && createPortal(<Viewer document={viewing} siblings={siblings} onClose={() => setViewing(null)} />, window.document.body)}
  </aside>;
}
