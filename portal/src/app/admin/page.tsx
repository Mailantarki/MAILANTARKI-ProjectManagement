import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/principal";
import { isAdminPrincipal } from "@/lib/auth/authorize";
import { getUserClient } from "@/lib/supabase/server";
import { accessActionLabels, formatDateTime, label } from "@/lib/format";

const DAY = 24 * 60 * 60 * 1000;
// Request-time window for the overview counters.
function lastAndNextWeek() {
  const now = Date.now();
  return { now: new Date(now).toISOString(), weekAgo: new Date(now - 7 * DAY).toISOString(), nextWeek: new Date(now + 7 * DAY).toISOString() };
}

export default async function AdminPage() {
  const user = await getUserClient();
  const { now, weekAgo, nextWeek } = lastAndNextWeek();
  // Queries run under RLS, so they start while the session is verified; nothing renders unless the viewer is an admin.
  const [principal, { data: projects }, uploads, expiring, { data: activity }] = await Promise.all([
    getPrincipal(),
    user.from("projects").select("id,name,slug,location").is("archived_at", null).order("name"),
    user.from("documents").select("id", { count: "exact", head: true })
      .eq("upload_status", "ready").is("archived_at", null).gte("created_at", weekAgo),
    user.from("access_codes").select("id", { count: "exact", head: true })
      .eq("is_active", true).is("deleted_at", null).gte("expires_at", now).lte("expires_at", nextWeek),
    user.from("access_logs").select("id,action,project_name,document_title,doc_number,created_at")
      .order("created_at", { ascending: false }).limit(6),
  ]);
  if (!isAdminPrincipal(principal)) redirect("/login");
  const stats = [
    { value: projects?.length ?? 0, text: "Active projects", href: "/admin/projects" },
    { value: uploads.count ?? 0, text: "Documents added in the last 7 days", href: "/admin/projects" },
    { value: expiring.count ?? 0, text: "Access codes expiring within 7 days", href: "/admin/codes", warning: (expiring.count ?? 0) > 0 },
    { value: activity?.length ? formatDateTime(activity[0].created_at).replace(/, .*/, "") : "-", text: "Latest portal activity", href: "/admin/logs" },
  ];
  return <main className="main portal"><Link className="back-link" href="/projects"><ArrowLeft size={15} aria-hidden />All projects</Link>
    <p className="eyebrow">Administration</p><h1>Overview</h1>
    <div className="stat-grid">{stats.map((stat) => <Link key={stat.text} className={`stat-card${stat.warning ? " warning" : ""}`} href={stat.href}>
      <strong>{stat.value}</strong><span>{stat.text}</span></Link>)}</div>
    <section className="admin-section"><h2>Recent activity</h2>
      {activity?.length ? <ul className="activity-list">{activity.map((entry) => <li key={entry.id}>
        <span>{label(accessActionLabels, entry.action)}{entry.document_title ? ` · ${entry.document_title}` : ""}{entry.project_name ? ` · ${entry.project_name}` : ""}</span>
        <time dateTime={entry.created_at}>{formatDateTime(entry.created_at)}</time></li>)}</ul>
        : <p className="empty-results">No activity yet.</p>}
      <p><Link href="/admin/logs">View all access logs</Link></p>
    </section>
    <section className="admin-section"><h2>Projects</h2>
      <div className="table-scroll"><table className="document-table responsive-table"><thead><tr><th>Project</th><th>Location</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{(projects ?? []).map((project) => <tr key={project.id}><td className="document-title">{project.name}</td><td data-label="Location">{project.location}</td>
          <td className="document-actions"><span className="table-actions"><Link href={`/admin/projects/${project.slug}/documents`}>Manage documents</Link>
            <Link href={`/admin/projects/${project.slug}/documents/new`}>Upload PDFs</Link></span></td></tr>)}</tbody></table></div>
    </section>
  </main>;
}
