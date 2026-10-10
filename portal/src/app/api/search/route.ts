import { z } from "zod";
import { getIdentity, getPrincipal } from "@/lib/auth/principal";
import { isAdminPrincipal } from "@/lib/auth/authorize";
import { preload, searchScope } from "@/lib/documents/list";
import { docStatusLabels, label } from "@/lib/format";

const headers = { "Cache-Control": "private, no-store" };
const query = z.object({ q: z.string().trim().min(2).max(80), history: z.enum(["0", "1"]).default("0") });

export type SearchResults = {
  documents: { id: string; number: string; title: string; revision: string; status: string; current: boolean;
    project: string; discipline: string; href: string }[];
  projects: { slug: string; name: string; location: string | null; href: string }[];
  actions: { label: string; hint?: string; href: string }[];
};

/** ⌘K: documents (current revisions unless history=1), projects and admin actions the principal may use. */
export async function GET(request: Request) {
  const preloaded = preload(await getIdentity());
  const principal = await getPrincipal();
  if (!principal) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  const parsed = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ documents: [], projects: [], actions: [] } satisfies SearchResults, { headers });
  const { q, history } = parsed.data;

  const scope = await searchScope(principal, preloaded);
  const result: SearchResults = { documents: [], projects: [], actions: [] };
  if (scope.pairs.length) {
    // Visitors search with the service client: the grants are applied inside the query, before the limit.
    const { data, error } = await scope.client.rpc("search_documents",
      { p_query: q, p_scope: scope.pairs, p_include_history: history === "1", p_limit: 20 });
    if (error) return Response.json({ error: "Search unavailable" }, { status: 503, headers });
    const projects = new Map(scope.projects.map((p) => [p.id, p]));
    for (const row of (data ?? []) as { project_id: string; segment_id: string; doc_number: string; title: string;
      revision: string; status: string; is_current: boolean; id: string }[]) {
      const project = projects.get(row.project_id);
      if (!project) continue;
      const base = `/projects/${project.slug}/documents/${encodeURIComponent(row.doc_number)}`;
      result.documents.push({ id: row.id, number: row.doc_number, title: row.title, revision: row.revision,
        status: label(docStatusLabels, row.status), current: row.is_current, project: project.name,
        discipline: project.segments.find((s) => s.id === row.segment_id)?.name ?? "",
        href: row.is_current ? base : `${base}?rev=${encodeURIComponent(row.revision)}` });
    }
  }
  const words = q.toLowerCase();
  result.projects = scope.projects.filter((p) => p.name.toLowerCase().includes(words) || (p.location ?? "").toLowerCase().includes(words))
    .slice(0, 5).map((p) => ({ slug: p.slug, name: p.name, location: p.location, href: `/projects/${p.slug}` }));
  if (isAdminPrincipal(principal)) {
    const top = result.documents[0];
    if (top) result.actions.push({ label: `Upload new revision of ${top.number}`, hint: "Admin",
      href: `/admin/projects/${top.href.split("/")[2]}/documents/new?revisionOf=${top.id}` });
    for (const project of result.projects.slice(0, 2)) result.actions.push({ label: `Upload PDFs to ${project.name}`, hint: "Admin",
      href: `/admin/projects/${project.slug}/documents/new` });
    const actions = [
      { label: "Create access code", hint: "Admin", href: "/admin/codes?new=1", words: ["code", "access", "guest", "create"] },
      { label: "Invite people", hint: "Admin", href: "/admin/users?new=1", words: ["invite", "user", "people", "member", "add"] },
    ];
    for (const action of actions) if (action.words.some((word) => word.startsWith(words) || words.includes(word)))
      result.actions.push({ label: action.label, hint: action.hint, href: action.href });
  }
  if (result.documents.length && history === "0") result.actions.unshift({ label: `Show all revisions of ${result.documents[0].number}`,
    href: `/projects/${result.documents[0].href.split("/")[2]}?segment=all&revisions=all&q=${encodeURIComponent(result.documents[0].number)}` });
  return Response.json(result, { headers });
}
