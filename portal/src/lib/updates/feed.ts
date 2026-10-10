import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import type { Principal } from "../auth/principal";
import { getAdminClient } from "../supabase/admin";
import { getServerEnv } from "../env";
import { searchScope } from "../documents/list";
import { timed } from "../perf";

/**
 * "What changed since your last visit" (SPEC-ui-ux Fase 5). Everything is read inside the scope that
 * searchScope() authorized: users read document_events under RLS, visitors through the service client
 * filtered by their grants before anything is returned.
 */
export type UpdateKind = "new" | "updated" | "status";
export type Update = {
  documentId: string; projectId: string; segmentId: string; docNumber: string; title: string; revision: string;
  kind: UpdateKind; detail: string; at: string;
};
export type ProjectFeed = { projectId: string; slug: string; name: string; since: string | null; updates: Update[] };

const VISIT_GAP_MS = 30 * 60 * 1000;
const VISITOR_COOKIE = "portal_visits";
type VisitRow = { project_id: string; previous_seen_at: string | null; last_seen_at: string };

/** The "since" of a visit: the last visit if this one has not been recorded yet, else the one before. */
export function effectiveSince(row: Pick<VisitRow, "previous_seen_at" | "last_seen_at"> | undefined, now = Date.now()) {
  if (!row) return null;
  return Date.parse(row.last_seen_at) < now - VISIT_GAP_MS ? row.last_seen_at : row.previous_seen_at;
}

// ---------- Visitor visits: a signed cookie, since access codes have no rows of their own ----------
const key = () => new TextEncoder().encode(getServerEnv().VISITOR_SESSION_SECRET);
type VisitorVisits = Record<string, [string | null, string]>;

async function readVisitorVisits(accessCodeId: string): Promise<VisitorVisits> {
  const token = (await cookies()).get(VISITOR_COOKIE)?.value;
  if (!token) return {};
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    return payload.sid === accessCodeId && payload.v && typeof payload.v === "object" ? payload.v as VisitorVisits : {};
  } catch { return {}; }
}

/** Route handlers only (sets a cookie). Same rules as public.record_project_visit. */
export async function recordVisitorVisits(accessCodeId: string, projectIds: string[], markSeen: boolean) {
  const visits = await readVisitorVisits(accessCodeId);
  const now = new Date().toISOString();
  for (const id of projectIds) {
    const row = visits[id];
    const previous = markSeen ? now : row && Date.parse(row[1]) < Date.now() - VISIT_GAP_MS ? row[1] : row?.[0] ?? null;
    visits[id] = [previous, now];
  }
  const token = await new SignJWT({ sid: accessCodeId, v: visits }).setProtectedHeader({ alg: "HS256" })
    .setIssuedAt().setExpirationTime("180d").sign(key());
  (await cookies()).set(VISITOR_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: 180 * 24 * 3600 });
}

async function visitRows(principal: Principal, client: Awaited<ReturnType<typeof searchScope>>["client"]): Promise<VisitRow[]> {
  if (principal.kind === "visitor") {
    return Object.entries(await readVisitorVisits(principal.accessCodeId))
      .map(([project_id, [previous_seen_at, last_seen_at]]) => ({ project_id, previous_seen_at, last_seen_at }));
  }
  const { data } = await client.from("user_project_visits").select("project_id,previous_seen_at,last_seen_at")
    .eq("user_id", principal.userId);
  return data ?? [];
}

type EventRow = {
  document_id: string; project_id: string; segment_id: string; kind: string; from_value: string | null; to_value: string | null;
  created_at: string;
  documents: { title: string; doc_number: string; revision: string; upload_status: string; archived_at: string | null } | null;
};

const statusText: Record<string, string> = {
  draft: "Draft", for_review: "For review", issued_for_construction: "Issued for construction", as_built: "As-built",
};

/** Updates per visible project since the viewer's last visit. Shared by the layout and the pages. */
// Keyed by the (request-cached) principal; the scope comes from the same cached load as the sidebar.
export const updatesFeed = cache((principal: Principal) => timed("updatesFeed", async () => {
  const scope = await searchScope(principal);
  const rows = await visitRows(principal, scope.client);
  const visits = new Map(rows.map((row) => [row.project_id, row]));
  // A project never opened counts from the most recent visit anywhere ("since you were last here").
  const known = rows.map((row) => effectiveSince(row)).filter((v): v is string => !!v).sort();
  const fallback = known.at(-1) ?? null;
  const since = new Map(scope.projects.map((p) => [p.id, visits.has(p.id) ? effectiveSince(visits.get(p.id)) : fallback]));
  const starts = [...since.values()].filter((v): v is string => !!v).sort();
  const feeds: ProjectFeed[] = scope.projects.map((p) => ({ projectId: p.id, slug: p.slug, name: p.name, since: since.get(p.id) ?? null, updates: [] }));
  if (!starts.length || !scope.pairs.length) return { feeds, total: 0 };

  const ids = scope.projects.filter((p) => since.get(p.id)).map((p) => p.id);
  const { data, error } = await scope.client.from("document_events")
    .select("document_id,project_id,segment_id,kind,from_value,to_value,created_at,documents(title,doc_number,revision,upload_status,archived_at)")
    .in("project_id", ids).gt("created_at", starts[0]).in("kind", ["published", "revised", "status_changed", "made_current"])
    .order("created_at", { ascending: false }).limit(500);
  if (error) return { feeds, total: 0 }; // the feed is optional; the page still works
  const allowed = new Set(scope.pairs.map((pair) => `${pair.project_id}:${pair.segment_id}`));
  const byProject = new Map(feeds.map((feed) => [feed.projectId, feed]));
  const seen = new Set<string>();
  for (const event of (data ?? []) as unknown as EventRow[]) {
    const doc = event.documents;
    const feed = byProject.get(event.project_id);
    if (!doc || !feed || doc.upload_status !== "ready" || doc.archived_at) continue;
    if (!allowed.has(`${event.project_id}:${event.segment_id}`)) continue;
    if (!feed.since || event.created_at <= feed.since) continue;
    // One line per drawing: its latest change.
    const drawing = `${event.project_id}:${event.segment_id}:${doc.doc_number}`;
    if (seen.has(drawing)) continue;
    seen.add(drawing);
    const kind: UpdateKind = event.kind === "published" ? "new" : event.kind === "status_changed" ? "status" : "updated";
    const detail = event.kind === "published" ? `New · Rev ${doc.revision}`
      : event.kind === "status_changed" ? `${statusText[event.from_value ?? ""] ?? event.from_value} → ${statusText[event.to_value ?? ""] ?? event.to_value}`
      : event.kind === "made_current" ? `Rev ${event.to_value} is current` : `New revision · Rev ${event.to_value}`;
    feed.updates.push({ documentId: event.document_id, projectId: event.project_id, segmentId: event.segment_id,
      docNumber: doc.doc_number, title: doc.title, revision: doc.revision, kind, detail, at: event.created_at });
  }
  return { feeds, total: feeds.reduce((sum, feed) => sum + feed.updates.length, 0) };
}));

export type RecentDocument = { id: string; title: string; docNumber: string; revision: string; projectName: string; href: string; viewedAt: string };

/** The viewer's own recently opened drawings, re-checked against what they can still see. */
export const recentlyViewed = cache(async (principal: Principal): Promise<RecentDocument[]> => {
  const scope = await searchScope(principal);
  // access_logs is admin-only under RLS: read the caller's own rows on the server, by their own id.
  let query = getAdminClient().from("access_logs").select("document_id,created_at").eq("action", "view")
    .not("document_id", "is", null).order("created_at", { ascending: false }).limit(60);
  query = principal.kind === "user" ? query.eq("user_id", principal.userId) : query.eq("access_code_id", principal.accessCodeId);
  const { data: logs } = await query;
  const order: string[] = [];
  const when = new Map<string, string>();
  for (const log of logs ?? []) if (log.document_id && !when.has(log.document_id)) { when.set(log.document_id, log.created_at); order.push(log.document_id); }
  if (!order.length) return [];
  const { data: docs } = await scope.client.from("documents")
    .select("id,title,doc_number,revision,project_id,segment_id,upload_status,archived_at").in("id", order.slice(0, 30));
  const allowed = new Set(scope.pairs.map((pair) => `${pair.project_id}:${pair.segment_id}`));
  const projects = new Map(scope.projects.map((p) => [p.id, p]));
  const byId = new Map((docs ?? []).map((doc) => [doc.id, doc]));
  const result: RecentDocument[] = [];
  const numbers = new Set<string>();
  for (const id of order) {
    const doc = byId.get(id);
    const project = doc && projects.get(doc.project_id);
    if (!doc || !project || doc.upload_status !== "ready" || doc.archived_at || !allowed.has(`${doc.project_id}:${doc.segment_id}`)) continue;
    const drawing = `${doc.project_id}:${doc.segment_id}:${doc.doc_number}`;
    if (numbers.has(drawing)) continue;
    numbers.add(drawing);
    result.push({ id, title: doc.title, docNumber: doc.doc_number, revision: doc.revision, projectName: project.name,
      // The fixed link always opens the current revision.
      href: `/projects/${project.slug}/documents/${encodeURIComponent(doc.doc_number)}`, viewedAt: when.get(id)! });
    if (result.length === 6) break;
  }
  return result;
});

/** Publish emails are on unless the user turned them off for this project. */
export async function isWatching(principal: Principal, projectId: string) {
  if (principal.kind !== "user") return false;
  const { getUserClient } = await import("../supabase/server");
  const { data } = await (await getUserClient()).from("project_watchers").select("enabled")
    .eq("user_id", principal.userId).eq("project_id", projectId).maybeSingle();
  return data?.enabled ?? true;
}
