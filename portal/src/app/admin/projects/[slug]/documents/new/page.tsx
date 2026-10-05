import { notFound } from "next/navigation";
import { getPrincipal } from "@/lib/auth/principal";
import { authorize } from "@/lib/auth/authorize";
import { getUserClient } from "@/lib/supabase/server";
import { UploadForm } from "./upload-form";
import Link from "next/link";
import { projectReturn } from "@/lib/navigation/project-return";
import { ArrowLeft } from "lucide-react";

export default async function NewDocumentsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ returnTo?: string | string[] }> }) {
  const { slug } = await params;
  const back = projectReturn((await searchParams).returnTo, slug, `/admin/projects/${slug}/documents`);
  const principal = await getPrincipal();
  if (!principal) notFound();
  const user = await getUserClient();
  const { data: project } = await user.from("projects").select("id,name").eq("slug", slug).is("archived_at", null).maybeSingle();
  if (!project) notFound();
  const { data: segments } = await user.from("segments").select("id,name,slug").order("sort_order");
  const allowed = [];
  for (const segment of segments ?? []) {
    if (await authorize(principal, { projectId: project.id, segmentId: segment.id }, "admin_upload")) allowed.push(segment);
  }
  if (!allowed.length) notFound();
  return <main className="main portal"><Link className="back-link" href={back}>
    <ArrowLeft size={15} aria-hidden />{back.startsWith("/projects/") ? "Back to project" : "Documents"}</Link><div className="eyebrow">{project.name}</div><h1>Upload documents</h1>
    <UploadForm projectId={project.id} segments={allowed} />
  </main>;
}
