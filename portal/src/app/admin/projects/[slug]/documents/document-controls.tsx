"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Star } from "lucide-react";
import { setDocumentFeatured, updateDocumentMetadata } from "./actions";

type DocumentValue = {
  id: string; title: string; docNumber: string; docType: string; revision: string;
  status: string; issueDate: string | null; description: string | null; featured: boolean;
};

export function DocumentControls({ document }: { document: DocumentValue }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);

  async function submit(action: (form: FormData) => Promise<void>, form: FormData, close = false) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await action(form);
      if (close) dialog.current?.close();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save changes");
    } finally {
      setBusy(false);
    }
  }

  return <div className="document-controls">
    <form onSubmit={(event) => {
      event.preventDefault();
      void submit(setDocumentFeatured, new FormData(event.currentTarget));
    }}>
      <input type="hidden" name="id" value={document.id} />
      <input type="hidden" name="featured" value={String(!document.featured)} />
      <button className={`icon-button${document.featured ? " active" : ""}`} type="submit"
        disabled={busy} title={document.featured ? "Remove featured status" : "Feature document"}>
        <Star size={16} fill={document.featured ? "currentColor" : "none"} aria-hidden />
        <span className="sr-only">{document.featured ? "Unfeature" : "Feature"}</span>
      </button>
    </form>
    <button className="icon-button" type="button" title="Edit document" onClick={() => {
      setError(""); setEditing(true); dialog.current?.showModal();
    }}>
      <Pencil size={16} aria-hidden /><span className="sr-only">Edit</span>
    </button>
    {!editing && error && <span className="document-control-error" role="alert">{error}</span>}
    <dialog className="document-dialog" ref={dialog} aria-label="Edit document" onClose={() => setEditing(false)}>
      <div className="admin-page-title"><h2>Edit document</h2>
        <button className="icon-button" type="button" onClick={() => dialog.current?.close()} aria-label="Close">×</button></div>
      <form className="document-edit-form" onSubmit={(event) => {
        event.preventDefault();
        void submit(updateDocumentMetadata, new FormData(event.currentTarget), true);
      }}>
        <input type="hidden" name="id" value={document.id} />
        <label className="field">Title<input name="title" required maxLength={200} defaultValue={document.title} /></label>
        <label className="field">Document number<input name="docNumber" required maxLength={60} defaultValue={document.docNumber} /></label>
        <label className="field">Type<select name="docType" defaultValue={document.docType}>
          {["plan","section","elevation","detail","specification","schedule","report","other"].map((value) =>
            <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
        </select></label>
        <label className="field">Revision<input name="revision" required maxLength={10} defaultValue={document.revision} /></label>
        <label className="field">Status<select name="status" defaultValue={document.status}>
          {["draft","for_review","issued_for_construction","as_built"].map((value) =>
            <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
        </select></label>
        <label className="field">Issue date<input type="date" name="issueDate" defaultValue={document.issueDate ?? ""} /></label>
        <label className="field full">Description<textarea name="description" maxLength={1000} defaultValue={document.description ?? ""} /></label>
        {error && <p className="error full" role="alert">{error}</p>}
        <div className="document-dialog-actions full"><button className="button secondary" type="button" onClick={() => dialog.current?.close()}>Cancel</button>
          <button className="button" disabled={busy} type="submit">{busy ? "Saving..." : "Save changes"}</button></div>
      </form>
    </dialog>
  </div>;
}
