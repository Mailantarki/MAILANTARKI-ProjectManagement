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
