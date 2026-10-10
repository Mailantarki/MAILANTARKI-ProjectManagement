import { z } from "zod";
import { Zip, ZipPassThrough } from "fflate";
import { getPrincipal } from "@/lib/auth/principal";
import { authorize } from "@/lib/auth/authorize";
import { searchScope } from "@/lib/documents/list";
import { getAdminClient } from "@/lib/supabase/admin";
import { requestIp } from "@/lib/auth/rate-limit";

const headers = { "Cache-Control": "no-store" };
const missing = () => Response.json({ error: "Not found" }, { status: 404, headers });
const MAX_FILES = 300;
const MAX_BYTES = 500 * 1024 * 1024;
const safe = (text: string) => text.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 120);

/**
 * The current set of one discipline as a ZIP (SPEC-ui-ux Fase 7). Same rule as a single download:
 * authorize "download" first, then one access_logs row per document. Files are streamed straight
 * from Storage; nothing is cached and no file URL leaves the server.
 */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const principal = await getPrincipal();
  if (!principal) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  const slug = z.string().regex(/^[a-z0-9-]+$/).max(120).safeParse((await context.params).slug);
  const segmentSlug = z.string().regex(/^[a-z-]+$/).max(60).safeParse(new URL(request.url).searchParams.get("segment"));
  if (!slug.success || !segmentSlug.success) return Response.json({ error: "Invalid request" }, { status: 400, headers });

  const { projects } = await searchScope(principal);
  const project = projects.find((p) => p.slug === slug.data);
  const segment = project?.segments.find((s) => s.slug === segmentSlug.data);
  if (!project || !segment) return missing();
  const target = { projectId: project.id, segmentId: segment.id };
  if (!await authorize(principal, target, "download")) return missing();

  const admin = getAdminClient();
  const { data: documents, error } = await admin.from("documents")
    .select("id,doc_number,title,revision,file_path,file_size,projects(organization_id)")
    .eq("project_id", project.id).eq("segment_id", segment.id).eq("is_current", true)
    .eq("upload_status", "ready").is("archived_at", null).order("doc_number").limit(MAX_FILES + 1);
  if (error) return Response.json({ error: "Documents unavailable" }, { status: 503, headers });
  if (!documents?.length) return missing();
  if (documents.length > MAX_FILES || documents.reduce((sum, d) => sum + d.file_size, 0) > MAX_BYTES) {
    return Response.json({ error: "This set is too large for one ZIP. Download the documents one by one." }, { status: 413, headers });
  }

  const organizationId = (Array.isArray(documents[0].projects) ? documents[0].projects[0] : documents[0].projects)?.organization_id ?? null;
  const { error: logError } = await admin.from("access_logs").insert(documents.map((d) => ({
    action: "download" as const, organization_id: organizationId, project_id: project.id, document_id: d.id,
    user_id: principal.kind === "user" ? principal.userId : null,
    access_code_id: principal.kind === "visitor" ? principal.accessCodeId : null,
    ip: requestIp(request), user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
  })));
  if (logError) return Response.json({ error: "Download unavailable" }, { status: 503, headers });

  const used = new Set<string>();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const zip = new Zip((err, chunk, final) => {
        if (err) { controller.error(err); return; }
        controller.enqueue(chunk);
        if (final) controller.close();
      });
      try {
        for (const doc of documents) {
          let name = `${safe(doc.doc_number)} ${safe(doc.title)} Rev ${safe(doc.revision)}.pdf`;
          for (let n = 2; used.has(name.toLowerCase()); n++) name = name.replace(/( \(\d+\))?\.pdf$/, ` (${n}).pdf`);
          used.add(name.toLowerCase());
          const { data: file, error: fileError } = await admin.storage.from("documents").download(doc.file_path);
          if (fileError || !file) throw new Error("file unavailable");
          const entry = new ZipPassThrough(name); // PDFs are already compressed: store them as they are
          zip.add(entry);
          entry.push(new Uint8Array(await file.arrayBuffer()), true);
        }
        zip.end();
      } catch (cause) { controller.error(cause); }
    },
  });
  const date = new Date().toISOString().slice(0, 10);
  const filename = `${project.name}_${segment.name}_current-set_${date}`.replace(/[^a-zA-Z0-9._-]+/g, "-") + ".zip";
  return new Response(stream, { headers: { ...headers, "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="${filename}"` } });
}
