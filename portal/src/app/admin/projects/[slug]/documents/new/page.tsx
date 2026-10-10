import { notFound } from "next/navigation";
import { z } from "zod";
import { getPrincipal } from "@/lib/auth/principal";
import { authorizeLoadedProject } from "@/lib/auth/authorize";
import { getUserClient } from "@/lib/supabase/server";
import { compareRevisions } from "@/lib/documents/revision";
import { UploadForm, type RevisionTemplate } from "./upload-form";
import Link from "next/link";
import { projectReturn } from "@/lib/navigation/project-return";
import { ArrowLeft } from "lucide-react";

export default async function NewDocumentsPage({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<{ returnTo?: string | string[]; revisionOf?: string | string[] }>;
}) {
  const { slug } = await params;
  const search = await searchParams;
  const back = projectReturn(search.returnTo, slug, `/admin/projects/${slug}/documents`);
  // "New revision" from the documents list: number, title, discipline and type come from that drawing.
  const revisionOf = z.uuid().safeParse(search.revisionOf).data;
  const user = await getUserClient();
  const [principal, { data: project }, { data: segments }, source] = await Promise.all([
    getPrincipal(),
    user.from("projects").select("id,name,organization_id,archived_at,organizations(archived_at)").eq("slug", slug).is("archived_at", null).maybeSingle(),
    user.from("segments").select("id,name,slug").order("sort_order"),
    revisionOf ? user.from("documents").select("id,project_id,segment_id,doc_number,title,doc_type")
      .eq("id", revisionOf).eq("upload_status", "ready").is("archived_at", null).maybeSingle() : null,
  ]);
  if (!principal || !project) notFound();
  // Upload rights depend on role and organization, not on the discipline: authorize once
  // instead of one sequential round-trip per discipline.
  const canUpload = !!segments?.length && await authorizeLoadedProject(principal, project, "admin_upload");
  const allowed = canUpload ? segments ?? [] : [];
  if (!allowed.length) notFound();

  let template: RevisionTemplate | undefined;
  const drawing = source?.data;
  if (drawing && drawing.project_id === project.id) {
    const { data: revisions } = await user.from("documents").select("revision")
      .eq("project_id", project.id).eq("segment_id", drawing.segment_id).eq("doc_number", drawing.doc_number)
      .eq("upload_status", "ready").is("archived_at", null);
    const latest = (revisions ?? []).map((r) => r.revision).sort(compareRevisions).at(-1) ?? "";
    template = { docNumber: drawing.doc_number, title: drawing.title, segmentId: drawing.segment_id,
      docType: drawing.doc_type, latestRevision: latest };
  }

  return <main className="main portal"><Link className="back-link" href={back}>
    <ArrowLeft size={15} aria-hidden />{back.startsWith("/projects/") ? "Back to project" : "Documents"}</Link>
    <div className="eyebrow">{project.name}</div>
    <h1>{template ? `New revision of ${template.docNumber}` : "Upload documents"}</h1>
    {template && <p className="page-lede">{template.title} · current Rev {template.latestRevision}. The file you add is uploaded as the next revision; the current one moves to the history when you publish.</p>}
    <UploadForm projectId={project.id} segments={allowed} template={template} doneHref={back} />
  </main>;
}
