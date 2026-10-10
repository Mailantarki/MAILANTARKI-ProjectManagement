import { z } from "zod";
import { getPrincipal } from "../../../../../lib/auth/principal";
import { authorize } from "../../../../../lib/auth/authorize";
import { getAdminClient } from "../../../../../lib/supabase/admin";
import { compareRevisions } from "../../../../../lib/documents/revision";

const headers = { "Cache-Control": "no-store" };
const missing = () => Response.json({ error: "Document not found" }, { status: 404, headers });

export type DocumentDetails = {
  id: string; title: string; docNumber: string; type: string; status: string; revision: string; isCurrent: boolean;
  issueDate: string | null; fileSize: number; description: string | null; discipline: string; project: string;
  /** Fixed link to the current revision: shareable, never a signed URL. */
  link: string; canDownload: boolean;
};

export type RevisionSummary = {
  id: string; title: string; revision: string; status: string; issueDate: string | null;
  isCurrent: boolean; supersededAt: string | null;
};

/**
 * Every visible revision of a document's number, newest first, for the viewer's revision picker.
 * Metadata only: opening a revision still goes through /api/documents/[id]/url (authorize + log).
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const principal = await getPrincipal();
  if (!principal) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  const id = z.uuid().safeParse((await context.params).id);
  if (!id.success) return Response.json({ error: "Invalid request" }, { status: 400, headers });

  const admin = getAdminClient();
  const { data: document, error } = await admin.from("documents")
    .select("project_id,segment_id,doc_number,upload_status,archived_at,title,doc_type,status,revision,is_current,issue_date,file_size,description,segments(name),projects(name,slug)")
    .eq("id", id.data).maybeSingle();
  if (error) return Response.json({ error: "Document unavailable" }, { status: 503, headers });
  if (!document || document.upload_status !== "ready" || document.archived_at) return missing();
  // Revisions share project and discipline, so one authorization covers all of them.
  const target = { projectId: document.project_id, segmentId: document.segment_id };
  if (!await authorize(principal, target, "view")) return missing();

  const { data: rows, error: listError } = await admin.from("documents")
    .select("id,title,revision,status,issue_date,is_current,superseded_at")
    .eq("project_id", document.project_id).eq("segment_id", document.segment_id).eq("doc_number", document.doc_number)
    .eq("upload_status", "ready").is("archived_at", null).limit(100);
  if (listError) return Response.json({ error: "Document unavailable" }, { status: 503, headers });
  const revisions: RevisionSummary[] = (rows ?? [])
    .sort((a, b) => Number(b.is_current) - Number(a.is_current) || compareRevisions(b.revision, a.revision))
    .map((row) => ({ id: row.id, title: row.title, revision: row.revision, status: row.status,
      issueDate: row.issue_date, isCurrent: row.is_current, supersededAt: row.superseded_at }));
  const one = <T,>(value: T | T[] | null) => (Array.isArray(value) ? value[0] ?? null : value);
  const project = one(document.projects as unknown as { name: string; slug: string } | null);
  const details: DocumentDetails = {
    id: id.data, title: document.title, docNumber: document.doc_number, type: document.doc_type, status: document.status,
    revision: document.revision, isCurrent: document.is_current, issueDate: document.issue_date, fileSize: document.file_size,
    description: document.description, discipline: one(document.segments as unknown as { name: string } | null)?.name ?? "",
    project: project?.name ?? "", link: `/projects/${project?.slug}/documents/${encodeURIComponent(document.doc_number)}`,
    canDownload: await authorize(principal, target, "download"),
  };
  return Response.json({ docNumber: document.doc_number, revisions, document: details }, { headers });
}
