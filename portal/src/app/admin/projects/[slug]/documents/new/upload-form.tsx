"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, History, Info, X } from "lucide-react";
import { docStatusLabels, docTypeLabels, formatFileSize, label } from "@/lib/format";
import { parseFileName } from "@/lib/documents/filename";
import { compareRevisions, nextRevision } from "@/lib/documents/revision";
import { BLOCKING, describeClassification, type Classification } from "@/lib/documents/classify";
import { getBrowserClient } from "@/lib/supabase/client";
import { cancelUpload, finalizeUpload, prepareUpload, reviewUploads } from "./actions";

type Segment = { id: string; name: string; slug: string };
type DocType = "plan" | "section" | "elevation" | "detail" | "specification" | "schedule" | "report" | "other";
type Status = "draft" | "for_review" | "issued_for_construction" | "as_built";
type Row = {
  id: string; file: File; segmentId: string; title: string; docNumber: string; docType: DocType;
  revision: string; status: Status; issueDate: string; description: string; phase: string; error?: string;
  /** The number was not in the file name: it is a guess the admin should check. */
  numberGuessed: boolean;
};
/** "New revision" of an existing drawing: these fields come from it. */
export type RevisionTemplate = { docNumber: string; title: string; segmentId: string; docType: string; latestRevision: string };

const types = ["plan", "section", "elevation", "detail", "specification", "schedule", "report", "other"] as const;
const statuses = ["draft", "for_review", "issued_for_construction", "as_built"] as const;

function fromFile(file: File, segmentId: string, template?: RevisionTemplate): Row {
  // "A-101 Ground floor plan Rev B.pdf" → number A-101, title "Ground floor plan", revision B.
  const parsed = parseFileName(file.name);
  const base = { id: crypto.randomUUID(), file, status: "draft" as Status, issueDate: "", description: "", phase: "Ready" };
  if (!template) return { ...base, segmentId, title: parsed.title, docNumber: parsed.docNumber,
    docType: "plan", revision: parsed.revision, numberGuessed: !parsed.numberFound };
  // A revision in the file name wins only when it is newer than the latest one.
  const revision = parsed.numberFound && compareRevisions(parsed.revision, template.latestRevision) > 0
    ? parsed.revision : nextRevision(template.latestRevision);
  return { ...base, segmentId: template.segmentId, title: template.title, docNumber: template.docNumber,
    docType: (types as readonly string[]).includes(template.docType) ? template.docType as DocType : "plan", revision, numberGuessed: false };
}

const reviewIcon = (kind: Classification["kind"]) => kind === "new_drawing" || kind === "new_revision"
  ? <CheckCircle2 size={16} aria-hidden /> : kind === "earlier_revision" ? <History size={16} aria-hidden /> : <AlertTriangle size={16} aria-hidden />;

export function UploadForm({ projectId, segments, template, doneHref }: {
  projectId: string; segments: Segment[]; template?: RevisionTemplate; doneHref: string;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [review, setReview] = useState<Record<string, Classification>>({});
  const [reviewError, setReviewError] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const pendingTickets = useRef(new Map<string, string>());
  const update = (id: string, patch: Partial<Row>) => setRows((old) => old.map((row) => row.id === id ? { ...row, ...patch } : row));
  const add = (files: FileList | File[]) => setRows((old) => [...old, ...Array.from(files).map((file) => fromFile(file, segments[0].id, template))]);

  // Step 2 (Review): re-check against the project whenever a number, revision or discipline changes.
  const pending = rows.filter((row) => row.phase !== "Complete");
  const signature = JSON.stringify(pending.map((row) => [row.id, row.segmentId, row.docNumber.trim(), row.revision.trim()]));
  const [checked, setChecked] = useState("[]");
  useEffect(() => {
    if (signature === "[]") return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const candidates = (JSON.parse(signature) as [string, string, string, string][])
        .map(([key, segmentId, docNumber, revision]) => ({ key, segmentId, docNumber, revision }));
      try {
        const result = await reviewUploads({ projectId, rows: candidates });
        if (!cancelled) { setReview(result); setReviewError(""); setChecked(signature); }
      } catch { if (!cancelled) setReviewError("Could not check existing revisions. Try again in a moment."); }
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [signature, projectId]);
  const reviewed = checked === signature;

  async function upload(row: Row) {
    if (!row.file.name.toLowerCase().endsWith(".pdf") || row.file.size > 50 * 1024 * 1024 || row.file.size < 5) {
      update(row.id, { phase: "Rejected", error: "Choose a PDF up to 50 MB" }); return;
    }
    const magic = new TextDecoder().decode(await row.file.slice(0, 5).arrayBuffer());
    if (magic !== "%PDF-") { update(row.id, { phase: "Rejected", error: "Invalid PDF" }); return; }
    try {
      update(row.id, { phase: "Preparing", error: undefined });
      const previous = pendingTickets.current.get(row.id);
      if (previous) {
        await cancelUpload(previous);
        pendingTickets.current.delete(row.id);
      }
      const ticket = await prepareUpload({ projectId, segmentId: row.segmentId,
        title: row.title, docNumber: row.docNumber, docType: row.docType, revision: row.revision,
        status: row.status, issueDate: row.issueDate || null, description: row.description,
        fileSize: row.file.size });
      pendingTickets.current.set(row.id, ticket.docId);
      update(row.id, { phase: "Uploading" });
      const { error } = await getBrowserClient().storage.from("documents")
        .uploadToSignedUrl(ticket.path, ticket.token, row.file, { contentType: "application/pdf" });
      if (error) throw new Error("Upload failed; retry to replace the unfinished attempt");
      update(row.id, { phase: "Validating" });
      await finalizeUpload(ticket.docId);
      pendingTickets.current.delete(row.id);
      update(row.id, { phase: "Complete" });
    } catch (error) {
      update(row.id, { phase: "Failed", error: error instanceof Error ? error.message : "Upload failed" });
    }
  }

  const blocked = (row: Row) => !row.title.trim() || !row.revision.trim() || !review[row.id] || BLOCKING.includes(review[row.id].kind);
  const publishable = reviewed ? pending.filter((row) => !blocked(row)) : [];
  async function publish() {
    if (busy || !publishable.length) return;
    setBusy(true);
    const queue = [...publishable];
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
      while (next < queue.length) await upload(queue[next++]);
    }));
    setBusy(false);
  }

  const applyAll = (patch: Partial<Row>) => setRows((old) => old.map((row) => row.phase === "Complete" ? row : { ...row, ...patch }));
  const remove = (id: string) => setRows((old) => old.filter((row) => row.id !== id));
  const done = rows.filter((row) => row.phase === "Complete").length;
  const step = !rows.length ? 1 : busy || (done > 0 && !pending.length) ? 3 : 2;

  const summary = useMemo(() => {
    if (!reviewed || !pending.length) return "";
    const count = (kind: Classification["kind"]) => pending.filter((row) => review[row.id]?.kind === kind).length;
    const attention = pending.filter((row) => blocked(row)).length;
    const parts: [number, string, string][] = [
      [count("new_revision"), "new revision", "new revisions"], [count("new_drawing"), "new drawing", "new drawings"],
      [count("earlier_revision"), "earlier revision", "earlier revisions"], [attention, "needs attention", "need attention"],
    ];
    return parts.filter(([n]) => n).map(([n, one, many]) => `${n} ${n === 1 ? one : many}`).join(" · ");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewed, review, signature, rows]);

  return <div className="admin-upload">
    <ol className="upload-steps" aria-label="Upload steps">
      {["Add files", "Review", "Publish"].map((name, index) => <li key={name} className={step === index + 1 ? "is-active" : step > index + 1 ? "is-done" : ""}
        aria-current={step === index + 1 ? "step" : undefined}><span>{index + 1}</span>{name}</li>)}
    </ol>
    <div className="upload-drop" onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
      event.preventDefault(); add(event.dataTransfer.files);
    }}><input ref={input} type="file" accept="application/pdf,.pdf" multiple={!template} onChange={(event) => {
      if (event.target.files) add(event.target.files);
      event.target.value = "";
    }} /><p>{template ? "Drag the PDF of the new revision here or choose it from your device." : "Drag PDFs here or choose them from your device."} Up to 50 MB each.</p>
      <button className="button secondary" type="button" onClick={() => input.current?.click()}>{template ? "Choose PDF" : "Choose PDFs"}</button></div>
    {!!rows.length && <>
      {!template && pending.length > 1 && <fieldset className="apply-all" disabled={busy}>
        <legend>Apply to all files</legend>
        <p className="field-hint">Changes here overwrite that field on every file that hasn&apos;t been published yet.</p>
        <div className="upload-fields">
          {segments.length > 1 && <label className="field">Discipline<select defaultValue="" onChange={(e) => e.target.value && applyAll({ segmentId: e.target.value })}>
            <option value="">—</option>{segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.name}</option>)}</select></label>}
          <label className="field">Type<select defaultValue="" onChange={(e) => e.target.value && applyAll({ docType: e.target.value as DocType })}>
            <option value="">—</option>{types.map((v) => <option key={v} value={v}>{label(docTypeLabels, v)}</option>)}</select></label>
          <label className="field">Status<select defaultValue="" onChange={(e) => e.target.value && applyAll({ status: e.target.value as Status })}>
            <option value="">—</option>{statuses.map((v) => <option key={v} value={v}>{label(docStatusLabels, v)}</option>)}</select></label>
          <label className="field">Revision<input placeholder="—" maxLength={10} onBlur={(e) => e.target.value.trim() && applyAll({ revision: e.target.value.trim() })}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }} /></label>
          <label className="field">Issue date<input type="date" onChange={(e) => e.target.value && applyAll({ issueDate: e.target.value })} /></label>
        </div>
      </fieldset>}
      {summary && <p className="upload-summary" aria-live="polite">{summary}</p>}
      {reviewError && <p className="error" role="alert">{reviewError}</p>}
      <div className="upload-list">{rows.map((row) => {
        const locked = busy || row.phase === "Complete";
        const outcome = row.phase === "Complete" ? undefined : review[row.id];
        const tone = outcome ? (BLOCKING.includes(outcome.kind) ? "warning" : outcome.kind === "earlier_revision" ? "info" : "ok") : "";
        return <section className={`upload-card${outcome && BLOCKING.includes(outcome.kind) ? " needs-attention" : ""}`} key={row.id} aria-label={row.file.name}>
          <header><strong title={row.file.name}>{row.file.name}</strong><small>{formatFileSize(row.file.size)}</small>
            <span className={`upload-phase ${row.phase.toLowerCase()}`} role="status">{row.phase}</span>
            {!busy && row.phase !== "Complete" && <button className="upload-remove" type="button" aria-label={`Remove ${row.file.name}`} onClick={() => remove(row.id)}><X size={16} aria-hidden /></button>}
          </header>
          {outcome && <p className={`upload-review ${tone}`}>{reviewIcon(outcome.kind)}<span>{describeClassification(outcome)}</span>
            {outcome.kind === "conflict" && !locked && <button type="button" className="button secondary"
              onClick={() => update(row.id, { revision: outcome.suggestion })}>Use Rev {outcome.suggestion}</button>}</p>}
          {row.numberGuessed && row.phase !== "Complete" && <p className="upload-review info"><Info size={16} aria-hidden />
            <span>No drawing number in the file name. Check the number below.</span></p>}
          {row.error && <p className="error" role="alert">{row.error}</p>}
          <div className="upload-fields">
            <label className="field wide">Title<input value={row.title} disabled={locked} required onChange={(e) => update(row.id, { title: e.target.value })} /></label>
            <label className={`field${outcome?.kind === "missing_number" ? " field-warning" : ""}`}>Number<input value={row.docNumber} disabled={locked} required
              onChange={(e) => update(row.id, { docNumber: e.target.value, numberGuessed: false })} /></label>
            <label className="field">Discipline<select value={row.segmentId} disabled={locked} onChange={(e) => update(row.id, { segmentId: e.target.value })}>{segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.name}</option>)}</select></label>
            <label className="field">Type<select value={row.docType} disabled={locked} onChange={(e) => update(row.id, { docType: e.target.value as DocType })}>{types.map((v) => <option key={v} value={v}>{label(docTypeLabels, v)}</option>)}</select></label>
            <label className={`field${outcome?.kind === "conflict" ? " field-warning" : ""}`}>Revision<input value={row.revision} disabled={locked} required maxLength={10} onChange={(e) => update(row.id, { revision: e.target.value })} /></label>
            <label className="field">Status<select value={row.status} disabled={locked} onChange={(e) => update(row.id, { status: e.target.value as Status })}>{statuses.map((v) => <option key={v} value={v}>{label(docStatusLabels, v)}</option>)}</select></label>
            <label className="field">Issue date<input type="date" value={row.issueDate} disabled={locked} onChange={(e) => update(row.id, { issueDate: e.target.value })} /></label>
            <label className="field wide">Description<input value={row.description} disabled={locked} onChange={(e) => update(row.id, { description: e.target.value })} /></label>
          </div>
        </section>;
      })}</div>
      {!pending.length && !busy ? <div className="upload-done" aria-live="polite">
        <strong>{done} {done === 1 ? "file" : "files"} published.</strong>
        <span>The portal already shows the current revisions.</span>
        <Link className="button" href={doneHref}>Done</Link>
        <button className="button secondary" type="button" onClick={() => { setRows([]); setReview({}); }}>Upload more</button>
      </div> : <div className="upload-actions">
        <button className="button" type="button" disabled={busy || !publishable.length} onClick={publish}>
          {busy ? `Publishing ${done} of ${rows.length}…` : `Publish ${publishable.length} ${publishable.length === 1 ? "file" : "files"}`}</button>
        {!busy && pending.length > publishable.length && reviewed && <span className="results-count">
          {pending.length - publishable.length} {pending.length - publishable.length === 1 ? "file needs" : "files need"} attention and will stay here.</span>}
        {!busy && !reviewed && <span className="results-count">Checking existing revisions…</span>}
        {done > 0 && !busy && <span className="results-count">{done} of {rows.length} published</span>}
      </div>}
    </>}
  </div>;
}
