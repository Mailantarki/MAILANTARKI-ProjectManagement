import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, Clock3, FileWarning, KeyRound, UserRoundX } from "lucide-react";
import { getPrincipal } from "@/lib/auth/principal";
import { isAdminPrincipal } from "@/lib/auth/authorize";
import { getUserClient } from "@/lib/supabase/server";
import { directorySchema } from "@/lib/admin/user-directory";
import { ProjectAvatar } from "@/components/shell/project-avatar";
import { accessActionLabels, adminEventLabels, docStatusLabels, formatDate, label } from "@/lib/format";
import { DiscardUpload, ExtendThirtyDays, ResendInvite } from "./attention";

const DAY = 24 * 60 * 60 * 1000;
// Request-time window for the overview (kept outside the component render).
function windows() {
  const now = Date.now();
  const iso = (offset: number) => new Date(now + offset).toISOString();
  return { now: iso(0), weekAgo: iso(-7 * DAY), nextWeek: iso(7 * DAY), threeDays: iso(-3 * DAY), month: iso(-30 * DAY), day: iso(-DAY), nowMs: now };
}
type Feed = { id: string; created_at: string; source: string; action: string; actor_name: string | null; project_name: string | null;
  document_title: string | null; doc_number: string | null; detail: string | null };
const documentLabels: Record<string, string> = { published: "Published", revised: "Published a new revision of", status_changed: "Changed the status of",
  archived: "Archived", made_current: "Made current" };
const one = <T,>(value: T | T[] | null): T | null => Array.isArray(value) ? value[0] ?? null : value;

function describe(entry: Feed) {
  const what = [entry.doc_number, entry.document_title].filter(Boolean).join(" ");
  if (entry.source === "document") {
    const detail = entry.action === "status_changed" && entry.detail
      ? ` (${entry.detail.split(" → ").map((s) => label(docStatusLabels, s)).join(" → ")})`
      : entry.detail && entry.action !== "archived" ? ` · Rev ${entry.detail}` : "";
    return `${documentLabels[entry.action] ?? entry.action} ${what}${detail}`;
  }
  if (entry.source === "admin") return `${label(adminEventLabels, entry.action)}${entry.detail ? ` ${entry.detail}` : ""}${what ? ` · ${what}` : ""}`;
  return `${label(accessActionLabels, entry.action)}${what ? ` ${what}` : ""}`;
}
const dayLabel = (iso: string, nowMs: number) => {
  const day = iso.slice(0, 10);
  if (day === new Date(nowMs).toISOString().slice(0, 10)) return "Today";
  if (day === new Date(nowMs - DAY).toISOString().slice(0, 10)) return "Yesterday";
  return formatDate(day);
};
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

export default async function AdminPage() {
  const user = await getUserClient();
  const w = windows();
  const count = (query: PromiseLike<{ count: number | null }>) => Promise.resolve(query).then((r) => r.count ?? 0);
  // Queries run under RLS, so they start while the session is verified; nothing renders unless the viewer is an admin.
  const [principal, { data: projects }, views, downloads, guests, published, { data: expiring }, invited,
    { data: drafts }, { data: pending }, { data: feed }] = await Promise.all([
    getPrincipal(),
    user.from("projects").select("id,name,slug,location").is("archived_at", null).order("name"),
    count(user.from("access_logs").select("id", { count: "exact", head: true }).eq("action", "view").gte("created_at", w.weekAgo)),
    count(user.from("access_logs").select("id", { count: "exact", head: true }).eq("action", "download").gte("created_at", w.weekAgo)),
    count(user.from("access_logs").select("id", { count: "exact", head: true }).eq("action", "code_redeem").gte("created_at", w.weekAgo)),
    count(user.from("document_events").select("id", { count: "exact", head: true }).in("kind", ["published", "revised"]).gte("created_at", w.weekAgo)),
    user.from("access_codes").select("id,label,expires_at").eq("is_active", true).is("deleted_at", null)
      .gte("expires_at", w.now).lte("expires_at", w.nextWeek).order("expires_at").limit(10),
    user.rpc("admin_user_directory", { p_query: "", p_role: "", p_status: "pending", p_project: null, p_organization: null, p_page: 1 }),
    user.from("documents").select("id,project_id,projects(name,slug)").eq("status", "draft").eq("upload_status", "ready")
      .is("archived_at", null).lt("created_at", w.month).limit(500),
    user.from("documents").select("id,title,doc_number,created_at,projects(name,slug)").eq("upload_status", "pending")
      .lt("created_at", w.day).order("created_at").limit(10),
    user.from("activity_feed").select("id,created_at,source,action,actor_name,project_name,document_title,doc_number,detail")
      .order("created_at", { ascending: false }).limit(40),
  ]);
  if (!isAdminPrincipal(principal)) redirect("/login");

  // Invited (temporary password) and never signed in, more than 3 days ago.
  const directory = directorySchema.safeParse(invited.data);
  const neverSigned = directory.success ? directory.data.users.filter((u) => !u.last_sign_in_at) : [];
  const { data: created } = neverSigned.length
    ? await user.from("profiles").select("id,created_at").in("id", neverSigned.map((u) => u.id)) : { data: [] };
  const createdAt = new Map((created ?? []).map((row) => [row.id, row.created_at as string]));
  const staleInvites = neverSigned.filter((u) => (createdAt.get(u.id) ?? w.now) < w.threeDays).slice(0, 10);
  const draftsBy = new Map<string, { name: string; slug: string; count: number }>();
  for (const doc of drafts ?? []) {
    const project = one(doc.projects as unknown as { name: string; slug: string } | null);
    if (!project) continue;
    draftsBy.set(doc.project_id, { ...project, count: (draftsBy.get(doc.project_id)?.count ?? 0) + 1 });
  }
  const attention = (expiring?.length ?? 0) + staleInvites.length + draftsBy.size + (pending?.length ?? 0);

  const stats = [
    { value: views, text: "Document views", href: "/admin/logs?action=view" },
    { value: downloads, text: "Downloads", href: "/admin/logs?action=download" },
    { value: published, text: "Documents published", href: "/admin/projects" },
    { value: guests, text: "Guest sign-ins with a code", href: "/admin/codes" },
  ];
  // Grouped by day; repeats in a row ("signed in" three times) collapse into one line.
  const days = new Map<string, (Feed & { text: string; times: number })[]>();
  for (const entry of (feed ?? []) as Feed[]) {
    const key = dayLabel(entry.created_at, w.nowMs);
    const list = days.get(key) ?? [];
    const text = describe(entry).replace(/^./, (c) => c.toLowerCase());
    const last = list.at(-1);
    if (last && last.actor_name === entry.actor_name && last.text === text && last.project_name === entry.project_name) last.times++;
    else list.push({ ...entry, text, times: 1 });
    days.set(key, list);
  }

  return <main className="main portal admin-overview">
    <h1>Overview</h1>
    <p className="page-lede">Last 7 days</p>
    <div className="stat-grid">{stats.map((stat) => <Link key={stat.text} className="stat-card" href={stat.href}>
      <strong>{stat.value}</strong><span>{stat.text}</span></Link>)}</div>

    <section className="admin-section" aria-labelledby="attention-title">
      <h2 id="attention-title">Needs attention {attention > 0 && <span className="count-pill">{attention}</span>}</h2>
      {attention === 0 ? <p className="attention-empty"><CheckCircle2 size={18} aria-hidden />Nothing needs your attention.</p>
        : <ul className="attention-list">
          {(expiring ?? []).map((code) => <li key={code.id}><KeyRound size={18} aria-hidden className="attention-icon warn" />
            <span><strong>{code.label}</strong> · access code expires {formatDate(code.expires_at)}</span>
            <ExtendThirtyDays id={code.id} expiresAt={code.expires_at!} /></li>)}
          {staleInvites.map((person) => <li key={person.id}><UserRoundX size={18} aria-hidden className="attention-icon" />
            <span><strong>{person.full_name}</strong> · invited {formatDate(createdAt.get(person.id))}, never signed in</span>
            <ResendInvite userId={person.id} /></li>)}
          {[...draftsBy.entries()].map(([id, project]) => <li key={id}><Clock3 size={18} aria-hidden className="attention-icon" />
            <span><strong>{project.count} {project.count === 1 ? "draft" : "drafts"}</strong> older than 30 days in {project.name}</span>
            <Link className="button secondary" href={`/projects/${project.slug}?segment=all&status=draft`}>Review</Link></li>)}
          {(pending ?? []).map((doc) => {
            const project = one(doc.projects as unknown as { name: string; slug: string } | null);
            return <li key={doc.id}><FileWarning size={18} aria-hidden className="attention-icon warn" />
              <span><strong>{doc.doc_number} {doc.title}</strong> · upload did not finish ({project?.name})</span>
              <span className="attention-actions">{project && <Link className="button secondary" href={`/admin/projects/${project.slug}/documents/new`}>Upload again</Link>}
                <DiscardUpload id={doc.id} /></span></li>;
          })}
        </ul>}
    </section>

    <div className="overview-columns">
      <section className="admin-section" aria-labelledby="activity-title">
        <h2 id="activity-title">Activity</h2>
        {days.size ? [...days.entries()].map(([day, entries]) => <div key={day} className="activity-day">
          <h3>{day}</h3>
          <ul className="activity-list">{entries.map((entry) => <li key={`${entry.source}-${entry.id}`}>
            <span><strong>{entry.actor_name ?? "Someone"}</strong> {entry.text}
              {entry.project_name && <span className="activity-project"> · {entry.project_name}</span>}
              {entry.times > 1 && <span className="activity-times"> ×{entry.times}</span>}</span>
            <time dateTime={entry.created_at}>{time(entry.created_at)}</time></li>)}</ul>
        </div>) : <p className="empty-results">No activity yet.</p>}
        <p><Link href="/admin/logs">View the full activity log</Link></p>
      </section>
      <section className="admin-section" aria-labelledby="projects-title">
        <h2 id="projects-title">Projects</h2>
        <ul className="overview-projects">{(projects ?? []).map((project) => <li key={project.id}>
          <ProjectAvatar name={project.name} />
          <span><Link href={`/admin/projects/${project.slug}/documents`}><strong>{project.name}</strong></Link><span>{project.location}</span></span>
          <Link className="button secondary" href={`/admin/projects/${project.slug}/documents/new`}>Upload</Link>
        </li>)}</ul>
        {!projects?.length && <p className="empty-results"><AlertTriangle size={16} aria-hidden /> No active projects.</p>}
      </section>
    </div>
  </main>;
}
