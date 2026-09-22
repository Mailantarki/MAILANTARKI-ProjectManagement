import Link from "next/link";
import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/principal";
import { isAdminPrincipal } from "@/lib/auth/authorize";
import { getUserClient } from "@/lib/supabase/server";
import { parseLogFilters, applyLogFilters } from "@/lib/admin/log-filters";

export default async function AdminLogsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!isAdminPrincipal(await getPrincipal())) redirect("/login");
  const raw = await searchParams;
  const filters = parseLogFilters(raw);
  const user = await getUserClient();
  const query = applyLogFilters(user.from("access_logs")
    .select("id,user_id,access_code_id,project_id,document_id,document_title,doc_number,project_name,action,ip,created_at", { count: "exact" }), filters)
    .order("created_at", { ascending: false }).range((filters.page - 1) * 25, filters.page * 25 - 1);
  const [{ data: logs, error, count }, { data: profiles }, { data: codes }, { data: projects }] = await Promise.all([
    query,
    user.from("profiles").select("id,full_name").order("full_name"),
    user.from("access_codes").select("id,label").order("label"),
    user.from("projects").select("id,name").order("name"),
  ]);
  if (error) throw new Error("Could not load access logs");
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) if (typeof value === "string" && value) params.set(key, value);
  params.delete("page");
  const exportUrl = `/admin/logs/export?${params.toString()}`;
  const pages = Math.max(1, Math.ceil((count ?? 0) / 25));
  const pageUrl = (page: number) => { const next = new URLSearchParams(params); next.set("page", String(page)); return `/admin/logs?${next}`; };
  return <main className="main portal"><div className="admin-page-title"><h1>Access logs</h1>
    <Link className="button secondary" href={exportUrl}>Export CSV</Link></div>
    <form className="filters" action="/admin/logs" method="get">
      <label>User<select name="userId" defaultValue={filters.userId ?? ""}><option value="">All</option>{(profiles ?? []).map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name}</option>)}</select></label>
      <label>Code<select name="codeId" defaultValue={filters.codeId ?? ""}><option value="">All</option>{(codes ?? []).map((code) => <option key={code.id} value={code.id}>{code.label}</option>)}</select></label>
      <label>Project<select name="projectId" defaultValue={filters.projectId ?? ""}><option value="">All</option>{(projects ?? []).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      <label>Action<select name="action" defaultValue={filters.action ?? ""}><option value="">All</option>{["login","code_redeem","view","download"].map((action) => <option key={action} value={action}>{action.replaceAll("_", " ")}</option>)}</select></label>
      <label>Document ID<input name="documentId" defaultValue={filters.documentId ?? ""} /></label>
      <label>From<input name="from" type="date" defaultValue={filters.from ?? ""} /></label>
      <label>To<input name="to" type="date" defaultValue={filters.to ?? ""} /></label>
      <button type="submit">Filter</button><Link href="/admin/logs">Clear</Link>
    </form>
    <p className="results-count">{count ?? 0} events</p>
    <div className="table-scroll"><table className="document-table"><thead><tr>
      <th>Time</th><th>Actor</th><th>Project</th><th>Action</th><th>Document</th><th>IP</th>
    </tr></thead><tbody>{(logs ?? []).map((log) => <tr key={log.id}>
      <td>{new Date(log.created_at).toLocaleString("en-GB")}</td>
      <td>{log.user_id ? profiles?.find((profile) => profile.id === log.user_id)?.full_name ?? log.user_id
        : codes?.find((code) => code.id === log.access_code_id)?.label ?? log.access_code_id}</td>
      <td>{log.project_name ?? projects?.find((project) => project.id === log.project_id)?.name ?? ""}</td>
      <td>{log.action}</td><td>{log.document_title ?? ""}{log.doc_number ? ` (${log.doc_number})` : ""}</td>
      <td>{log.ip ?? ""}</td>
    </tr>)}</tbody></table></div>
    {!logs?.length && <p className="empty-results">No matching events.</p>}
    <div className="pagination">{filters.page > 1 && <Link href={pageUrl(filters.page - 1)}>Previous</Link>}
      <span>{filters.page} / {pages}</span>{filters.page < pages && <Link href={pageUrl(filters.page + 1)}>Next</Link>}</div>
  </main>;
}
