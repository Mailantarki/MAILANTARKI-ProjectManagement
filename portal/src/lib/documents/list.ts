import "server-only";
import { z } from "zod";
import { authorize } from "../auth/authorize";
import type { Principal } from "../auth/principal";
import { getAdminClient } from "../supabase/admin";
import { getUserClient } from "../supabase/server";

const types = ["plan", "section", "elevation", "detail", "specification", "schedule", "report", "other"] as const;
const statuses = ["draft", "for_review", "issued_for_construction", "as_built"] as const;
const date = z.iso.date();
const fields = {
  segment: z.string().regex(/^[a-z-]+$/),
  type: z.enum(types), status: z.enum(statuses),
  revision: z.string().max(40).regex(/^[a-zA-Z0-9._ -]+$/),
  from: date, to: date, q: z.string().trim().min(1).max(100),
  page: z.coerce.number().int().min(1).max(10000),
};
export type Filters = Partial<{ [K in keyof typeof fields]: z.infer<(typeof fields)[K]> }>;

export function parseFilters(input: Record<string, string | string[] | undefined>): Filters {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(fields) as (keyof typeof fields)[]) {
    const raw = input[key];
    if (typeof raw !== "string") continue;
    const parsed = fields[key].safeParse(raw);
    if (parsed.success) result[key] = parsed.data;
  }
  return result as Filters;
}

export async function visibleProjects(principal: Principal) {
  const admin = getAdminClient();
  const client = principal.kind === "user" ? await getUserClient() : admin;
  let query = client.from("projects").select("id,slug,name,location,cover_image_url,organization_id,archived_at")
    .is("archived_at", null).order("name");
  if (principal.kind === "visitor") {
    const { data: grants, error } = await admin.from("access_code_grants")
      .select("project_id").eq("access_code_id", principal.accessCodeId);
    if (error) throw error;
    const ids = [...new Set((grants ?? []).map((g) => g.project_id))];
    if (!ids.length) return [];
    query = query.in("id", ids);
  }
  const { data: projects, error } = await query;
  if (error) throw error;
  const { data: segments, error: segmentError } = await admin.from("segments")
    .select("id,slug,name,sort_order").order("sort_order");
  if (segmentError) throw segmentError;
  const result = [];
  for (const project of projects ?? []) {
    const allowed = [];
    for (const segment of segments ?? []) {
      if (await authorize(principal, { projectId: project.id, segmentId: segment.id }, "view")) allowed.push(segment);
    }
    if (!allowed.length) continue;
    const counts = [];
    for (const segment of allowed) {
      const { count, error: countError } = await client.from("documents").select("id", { count: "exact", head: true })
        .eq("project_id", project.id).eq("segment_id", segment.id).eq("upload_status", "ready").is("archived_at", null);
      if (countError) throw countError;
      counts.push({ ...segment, count: count ?? 0 });
    }
    result.push({ id: project.id, slug: project.slug, name: project.name, location: project.location,
      coverImageUrl: project.cover_image_url,
      segments: counts, count: counts.reduce((sum, item) => sum + item.count, 0) });
  }
  return result;
}

export async function projectDocuments(principal: Principal, slug: string, filters: Filters) {
  const project = (await visibleProjects(principal)).find((p) => p.slug === slug);
  if (!project) return null;
  const segment = project.segments.find((s) => s.slug === filters.segment) ?? project.segments[0];
  const client = principal.kind === "user" ? await getUserClient() : getAdminClient();
  // Both clients are constrained by the previously authorized project and segment.
  let query = client.from("documents")
    .select("id,title,doc_number,doc_type,revision,status,issue_date,file_size,segment_id", { count: "exact" })
    .eq("project_id", project.id).eq("segment_id", segment.id).eq("upload_status", "ready").is("archived_at", null);
  if (filters.type) query = query.eq("doc_type", filters.type);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.revision) query = query.eq("revision", filters.revision);
  if (filters.from) query = query.gte("issue_date", filters.from);
  if (filters.to) query = query.lte("issue_date", filters.to);
  if (filters.q) query = query.textSearch("search_vector", filters.q, { type: "websearch", config: "simple" });
  const page = filters.page ?? 1;
  const { data, count, error } = await query.order("issue_date", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true }).range((page - 1) * 25, page * 25 - 1);
  if (error) throw error;
  return { project, segment, documents: data ?? [], count: count ?? 0, page };
}
