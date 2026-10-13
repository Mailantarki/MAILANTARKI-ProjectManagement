"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getPrincipal } from "@/lib/auth/principal";
import { authorize } from "@/lib/auth/authorize";
import { getUserClient } from "@/lib/supabase/server";

const uuid = z.uuid();
const editableDocument = z.object({
  id: uuid,
  title: z.string().trim().min(1).max(200),
  docNumber: z.string().trim().min(1).max(60),
  docType: z.enum(["plan", "section", "elevation", "detail", "specification", "schedule", "report", "other"]),
  revision: z.string().trim().min(1).max(10),
  status: z.enum(["draft", "for_review", "issued_for_construction", "as_built"]),
  issueDate: z.union([z.iso.date(), z.literal("")]).transform((value) => value || null),
  description: z.string().trim().max(1000),
});

async function managedDocument(id: string) {
  const principal = await getPrincipal();
  const user = await getUserClient();
  const { data: document, error } = await user.from("documents")
    .select("id,project_id,segment_id,upload_status,archived_at,is_featured")
    .eq("id", id).maybeSingle();
  if (error || !document || document.upload_status !== "ready" ||
      !(await authorize(principal, { projectId: document.project_id, segmentId: document.segment_id }, "admin_manage"))) {
    throw new Error("Document not found");
  }
  return { principal, user, document };
}

function refreshDocuments() {
  revalidatePath("/admin/projects", "layout");
  revalidatePath("/projects", "layout");
}

export async function updateDocumentMetadata(form: FormData) {
  const input = editableDocument.parse({
    id: form.get("id"), title: form.get("title"), docNumber: form.get("docNumber"),
    docType: form.get("docType"), revision: form.get("revision"), status: form.get("status"),
    issueDate: form.get("issueDate") ?? "", description: form.get("description") ?? "",
  });
  const { user, document } = await managedDocument(input.id);
  if (document.archived_at) throw new Error("Restore the document before editing it");
  const { data, error } = await user.from("documents").update({
    title: input.title, doc_number: input.docNumber, doc_type: input.docType,
    revision: input.revision, status: input.status, issue_date: input.issueDate,
    description: input.description || null,
  }).eq("id", input.id).select("id").maybeSingle();
  if (error || !data) throw new Error(error?.code === "23505"
    ? "A document with this number and revision already exists"
    : "Could not update document");
  refreshDocuments();
}

export async function setDocumentFeatured(form: FormData) {
  const id = uuid.parse(form.get("id"));
  const featured = z.enum(["true", "false"]).parse(form.get("featured")) === "true";
  const { user, document } = await managedDocument(id);
  if (document.archived_at) throw new Error("Archived documents cannot be featured");
  const { data, error } = await user.from("documents").update({ is_featured: featured })
    .eq("id", id).select("id").maybeSingle();
  if (error || !data) throw new Error("Could not update featured status");
  refreshDocuments();
}

export async function setDocumentArchived(form: FormData) {
  const id = uuid.parse(form.get("id"));
  const archived = z.enum(["true", "false"]).parse(form.get("archived")) === "true";
  const { principal, user, document } = await managedDocument(id);
  if (Boolean(document.archived_at) === archived) return;
  if (!archived && !(await authorize(principal,
    { projectId: document.project_id, segmentId: document.segment_id }, "admin_upload"))) {
    throw new Error("Restore the project first");
  }
  const { data, error } = await user.from("documents")
    .update({ archived_at: archived ? new Date().toISOString() : null,
      ...(archived ? { is_featured: false } : {}) })
    .eq("id", id).select("id").maybeSingle();
  if (error || !data) throw new Error("Could not change document archive status");
  refreshDocuments();
}

/** "Make current": the chosen revision becomes the one the portal shows for its number. */
export async function makeDocumentCurrent(form: FormData) {
  const id = uuid.parse(form.get("id"));
  const { user, document } = await managedDocument(id);
  if (document.archived_at) throw new Error("Restore the revision before making it current");
  // The RPC checks the project admin again with the user's own session (RLS rules stay in the database).
  const { error } = await user.rpc("make_document_current", { p_document_id: id });
  if (error) throw new Error("Could not make this revision current");
  refreshDocuments();
}

const bulkInput = z.object({
  ids: z.array(uuid).min(1).max(500),
  patch: z.object({
    status: z.enum(["draft", "for_review", "issued_for_construction", "as_built"]).optional(),
    is_featured: z.boolean().optional(),
    archived: z.boolean().optional(),
  }).strict().refine((patch) => Object.keys(patch).length > 0, "Nothing to change"),
});
export type BulkPrevious = { id: string; status: string; is_featured: boolean; archived: boolean; was_current: boolean };

/** Bulk edit (status, featured, archived). Every document must be one the admin manages, or nothing changes. */
export async function bulkUpdateDocuments(input: unknown): Promise<BulkPrevious[]> {
  const { ids, patch } = bulkInput.parse(input);
  const principal = await getPrincipal();
  const user = await getUserClient();
  const { data: rows, error: loadError } = await user.from("documents").select("id,project_id,segment_id").in("id", ids);
  if (loadError || !rows || rows.length !== new Set(ids).size) throw new Error("Some documents were not found");
  const targets = new Map(rows.map((row) => [`${row.project_id}:${row.segment_id}`, { projectId: row.project_id, segmentId: row.segment_id }]));
  const allowed = await Promise.all([...targets.values()].map((target) => authorize(principal, target, "admin_manage")));
  if (allowed.includes(false)) throw new Error("Not authorized");
  const { data, error } = await user.rpc("bulk_update_documents", { p_ids: ids, p_patch: patch });
  if (error) throw new Error(error.code === "42501" ? "Some documents cannot be changed" : "Could not update the documents");
  refreshDocuments();
  return (data ?? []) as BulkPrevious[];
}

/** Undo of a bulk edit: puts back each document's previous values (and its current revision). */
export async function undoBulkUpdate(input: unknown) {
  const previous = z.array(z.object({
    id: uuid, status: z.enum(["draft", "for_review", "issued_for_construction", "as_built"]),
    is_featured: z.boolean(), archived: z.boolean(), was_current: z.boolean(),
  })).min(1).max(500).parse(input);
  const groups = new Map<string, typeof previous>();
  for (const row of previous) {
    const key = JSON.stringify([row.status, row.is_featured, row.archived]);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  for (const rows of groups.values()) {
    const { status, is_featured, archived } = rows[0];
    await bulkUpdateDocuments({ ids: rows.map((row) => row.id), patch: { status, is_featured, archived } });
  }
  // A restored revision goes back to the history; make the ones that were current, current again.
  const user = await getUserClient();
  for (const row of previous.filter((r) => r.was_current && !r.archived)) {
    const { data } = await user.from("documents").select("is_current").eq("id", row.id).maybeSingle();
    if (data && !data.is_current) await user.rpc("make_document_current", { p_document_id: row.id });
  }
  refreshDocuments();
}
