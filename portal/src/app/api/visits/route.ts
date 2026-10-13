import { z } from "zod";
import { getPrincipal } from "@/lib/auth/principal";
import { searchScope } from "@/lib/documents/list";
import { getUserClient } from "@/lib/supabase/server";
import { recordVisitorVisits } from "@/lib/updates/feed";

const headers = { "Cache-Control": "no-store" };
const body = z.object({
  projectIds: z.array(z.uuid()).max(100).optional(),
  all: z.boolean().optional(),
  markSeen: z.boolean().optional(),
}).refine((value) => value.all || value.projectIds?.length, "projectIds or all");

/**
 * Records that the viewer opened a project (or marks updates as seen). Only projects the viewer can
 * see are recorded; anything else is ignored silently.
 */
export async function POST(request: Request) {
  const principal = await getPrincipal();
  if (!principal) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400, headers });
  const { projects } = await searchScope(principal);
  const visible = new Set(projects.map((p) => p.id));
  const ids = parsed.data.all ? [...visible] : (parsed.data.projectIds ?? []).filter((id) => visible.has(id));
  const markSeen = parsed.data.markSeen ?? false;
  if (!ids.length) return new Response(null, { status: 204, headers });
  if (principal.kind === "visitor") {
    await recordVisitorVisits(principal.accessCodeId, ids, markSeen);
  } else {
    const client = await getUserClient();
    const results = await Promise.all(ids.map((id) => client.rpc("record_project_visit", { p_project_id: id, p_mark_seen: markSeen })));
    if (results.some((r) => r.error)) return Response.json({ error: "Could not record the visit" }, { status: 503, headers });
  }
  return new Response(null, { status: 204, headers });
}
