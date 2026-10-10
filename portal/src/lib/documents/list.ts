import "server-only";
import { z } from "zod";
import { authorizeWithReader, memoryReader, type AccessSnapshot, type ProjectAccess } from "../auth/authorize";
import type { Principal } from "../auth/principal";
import { getAdminClient } from "../supabase/admin";
import { getUserClient } from "../supabase/server";
import { isStoragePath, signStorageUrls } from "../storage/signed-urls";
import { timed } from "../perf";

const types = ["plan", "section", "elevation", "detail", "specification", "schedule", "report", "other"] as const;
const statuses = ["draft", "for_review", "issued_for_construction", "as_built"] as const;
const date = z.iso.date();
const fields = {
  segment: z.string().regex(/^[a-z-]+$/),
  type: z.enum(types), status: z.enum(statuses),
  revision: z.string().max(40).regex(/^[a-zA-Z0-9._ -]+$/),
  from: date, to: date, q: z.string().trim().min(1).max(100),
  page: z.coerce.number().int().min(1).max(10000),
  // "all" lists superseded revisions too; the default is the current set.
  revisions: z.literal("all"),
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

type Segment = { id: string; slug: string; name: string; sort_order: number };
type ProjectRow = {
  id: string; slug: string; name: string; location: string | null; cover_image_url: string | null;
  organization_id: string; archived_at: string | null;
  organizations: { archived_at: string | null } | { archived_at: string | null }[] | null;
};
type Authorized = { project: ProjectRow; segments: Segment[] };

const PROJECT_FIELDS = "id,slug,name,location,cover_image_url,organization_id,archived_at,organizations(archived_at)";
const one = <T>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? value[0] ?? null : value ?? null);
const access = (project: ProjectRow): ProjectAccess => ({
  organization_id: project.organization_id, archived_at: project.archived_at, organizations: one(project.organizations),
});

/** Who the request claims to be, read from cookies without a network call (verified later by getPrincipal). */
export type Identity = { kind: "user"; userId: string } | { kind: "visitor"; accessCodeId: string };
export type Preloaded = { identity: Identity; slug?: string; data: Promise<RawData> };

type RawData = {
  client: Awaited<ReturnType<typeof getUserClient>> | ReturnType<typeof getAdminClient>;
  projects: ProjectRow[];
  segments: Segment[];
  snapshot: AccessSnapshot;
  /** null when the database still has the older document_counts(uuid[]) function. */
  countRows: CountRow[] | null;
};

/**
 * One parallel round: projects, segments, the identity's grants and the document counts.
 * Nothing here is shown until authorizeRaw() has checked it against the verified principal.
 */
async function loadRaw(identity: Identity, slug?: string): Promise<RawData> {
  const admin = getAdminClient();
  const segmentsQuery = admin.from("segments").select("id,slug,name,sort_order").order("sort_order");
  const countsQuery = admin.rpc("document_counts", slug ? { p_project_slug: slug } : {}).then(missingIsNull);

  if (identity.kind === "visitor") {
    const [grants, code, segmentRows, counts] = await Promise.all([
      admin.from("access_code_grants").select(`project_id,segment_id,projects(${PROJECT_FIELDS})`)
        .eq("access_code_id", identity.accessCodeId),
      admin.from("access_codes").select("organization_id,is_active,expires_at,allow_download")
        .eq("id", identity.accessCodeId).maybeSingle(),
      segmentsQuery,
      countsQuery,
    ]);
    for (const result of [grants, code, segmentRows]) if (result.error) throw result.error;
    const byId = new Map<string, ProjectRow>();
    for (const grant of grants.data ?? []) {
      const project = one(grant.projects as unknown as ProjectRow | ProjectRow[] | null);
      if (project && !project.archived_at && (!slug || project.slug === slug)) byId.set(project.id, project);
    }
    return {
      client: admin,
      projects: [...byId.values()].sort((a, b) => a.name.localeCompare(b.name)),
      segments: segmentRows.data ?? [],
      snapshot: { projects: new Map(), visitor: { accessCodeId: identity.accessCodeId, code: code.data,
        grants: (grants.data ?? []).map((g) => ({ project_id: g.project_id, segment_id: g.segment_id })) } },
      countRows: counts,
    };
  }

  const client = await getUserClient();
  // Projects come from the service client, like the per-target reader in authorize.ts: a member cannot
  // read their organization row under RLS, and authorizeWithReader() needs its archive status.
  // Nothing is shown before every (project, segment) pair is authorized in memory.
  let query = admin.from("projects").select(PROJECT_FIELDS).is("archived_at", null).order("name");
  if (slug) query = query.eq("slug", slug);
  // Member grants are loaded for every user; admins simply never consult them.
  const [projectRows, segmentRows, memberRows, counts] = await Promise.all([
    query,
    segmentsQuery,
    admin.from("user_project_access").select("project_id,segment_id,can_download").eq("user_id", identity.userId),
    countsQuery,
  ]);
  for (const result of [projectRows, segmentRows, memberRows]) if (result.error) throw result.error;
  return {
    client,
    projects: (projectRows.data ?? []) as unknown as ProjectRow[],
    segments: segmentRows.data ?? [],
    snapshot: { projects: new Map(), member: { userId: identity.userId, grants: memberRows.data ?? [] } },
    countRows: counts,
  };
}

const identityOf = (principal: Principal): Identity => principal.kind === "user"
  ? { kind: "user", userId: principal.userId } : { kind: "visitor", accessCodeId: principal.accessCodeId };
const sameIdentity = (a: Identity, b: Identity) => a.kind === "user"
  ? b.kind === "user" && a.userId === b.userId : b.kind === "visitor" && a.accessCodeId === b.accessCodeId;

/** Starts loading page data from the cookie identity, in parallel with getPrincipal(). */
export function preload(identity: Identity | null, slug?: string): Preloaded | undefined {
  if (!identity) return undefined;
  const data = loadRaw(identity, slug);
  data.catch(() => undefined); // surfaced (or ignored) where it is awaited
  return { identity, slug, data };
}

/** Authorizes every (project, segment) pair in memory against the verified principal. */
async function authorizedProjects(principal: Principal, slug?: string, preloaded?: Preloaded) {
  const identity = identityOf(principal);
  const raw = preloaded && preloaded.slug === slug && sameIdentity(preloaded.identity, identity)
    ? await preloaded.data : await loadRaw(identity, slug);
  const { client, projects, segments, snapshot, countRows } = raw;
  for (const project of projects) snapshot.projects.set(project.id, access(project));
  const reader = memoryReader(snapshot);
  const items: Authorized[] = [];
  for (const project of projects) {
    const allowed: Segment[] = [];
    for (const segment of segments) {
      if (await authorizeWithReader(principal, { projectId: project.id, segmentId: segment.id }, "view", reader)) allowed.push(segment);
    }
    if (allowed.length) items.push({ project, segments: allowed });
  }
  const countBy = new Map<string, number>();
  for (const row of countRows ?? await legacyCounts(items.map((item) => item.project.id))) countBy.set(`${row.project_id}:${row.segment_id}`, Number(row.count));
  return { client, items, reader, countBy };
}

/**
 * Until migration 20261006000200 is applied, document_counts only accepts project IDs (PGRST202 for
 * the new arguments). Fall back to a second round with the IDs instead of failing the whole page.
 */
function missingIsNull(result: { data: unknown; error: { code?: string } | null }): CountRow[] | null {
  if (result.error?.code === "PGRST202") {
    console.warn("document_counts(p_project_ids, p_project_slug) not found: run `supabase db push` (migration 20261006000200)");
    return null;
  }
  if (result.error) throw result.error;
  return (result.data ?? []) as CountRow[];
}

async function legacyCounts(projectIds: string[]): Promise<CountRow[]> {
  if (!projectIds.length) return [];
  const { data, error } = await getAdminClient().rpc("document_counts", { p_project_ids: projectIds });
  if (error) throw error;
  return (data ?? []) as CountRow[];
}

type CountRow = { project_id: string; segment_id: string; count: number | string };

/** Adds the per-segment counts and cover URLs (cached signed URLs; one Storage request on a miss). */
async function withCountsAndCovers(items: Authorized[], countBy: Map<string, number>) {
  if (!items.length) return [];
  const covers = await signStorageUrls("project-covers", items.map((item) => item.project.cover_image_url).filter(isStoragePath));
  return items.map(({ project, segments }) => {
    const withCounts = segments.map((segment) => ({ ...segment, count: countBy.get(`${project.id}:${segment.id}`) ?? 0 }));
    const cover = project.cover_image_url;
    return {
      id: project.id, slug: project.slug, name: project.name, location: project.location,
      coverImageUrl: isStoragePath(cover) ? covers.get(cover) ?? null : cover,
      segments: withCounts, count: withCounts.reduce((sum, item) => sum + item.count, 0),
    };
  });
}

export async function visibleProjects(principal: Principal, preloaded?: Preloaded) {
  return timed("visibleProjects", async () => {
    const { items, countBy } = await authorizedProjects(principal, undefined, preloaded);
    return withCountsAndCovers(items, countBy);
  });
}

export const ALL_SEGMENTS = "all";
export const PAGE_SIZE = 10;

export type ProjectDocument = {
  id: string; title: string; doc_number: string; doc_type: string; revision: string; status: string;
  issue_date: string | null; file_size: number; segment_id: string; is_featured: boolean;
  is_current: boolean; superseded_at: string | null;
};
const DOCUMENT_FIELDS = "id,title,doc_number,doc_type,revision,status,issue_date,file_size,segment_id,is_featured,is_current,superseded_at";

/**
 * One project's documents for the verified principal. Shows the current set unless
 * `filters.revisions === "all"`; `openId` additionally returns that document (any revision)
 * so the page can open the viewer on load, if the principal may see it.
 */
export async function projectDocuments(principal: Principal, slug: string, filters: Filters, preloaded?: Preloaded, openId?: string) {
  return timed("projectDocuments", async () => {
    const { client, items, reader, countBy } = await authorizedProjects(principal, slug, preloaded);
    const item = items.find((candidate) => candidate.project.slug === slug);
    if (!item) return null;
    const all = filters.segment === ALL_SEGMENTS;
    const history = filters.revisions === "all";
    const chosen = all ? null : item.segments.find((s) => s.slug === filters.segment) ?? item.segments[0];
    const segmentIds = chosen ? [chosen.id] : item.segments.map((s) => s.id);
    // Both clients are constrained by the previously authorized project and segments.
    const visible = () => client.from("documents").select(DOCUMENT_FIELDS, { count: "exact" })
      .eq("project_id", item.project.id).in("segment_id", segmentIds).eq("upload_status", "ready").is("archived_at", null);
    let query = visible();
    if (!history) query = query.eq("is_current", true);
    if (filters.type) query = query.eq("doc_type", filters.type);
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.revision) query = query.eq("revision", filters.revision);
    if (filters.from) query = query.gte("issue_date", filters.from);
    if (filters.to) query = query.lte("issue_date", filters.to);
    if (filters.q) query = query.textSearch("search_vector", filters.q, { type: "websearch", config: "simple" });
    // The history keeps each number's revisions together, current first.
    query = history
      ? query.order("doc_number").order("is_current", { ascending: false }).order("created_at", { ascending: false })
      : query.order("is_featured", { ascending: false }).order("issue_date", { ascending: false, nullsFirst: false });
    const page = filters.page ?? 1;
    // "N earlier" per number: the superseded rows of the visible segments (doc numbers only, no files).
    const earlierQuery = client.from("documents").select("segment_id,doc_number")
      .eq("project_id", item.project.id).in("segment_id", segmentIds).eq("upload_status", "ready")
      .is("archived_at", null).eq("is_current", false).limit(5000);
    const openQuery = openId
      ? client.from("documents").select(DOCUMENT_FIELDS).eq("id", openId).eq("project_id", item.project.id)
        .in("segment_id", item.segments.map((s) => s.id)).eq("upload_status", "ready").is("archived_at", null).maybeSingle()
      : null;
    const [[project], { data, count, error }, earlierRows, opened, downloadable] = await Promise.all([
      withCountsAndCovers([item], countBy),
      query.order("id", { ascending: true }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
      earlierQuery,
      openQuery,
      Promise.all(item.segments.map(async (s) => (await authorizeWithReader(principal,
        { projectId: item.project.id, segmentId: s.id }, "download", reader)) ? s.id : null)),
    ]);
    if (error) throw error;
    if (earlierRows.error) throw earlierRows.error;
    const earlierBy = new Map<string, number>();
    for (const row of earlierRows.data ?? []) {
      const key = `${row.segment_id}:${row.doc_number}`;
      earlierBy.set(key, (earlierBy.get(key) ?? 0) + 1);
    }
    const documents = ((data ?? []) as ProjectDocument[]).map((doc) => ({
      ...doc, earlier: doc.is_current ? earlierBy.get(`${doc.segment_id}:${doc.doc_number}`) ?? 0 : 0,
    }));
    const segment = chosen
      ? project.segments.find((s) => s.id === chosen.id)!
      : { id: ALL_SEGMENTS, slug: ALL_SEGMENTS, name: "All disciplines", sort_order: -1, count: project.count };
    return { project, segment, documents, count: count ?? 0, page, pageSize: PAGE_SIZE, history,
      opened: (opened?.data ?? null) as ProjectDocument | null,
      downloadable: downloadable.filter((id): id is string => id !== null) };
  });
}
