"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getPrincipal } from "@/lib/auth/principal";
import { authorize } from "@/lib/auth/authorize";
import { getUserClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { documentMetaSchema, MAX_PDF_BYTES } from "@/lib/admin/upload-schema";
import { classifyUploads, type Classification } from "@/lib/documents/classify";
import { headers } from "next/headers";
import { publishAudience, publishEmail, sendPublishEmails } from "@/lib/updates/notify";

const reviewSchema = z.object({
  projectId: z.uuid(),
  rows: z.array(z.object({
    key: z.string().min(1).max(64),
    segmentId: z.uuid(),
    docNumber: z.string().max(60),
    revision: z.string().trim().max(10),
  })).max(200),
});

/**
 * Step 2 of the upload ("Review"): what publishing each file will do, compared with the revisions
 * already in the project. Read-only; runs under the admin's own session (RLS).
 */
export async function reviewUploads(input: unknown): Promise<Record<string, Classification>> {
  const { projectId, rows } = reviewSchema.parse(input);
  if (!rows.length) return {};
  const principal = await getPrincipal();
  const segmentIds = [...new Set(rows.map((row) => row.segmentId))];
  const allowed = await Promise.all(segmentIds.map((segmentId) => authorize(principal, { projectId, segmentId }, "admin_upload")));
  if (!principal || allowed.includes(false)) throw new Error("Not authorized");
  const numbers = [...new Set(rows.map((row) => row.docNumber.trim()).filter(Boolean))];
  if (!numbers.length) return classifyUploads(rows, []);
  const { data, error } = await (await getUserClient()).from("documents")
    .select("segment_id,doc_number,revision,is_current")
    .eq("project_id", projectId).in("segment_id", segmentIds).in("doc_number", numbers)
    .eq("upload_status", "ready").is("archived_at", null).limit(2000);
  if (error) throw new Error("Could not check existing revisions");
  return classifyUploads(rows, (data ?? []).map((row) => ({
    segmentId: row.segment_id, docNumber: row.doc_number, revision: row.revision, isCurrent: row.is_current,
  })));
}

export async function prepareUpload(input: unknown) {
  const meta = documentMetaSchema.parse(input);
  const principal = await getPrincipal();
  if (!principal || !(await authorize(principal,
    { projectId: meta.projectId, segmentId: meta.segmentId }, "admin_upload"))) throw new Error("Not authorized");

  const user = await getUserClient();
  const { data: segment, error: segmentError } = await user.from("segments")
    .select("slug").eq("id", meta.segmentId).single();
  if (segmentError || !segment) throw new Error("Invalid segment");

  const docId = randomUUID();
  const path = `projects/${meta.projectId}/${segment.slug}/${docId}.pdf`;
  const { error: insertError } = await user.from("documents").insert({
    id: docId, project_id: meta.projectId, segment_id: meta.segmentId,
    title: meta.title, doc_number: meta.docNumber, doc_type: meta.docType,
    revision: meta.revision, status: meta.status, issue_date: meta.issueDate,
    description: meta.description, file_size: meta.fileSize, upload_status: "pending",
  });
  if (insertError) throw new Error(insertError.code === "23505"
    ? "A document with this number and revision already exists in this segment"
    : "Could not prepare upload");

  const { data, error } = await getAdminClient().storage.from("documents").createSignedUploadUrl(path);
  if (error || !data) throw new Error("Could not prepare upload; pending metadata will be cleaned up");
  return { docId, path, token: data.token };
}

export async function finalizeUpload(input: unknown) {
  const docId = z.uuid().parse(input);
  const principal = await getPrincipal();
  if (!principal || principal.kind !== "user") throw new Error("Not authorized");
  const user = await getUserClient();
  const { data: document, error: documentError } = await user.from("documents")
    .select("id,project_id,segment_id,upload_status")
    .eq("id", docId).maybeSingle();
  if (documentError || !document) throw new Error("Document not found");
  if (!(await authorize(principal,
    { projectId: document.project_id, segmentId: document.segment_id }, "admin_upload"))) throw new Error("Document not found");
  if (document.upload_status !== "pending") throw new Error("Document was already finalized");

  const { data: segment } = await user.from("segments").select("slug").eq("id", document.segment_id).single();
  if (!segment) throw new Error("Invalid segment");
  const path = `projects/${document.project_id}/${segment.slug}/${docId}.pdf`;
  const storage = getAdminClient().storage.from("documents");
  const { data: object, error: infoError } = await storage.info(path);
  if (infoError || !object || !Number.isInteger(object.size)) throw new Error("Uploaded file not found");

  async function rejectFile() {
    const { error: removeError } = await storage.remove([path]);
    if (removeError) throw new Error("Invalid PDF; cleanup failed");
    throw new Error("Invalid PDF; upload removed");
  }

  if (object.size! < 5 || object.size! > MAX_PDF_BYTES) await rejectFile();
  const { data: signed, error: signedError } = await storage.createSignedUrl(path, 60);
  if (signedError || !signed) throw new Error("Could not inspect uploaded file");
  let header: Uint8Array;
  try {
    const response = await fetch(signed.signedUrl, { headers: { Range: "bytes=0-4" }, cache: "no-store" });
    if (response.status !== 206) throw new Error("Range unsupported");
    header = new Uint8Array(await response.arrayBuffer());
  } catch {
    throw new Error("Could not inspect uploaded file");
  }
  if (header.length !== 5 || new TextDecoder().decode(header) !== "%PDF-") await rejectFile();

  const { error: finalizeError } = await getAdminClient().rpc("finalize_document_upload", {
    p_document_id: docId, p_file_size: object.size!,
  });
  if (finalizeError) throw new Error(finalizeError.message.includes("invalid_status_transition")
    ? "Document was already finalized" : "Could not finalize upload");
  return { docId };
}

export async function cancelUpload(input: unknown) {
  const docId = z.uuid().parse(input);
  const principal = await getPrincipal();
  if (!principal || principal.kind !== "user") throw new Error("Not authorized");
  const user = await getUserClient();
  const { data: document } = await user.from("documents")
    .select("id,project_id,segment_id,upload_status").eq("id", docId).maybeSingle();
  if (!document || !(await authorize(principal,
    { projectId: document.project_id, segmentId: document.segment_id }, "admin_upload"))) {
    throw new Error("Document not found");
  }
  if (document.upload_status !== "pending") throw new Error("Document is no longer pending");
  const { data: segment } = await user.from("segments").select("slug").eq("id", document.segment_id).single();
  if (!segment) throw new Error("Invalid segment");
  const path = `projects/${document.project_id}/${segment.slug}/${docId}.pdf`;
  const storage = getAdminClient().storage.from("documents");
  const { error: removeError } = await storage.remove([path]);
  if (removeError) throw new Error("Could not remove unfinished upload");
  const { error: deleteError } = await user.from("documents").delete()
    .eq("id", docId).eq("upload_status", "pending");
  if (deleteError) throw new Error("Could not cancel unfinished upload");
}

async function authorizeSegments(projectId: string, segmentIds: string[]) {
  const principal = await getPrincipal();
  if (!principal || principal.kind !== "user") throw new Error("Not authorized");
  const allowed = await Promise.all(segmentIds.map((segmentId) => authorize(principal, { projectId, segmentId }, "admin_upload")));
  if (allowed.includes(false)) throw new Error("Not authorized");
  return principal;
}

/** How many people the publish email would reach (step 3 checkbox). */
export async function publishAudienceCount(input: unknown) {
  const { projectId, segmentIds } = z.object({ projectId: z.uuid(), segmentIds: z.array(z.uuid()).min(1).max(50) }).parse(input);
  const principal = await authorizeSegments(projectId, segmentIds);
  return (await publishAudience(projectId, segmentIds, principal.userId)).length;
}

/** One email per person for a whole publish batch, with fixed links only. */
export async function notifyPublished(input: unknown) {
  const { projectId, documentIds } = z.object({ projectId: z.uuid(), documentIds: z.array(z.uuid()).min(1).max(200) }).parse(input);
  const user = await getUserClient();
  const [{ data: docs }, { data: project }, { data: events }] = await Promise.all([
    user.from("documents").select("id,segment_id,doc_number,title,revision").eq("project_id", projectId)
      .in("id", documentIds).eq("upload_status", "ready").is("archived_at", null),
    user.from("projects").select("name,slug").eq("id", projectId).maybeSingle(),
    user.from("document_events").select("document_id,kind").in("document_id", documentIds).in("kind", ["published", "revised"]),
  ]);
  if (!docs?.length || !project) throw new Error("Nothing to announce");
  const principal = await authorizeSegments(projectId, [...new Set(docs.map((d) => d.segment_id))]);
  const audience = await publishAudience(projectId, [...new Set(docs.map((d) => d.segment_id))], principal.userId);
  const request = await headers();
  const base = process.env.PORTAL_URL || `${request.get("x-forwarded-proto") ?? "https"}://${request.get("host")}`;
  const revised = new Set((events ?? []).filter((e) => e.kind === "revised").map((e) => e.document_id));
  const email = publishEmail({
    projectName: project.name, projectUrl: new URL(`/projects/${project.slug}`, base).toString(),
    documents: docs.map((d) => ({ segmentId: d.segment_id, docNumber: d.doc_number, title: d.title, revision: d.revision,
      kind: revised.has(d.id) ? "revised" as const : "new" as const,
      url: new URL(`/projects/${project.slug}/documents/${encodeURIComponent(d.doc_number)}`, base).toString() })),
  });
  const result = await sendPublishEmails(audience, email);
  if (result.sent) {
    // Marks the events of this batch (service role: clients cannot write events).
    await getAdminClient().from("document_events").update({ batch_id: randomUUID() })
      .in("document_id", docs.map((d) => d.id)).in("kind", ["published", "revised"]).is("batch_id", null);
  }
  return { recipients: audience.length, sent: result.sent, configured: result.configured };
}
