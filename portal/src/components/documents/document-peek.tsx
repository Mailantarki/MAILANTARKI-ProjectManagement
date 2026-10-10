"use client";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { Download, Eye, PanelRight, QrCode, X } from "lucide-react";
import type { DocumentDetails, RevisionSummary } from "@/app/api/documents/[id]/revisions/route";
import type { ViewerDocument } from "@/components/pdf/launcher";
import { CopyLinkButton } from "@/components/ui/copy-link";
import { StatusBadge } from "@/components/ui/status-badge";
import { useDocumentSet } from "./document-set";
import { docTypeLabels, formatDate, formatFileSize, label } from "@/lib/format";

const Viewer = dynamic(() => import("@/components/pdf/viewer"), { ssr: false });
type Peek = { document: DocumentDetails; revisions: RevisionSummary[] };

/**
 * "Details" on a document row: a side panel with the metadata, the revision history, a fixed link
 * (and its QR code for site use) and Open/Download. Metadata only; files still go through /url.
 */
export function DocumentPeek({ document }: { document: ViewerDocument }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<Peek | null>(null);
  const [failed, setFailed] = useState(false);
  const [viewing, setViewing] = useState<ViewerDocument | null>(null);
  const [qr, setQr] = useState("");
  const siblings = useDocumentSet();

  const open = () => {
    dialog.current?.showModal();
    if (data) return;
    setFailed(false);
    fetch(`/api/documents/${document.id}/revisions`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<Peek & { docNumber: string }> : Promise.reject())
      .then((body) => setData({ document: body.document, revisions: body.revisions }))
      .catch(() => setFailed(true));
  };
  const close = () => dialog.current?.close();
  const showQr = async () => {
    if (qr || !data) { setQr(""); return; }
    const { toString } = await import("qrcode");
    setQr(await toString(new URL(data.document.link, window.location.origin).toString(), { type: "svg", margin: 1, width: 180 }));
  };
  const download = async (id: string) => {
    const response = await fetch(`/api/documents/${id}/url?download=1`, { cache: "no-store" });
    if (response.ok) window.location.assign((await response.json() as { url: string }).url);
  };
  const view = (revision?: RevisionSummary) => {
    close();
    setViewing(revision && data
      ? { id: revision.id, title: revision.title, subtitle: `${data.document.docNumber} · Rev ${revision.revision}` }
      : document);
  };

  const d = data?.document;
  return <>
    <button type="button" className="peek-document" onClick={open} aria-label={`Details for ${document.title}`} title="Details">
      <PanelRight size={15} aria-hidden /><span className="peek-label">Details</span></button>
    <dialog ref={dialog} className="peek" aria-label={`Details for ${document.title}`}
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div className="peek-body">
        <header className="peek-header">
          <div><strong>{document.title}</strong><span>{document.subtitle}</span></div>
          <button type="button" className="icon-button" onClick={close} aria-label="Close details"><X size={18} aria-hidden /></button>
        </header>
        {failed && <p className="peek-message" role="alert">These details are unavailable right now.</p>}
        {!d && !failed && <p className="peek-message">Loading details…</p>}
        {d && <>
          <div className="peek-actions">
            <button type="button" className="button" onClick={() => view()}><Eye size={16} aria-hidden />Open</button>
            {d.canDownload && <button type="button" className="button secondary" onClick={() => void download(document.id)}><Download size={16} aria-hidden />Download</button>}
            <CopyLinkButton path={d.link} />
            <button type="button" className="button secondary icon-button-text" aria-pressed={!!qr} onClick={() => void showQr()}><QrCode size={16} aria-hidden /><span>QR code</span></button>
          </div>
          {qr && <figure className="peek-qr">
            {/* Generated locally from the fixed link: no file URL, no secret. */}
            <span dangerouslySetInnerHTML={{ __html: qr }} />
            <figcaption>Scan to open the current revision of {d.docNumber}. Sign-in is still required.</figcaption>
          </figure>}
          <dl className="peek-facts">
            <div><dt>Status</dt><dd><StatusBadge status={d.isCurrent ? d.status : "superseded"} /></dd></div>
            <div><dt>Number</dt><dd>{d.docNumber}</dd></div>
            <div><dt>Revision</dt><dd>Rev {d.revision}{d.isCurrent ? " · Current" : ""}</dd></div>
            <div><dt>Type</dt><dd>{label(docTypeLabels, d.type)}</dd></div>
            <div><dt>Discipline</dt><dd>{d.discipline}</dd></div>
            <div><dt>Issued</dt><dd>{formatDate(d.issueDate)}</dd></div>
            <div><dt>Size</dt><dd>{formatFileSize(d.fileSize)}</dd></div>
          </dl>
          {d.description && <p className="peek-description">{d.description}</p>}
          <h3 className="peek-heading">Revision history</h3>
          <ol className="peek-revisions">
            {data.revisions.map((r) => <li key={r.id} className={r.id === document.id ? "is-this" : undefined}>
              <button type="button" onClick={() => view(r)}>
                <span className="peek-rev">Rev {r.revision}</span>
                <span>{r.isCurrent ? "Current" : `Superseded${r.supersededAt ? ` ${formatDate(r.supersededAt)}` : ""}`}</span>
                <span className="peek-date">{formatDate(r.issueDate)}</span>
              </button>
            </li>)}
          </ol>
        </>}
      </div>
    </dialog>
    {viewing && <Viewer document={viewing} siblings={siblings} onClose={() => setViewing(null)} />}
  </>;
}
