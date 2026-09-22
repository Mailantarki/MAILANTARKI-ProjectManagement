"use client";

import { useRef, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { finalizeUpload, prepareUpload } from "./actions";

type Segment = { id: string; name: string; slug: string };
type Row = {
  id: string; file: File; segmentId: string; title: string; docNumber: string;
  docType: "plan" | "section" | "elevation" | "detail" | "specification" | "schedule" | "report" | "other";
  revision: string; status: "draft" | "for_review" | "issued_for_construction" | "as_built";
  issueDate: string; description: string; phase: string; error?: string;
};

function fromFile(file: File, segmentId: string): Row {
  const title = file.name.replace(/\.pdf$/i, "").trim();
  return { id: crypto.randomUUID(), file, segmentId, title,
    docNumber: title.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60),
    docType: "plan", revision: "0", status: "draft", issueDate: "", description: "", phase: "Ready" };
}

export function UploadForm({ projectId, segments }: { projectId: string; segments: Segment[] }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const update = (id: string, patch: Partial<Row>) => setRows((old) => old.map((row) => row.id === id ? { ...row, ...patch } : row));
  const add = (files: FileList | File[]) => setRows((old) => [...old, ...Array.from(files).map((file) => fromFile(file, segments[0].id))]);

  async function upload(row: Row) {
    if (!row.file.name.toLowerCase().endsWith(".pdf") || row.file.size > 50 * 1024 * 1024 || row.file.size < 5) {
      update(row.id, { phase: "Rejected", error: "Choose a PDF up to 50 MB" }); return;
    }
    const magic = new TextDecoder().decode(await row.file.slice(0, 5).arrayBuffer());
    if (magic !== "%PDF-") { update(row.id, { phase: "Rejected", error: "Invalid PDF" }); return; }
    try {
      update(row.id, { phase: "Preparing", error: undefined });
      const ticket = await prepareUpload({ projectId, segmentId: row.segmentId,
        title: row.title, docNumber: row.docNumber, docType: row.docType, revision: row.revision,
        status: row.status, issueDate: row.issueDate || null, description: row.description,
        fileSize: row.file.size });
      update(row.id, { phase: "Uploading" });
      const { error } = await getBrowserClient().storage.from("documents")
        .uploadToSignedUrl(ticket.path, ticket.token, row.file, { contentType: "application/pdf" });
      if (error) throw new Error("Upload failed; retry after the pending record is cleaned up");
      update(row.id, { phase: "Validating" });
      await finalizeUpload(ticket.docId);
      update(row.id, { phase: "Complete" });
    } catch (error) {
      update(row.id, { phase: "Failed", error: error instanceof Error ? error.message : "Upload failed" });
    }
  }

  async function start() {
    if (busy || !rows.length) return;
    setBusy(true);
    const pending = rows.filter((row) => row.phase !== "Complete");
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(3, pending.length) }, async () => {
      while (next < pending.length) await upload(pending[next++]);
    }));
    setBusy(false);
  }

  return <div className="admin-upload">
    <div className="upload-drop" onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
      event.preventDefault(); add(event.dataTransfer.files);
    }}><input ref={input} type="file" accept="application/pdf,.pdf" multiple onChange={(event) => {
      if (event.target.files) add(event.target.files);
      event.target.value = "";
    }} /><button className="button secondary" type="button" onClick={() => input.current?.click()}>Choose PDFs</button></div>
    {!!rows.length && <><label className="field">Discipline for all
      <select disabled={busy} onChange={(event) => setRows((old) => old.map((row) => ({ ...row, segmentId: event.target.value })))}>
        {segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.name}</option>)}
      </select></label><div className="table-scroll"><table className="document-table admin-upload-table"><thead><tr>
        <th>File</th><th>Discipline</th><th>Title</th><th>Number</th><th>Type</th><th>Revision</th><th>Status</th><th>Issue date</th><th>Description</th><th>Progress</th>
      </tr></thead><tbody>{rows.map((row) => <tr key={row.id}>
        <td>{row.file.name}</td><td><select value={row.segmentId} disabled={busy} onChange={(e) => update(row.id, { segmentId: e.target.value })}>{segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.name}</option>)}</select></td>
        <td><input aria-label={`${row.file.name} title`} value={row.title} disabled={busy} onChange={(e) => update(row.id, { title: e.target.value })} /></td>
        <td><input aria-label={`${row.file.name} number`} value={row.docNumber} disabled={busy} onChange={(e) => update(row.id, { docNumber: e.target.value })} /></td>
        <td><select value={row.docType} disabled={busy} onChange={(e) => update(row.id, { docType: e.target.value as Row["docType"] })}>{["plan","section","elevation","detail","specification","schedule","report","other"].map((v) => <option key={v} value={v}>{v}</option>)}</select></td>
        <td><input aria-label={`${row.file.name} revision`} value={row.revision} disabled={busy} onChange={(e) => update(row.id, { revision: e.target.value })} /></td>
        <td><select value={row.status} disabled={busy} onChange={(e) => update(row.id, { status: e.target.value as Row["status"] })}>{["draft","for_review","issued_for_construction","as_built"].map((v) => <option key={v} value={v}>{v.replaceAll("_", " ")}</option>)}</select></td>
        <td><input type="date" value={row.issueDate} disabled={busy} onChange={(e) => update(row.id, { issueDate: e.target.value })} /></td>
        <td><input aria-label={`${row.file.name} description`} value={row.description} disabled={busy} onChange={(e) => update(row.id, { description: e.target.value })} /></td>
        <td role="status">{row.phase}{row.error && <span className="error">: {row.error}</span>}</td>
      </tr>)}</tbody></table></div><button className="button" type="button" disabled={busy} onClick={start}>{busy ? "Uploading" : "Upload"}</button></>}
  </div>;
}
