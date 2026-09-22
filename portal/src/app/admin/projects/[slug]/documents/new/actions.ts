"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getPrincipal } from "@/lib/auth/principal";
import { authorize } from "@/lib/auth/authorize";
import { getUserClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { documentMetaSchema, MAX_PDF_BYTES } from "@/lib/admin/upload-schema";

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
