import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getPrincipal } from "@/lib/auth/principal";
import { authorize } from "@/lib/auth/authorize";
import { withNext } from "@/lib/auth/next-path";
import { getAdminClient } from "@/lib/supabase/admin";
import { revisionSortKey } from "@/lib/documents/revision";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string; docNumber: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const slugSchema = z.string().regex(/^[a-z0-9-]{1,100}$/);
const numberSchema = z.string().trim().min(1).max(60);
const decoded = (value: string) => { try { return decodeURIComponent(value); } catch { return value; } };

/**
 * Fixed link to a drawing: /projects/{slug}/documents/{number} always opens the current revision,
 * ?rev=B a specific one. Used in emails and QR codes, so it never contains a signed URL.
 * Redirects to the project page with the viewer open; 404 when the principal may not see it.
 */
export default async function DocumentLink({ params, searchParams }: Props) {
  const raw = await params;
  const slug = slugSchema.safeParse(raw.slug);
  const docNumber = numberSchema.safeParse(decoded(raw.docNumber));
  if (!slug.success || !docNumber.success) notFound();
  const rev = z.string().trim().min(1).max(20).safeParse((await searchParams).rev).data;
  const principal = await getPrincipal();
  if (!principal) redirect(withNext("/", `/projects/${slug.data}/documents/${encodeURIComponent(docNumber.data)}`));

  const admin = getAdminClient();
  const { data: project } = await admin.from("projects").select("id").eq("slug", slug.data).is("archived_at", null).maybeSingle();
  if (!project) notFound();
  const { data: rows } = await admin.from("documents")
    .select("id,segment_id,revision,is_current,segments(slug)")
    .eq("project_id", project.id).eq("doc_number", docNumber.data)
    .eq("upload_status", "ready").is("archived_at", null).limit(100);

  const allowed = new Map<string, boolean>();
  for (const segmentId of new Set((rows ?? []).map((row) => row.segment_id))) {
    allowed.set(segmentId, await authorize(principal, { projectId: project.id, segmentId }, "view"));
  }
  const visible = (rows ?? []).filter((row) => allowed.get(row.segment_id));
  const wanted = rev ? revisionSortKey(rev) : null;
  const chosen = visible.find((row) => wanted === null ? row.is_current : revisionSortKey(row.revision) === wanted);
  if (!chosen) notFound();

  const segment = Array.isArray(chosen.segments) ? chosen.segments[0] : chosen.segments;
  const target = new URLSearchParams({ segment: (segment as { slug: string } | null)?.slug ?? "", open: chosen.id });
  if (!chosen.is_current) { target.set("revisions", "all"); target.set("q", docNumber.data); }
  redirect(`/projects/${slug.data}?${target}`);
}
