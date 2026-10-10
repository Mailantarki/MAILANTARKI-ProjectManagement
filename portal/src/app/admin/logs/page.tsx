import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/principal";
import { isAdminPrincipal } from "@/lib/auth/authorize";
import { getUserClient } from "@/lib/supabase/server";
import { parseLogFilters, applyLogFilters } from "@/lib/admin/log-filters";
import { FilterForm } from "@/components/documents/filter-form";
import { accessActionLabels, adminEventLabels, formatDateTime, label } from "@/lib/format";

const PAGE = 25;

export default async function AdminLogsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const filters = parseLogFilters(raw);
  const adminTab = raw.tab === "admin";
  const user = await getUserClient();
  const range = [(filters.page - 1) * PAGE, filters.page * PAGE - 1] as const;

  // Only the selected tab is queried. Queries run under RLS, so they start while the session is verified;
  // nothing renders unless the viewer is an admin.
  const logsQuery = adminTab ? null : applyLogFilters(user.from("access_logs")
    .select("id,user_id,access_code_id,project_id,document_id,document_title,doc_number,project_name,action,ip,created_at", { count: "exact" }), filters)
    .order("created_at", { ascending: false }).range(...range);
  let eventsQuery = adminTab ? user.from("admin_events").select("id,actor_id,target_user_id,action,details,created_at", { count: "exact" }) : null;
  if (eventsQuery && filters.userId) eventsQuery = eventsQuery.or(`actor_id.eq.${filters.userId},target_user_id.eq.${filters.userId}`);
  if (eventsQuery && filters.projectId) eventsQuery = eventsQuery.eq("details->>project_id", filters.projectId);
  if (eventsQuery && filters.from) eventsQuery = eventsQuery.gte("created_at", `${filters.from}T00:00:00Z`);
  if (eventsQuery && filters.to) eventsQuery = eventsQuery.lt("created_at", new Date(Date.parse(filters.to) + 86400000).toISOString());

  const [principal, logs, events, { data: profiles }, { data: codes }, { data: projects }, { data: segments }] = await Promise.all([
    getPrincipal(),
    logsQuery,
    eventsQuery?.order("created_at", { ascending: false }).order("id").range(...range),
    user.from("profiles").select("id,full_name").order("full_name"),
    user.from("access_codes").select("id,label").order("label"),
    user.from("projects").select("id,name").order("name"),
    user.from("segments").select("id,name"),
  ]);
  if (!isAdminPrincipal(principal)) redirect("/login");
  if (logs?.error) throw new Error("Could not load access logs");
  if (events?.error) throw new Error("Could not load administrative activity");

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) if (typeof value === "string" && value) params.set(key, value);
  params.delete("page");
  const exportParams = new URLSearchParams(params);
  exportParams.delete("tab");
  const count = (adminTab ? events?.count : logs?.count) ?? 0;
  const pages = Math.max(1, Math.ceil(count / PAGE));
  const pageUrl = (page: number) => { const next = new URLSearchParams(params); next.set("page", String(page)); return `/admin/logs?${next}`; };
  const tabUrl = (admin: boolean) => {
    // Filters that exist in both tabs carry over; search and action belong to portal access only.
    const next = new URLSearchParams();
    for (const key of ["userId", "projectId", "from", "to"]) if (params.get(key)) next.set(key, params.get(key)!);
    if (admin) next.set("tab", "admin");
    return `/admin/logs${next.size ? `?${next}` : ""}`;
  };
  const name = (id: string | null) => profiles?.find((profile) => profile.id === id)?.full_name;
  const activeCount = [filters.userId, filters.projectId, filters.from, filters.to,
    ...(adminTab ? [] : [filters.codeId, filters.action])].filter(Boolean).length;

  const userSelect = <label>User<select name="userId" defaultValue={filters.userId ?? ""}><option value="">All users</option>
    {(profiles ?? []).map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name}</option>)}</select></label>;

  return <main className="main portal logs-page"><Link className="back-link" href="/admin"><ArrowLeft size={15} aria-hidden />Administration</Link>
    <div className="admin-page-title"><h1>Activity log</h1>
      {/* Plain link: a <Link> would prefetch the streaming CSV route. */}
      {!adminTab && <a className="button secondary" href={`/admin/logs/export?${exportParams}`} download>Export CSV</a>}</div>
    <nav className="segment-tabs log-tabs" aria-label="Log type">
      <Link href={tabUrl(false)} className={adminTab ? "" : "active"} aria-current={adminTab ? undefined : "page"}>Portal access</Link>
      <Link href={tabUrl(true)} className={adminTab ? "active" : ""} aria-current={adminTab ? "page" : undefined}>Admin activity</Link>
    </nav>
    <FilterForm className="user-filters log-filters" activeCount={activeCount}
      search={adminTab ? <>{userSelect}<input type="hidden" name="tab" value="admin" /></> :
        <label className="filter-search"><span>Document</span><span className="search-field"><Search size={16} aria-hidden />
          <input type="search" name="q" defaultValue={filters.q ?? ""} placeholder="Title or number" maxLength={80} autoComplete="off" /></span></label>}>
      {!adminTab && userSelect}
      {!adminTab && <label>Code<select name="codeId" defaultValue={filters.codeId ?? ""}><option value="">All codes</option>
        {(codes ?? []).map((code) => <option key={code.id} value={code.id}>{code.label}</option>)}</select></label>}
      <label>Project<select name="projectId" defaultValue={filters.projectId ?? ""}><option value="">All projects</option>
        {(projects ?? []).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      {!adminTab && <label>Action<select name="action" defaultValue={filters.action ?? ""}><option value="">All actions</option>
        {["login", "code_redeem", "view", "download"].map((action) => <option key={action} value={action}>{label(accessActionLabels, action)}</option>)}</select></label>}
      <label>From<input name="from" type="date" defaultValue={filters.from ?? ""} /></label>
      <label>To<input name="to" type="date" defaultValue={filters.to ?? ""} /></label>
      {activeCount > 0 || filters.q ? <Link className="clear-filters" href={adminTab ? "/admin/logs?tab=admin" : "/admin/logs"}>Clear</Link> : null}
    </FilterForm>
    <p className="results-count">{count} {count === 1 ? "event" : "events"}</p>

    {!adminTab && <><div className="table-scroll"><table className="document-table responsive-table"><thead><tr>
      <th>Time</th><th>Actor</th><th>Project</th><th>Action</th><th>Document</th><th>IP</th>
    </tr></thead><tbody>{(logs?.data ?? []).map((log) => <tr key={log.id}>
      <td className="document-title">{formatDateTime(log.created_at)}</td>
      <td data-label="Actor">{log.user_id ? name(log.user_id) ?? "User removed"
        : codes?.find((code) => code.id === log.access_code_id)?.label ?? "Code removed"}</td>
      <td data-label="Project">{log.project_name ?? projects?.find((project) => project.id === log.project_id)?.name ?? ""}</td>
      <td data-label="Action">{label(accessActionLabels, log.action)}</td>
      <td data-label="Document">{log.document_title ?? ""}{log.doc_number ? ` (${log.doc_number})` : ""}</td>
      <td data-label="IP">{log.ip ?? ""}</td>
    </tr>)}</tbody></table></div>
    {!logs?.data?.length && <p className="empty-results">No matching events.</p>}</>}

    {adminTab && <><div className="table-scroll"><table className="document-table responsive-table"><thead><tr>
      <th>Time</th><th>Actor</th><th>Action</th><th>User</th><th>Project / discipline</th>
    </tr></thead><tbody>{(events?.data ?? []).map((event) => <tr key={event.id}>
      <td className="document-title">{formatDateTime(event.created_at)}</td>
      <td data-label="Actor">{name(event.actor_id) ?? "System"}</td>
      <td data-label="Action">{label(adminEventLabels, event.action)}</td>
      <td data-label="User">{event.target_user_id ? name(event.target_user_id) ?? "User removed" : "-"}</td>
      <td className="wide-cell" data-label="Project / discipline">
        {projects?.find((project) => project.id === event.details?.project_id)?.name ?? ""}
        {event.details?.segment_id ? ` / ${segments?.find((segment) => segment.id === event.details.segment_id)?.name ?? "Discipline"}` : ""}
        {event.details?.doc_number ? ` · ${event.details.doc_number}${event.details.revision ? ` Rev ${event.details.revision}` : ""}` : ""}
      </td>
    </tr>)}</tbody></table></div>
    {!events?.data?.length && <p className="empty-results">No administrative activity.</p>}</>}

    {pages > 1 && <nav className="pagination" aria-label="Pages">{filters.page > 1 && <Link href={pageUrl(filters.page - 1)}>Previous</Link>}
      <span>{filters.page} / {pages}</span>{filters.page < pages && <Link href={pageUrl(filters.page + 1)}>Next</Link>}</nav>}
  </main>;
}
