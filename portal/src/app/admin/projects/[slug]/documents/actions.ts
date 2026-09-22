"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getPrincipal } from "@/lib/auth/principal";
import { authorize } from "@/lib/auth/authorize";
import { getUserClient } from "@/lib/supabase/server";

export async function setDocumentArchived(form: FormData) {
  const id = z.uuid().parse(form.get("id"));
  const archived = z.enum(["true", "false"]).parse(form.get("archived")) === "true";
  const principal = await getPrincipal();
  const user = await getUserClient();
  const { data: document, error: readError } = await user.from("documents")
    .select("id,project_id,segment_id,upload_status,archived_at")
    .eq("id", id).maybeSingle();
  if (readError || !document || document.upload_status !== "ready" ||
      !(await authorize(principal, { projectId: document.project_id, segmentId: document.segment_id }, "admin_manage"))) {
    throw new Error("Document not found");
  }
  if (Boolean(document.archived_at) === archived) return;
  if (!archived && !(await authorize(principal,
    { projectId: document.project_id, segmentId: document.segment_id }, "admin_upload"))) {
    throw new Error("Restore the project first");
  }
  const { data, error } = await user.from("documents")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id).select("id").maybeSingle();
  if (error || !data) throw new Error("Could not change document archive status");
  revalidatePath("/admin/projects");
  revalidatePath("/projects");
}
