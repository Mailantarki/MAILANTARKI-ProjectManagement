import { z } from "zod";
import { getPrincipal } from "../../../../../lib/auth/principal";
import { authorize } from "../../../../../lib/auth/authorize";
import { logAccess } from "../../../../../lib/auth/log";
import { getAdminClient } from "../../../../../lib/supabase/admin";

const idSchema = z.uuid();
const querySchema = z.object({ download: z.enum(["0", "1"]).default("0") });
const headers = { "Cache-Control": "no-store" };
const missing = () => Response.json({ error: "Document not found" }, { status: 404, headers });

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const principal = await getPrincipal();
  if (!principal) {
    const hadVisitorCookie = /(?:^|;\s*)visitor_session=/.test(request.headers.get("cookie") ?? "");
    return hadVisitorCookie ? missing() : Response.json({ error: "Unauthorized" }, { status: 401, headers });
  }
  const params = idSchema.safeParse((await context.params).id);
  const query = querySchema.safeParse({ download: new URL(request.url).searchParams.get("download") ?? "0" });
  if (!params.success || !query.success) return Response.json({ error: "Invalid request" }, { status: 400, headers });

  const admin = getAdminClient();
  const { data: document, error } = await admin.from("documents")
    .select("id,project_id,segment_id,file_path,upload_status,archived_at,doc_number,projects(organization_id)")
    .eq("id", params.data).maybeSingle();
  if (error) return Response.json({ error: "Document unavailable" }, { status: 503, headers });
  if (!document || document.upload_status !== "ready" || document.archived_at) return missing();

  const target = { projectId: document.project_id, segmentId: document.segment_id };
  const downloading = query.data.download === "1";
  if (!await authorize(principal, target, downloading ? "download" : "view")) return missing();
  const allowDownload = downloading || await authorize(principal, target, "download");
  try {
    await logAccess(request, {
      action: downloading ? "download" : "view",
      organization_id: (Array.isArray(document.projects) ? document.projects[0] : document.projects)?.organization_id,
      user_id: principal.kind === "user" ? principal.userId : undefined,
      access_code_id: principal.kind === "visitor" ? principal.accessCodeId : undefined,
      project_id: document.project_id,
      document_id: document.id,
    });
  } catch { console.error("Could not record document access"); }

  const filename = `${document.doc_number.replace(/[^a-zA-Z0-9._-]/g, "_")}.pdf`;
  const { data: signed, error: signError } = await admin.storage.from("documents")
    .createSignedUrl(document.file_path, 300, downloading ? { download: filename } : undefined);
  if (signError || !signed) return Response.json({ error: "Document unavailable" }, { status: 503, headers });

  return Response.json({ url: signed.signedUrl, expiresIn: 300, allowDownload }, { headers });
}
