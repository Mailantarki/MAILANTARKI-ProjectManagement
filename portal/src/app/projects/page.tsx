import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Clock3 } from "lucide-react";
import { getIdentity, getPrincipal } from "../../lib/auth/principal";
import { getViewer } from "@/lib/auth/viewer";
import { Card } from "@/components/ui/card";
import { ProjectAvatar } from "@/components/shell/project-avatar";
import { MarkSeenButton } from "@/components/updates/mark-seen";
import { preload, visibleProjects } from "../../lib/documents/list";
import { recentlyViewed, updatesFeed, type Update } from "@/lib/updates/feed";
import { formatRelative } from "@/lib/format";

export const dynamic = "force-dynamic";

const PER_PROJECT = 5;
const badge = { new: "New", updated: "Updated", status: "Status" } as const;
const fixedLink = (slug: string, update: Update) => `/projects/${slug}/documents/${encodeURIComponent(update.docNumber)}`;

export default async function HomePage() {
  // Start loading with the cookie identity while the session is verified (one round-trip saved).
  const preloaded = preload(await getIdentity());
  const principal = await getPrincipal();
  if (!principal) redirect("/");
  const [projects, feed, recent, viewer] = await Promise.all([
    visibleProjects(principal, preloaded), updatesFeed(principal), recentlyViewed(principal), getViewer(principal),
  ]);
  // With a single project there is nothing to choose: go straight to it.
  if (projects.length === 1) redirect(`/projects/${projects[0].slug}`);

  const withUpdates = feed.feeds.filter((f) => f.updates.length);
  const updatesBy = new Map(feed.feeds.map((f) => [f.projectId, f.updates.length]));
  const firstName = viewer.kind === "user" ? viewer.name.split(/\s+/)[0] : viewer.name;
  const summary = feed.total
    ? `${feed.total} ${feed.total === 1 ? "update" : "updates"} in ${withUpdates.length} ${withUpdates.length === 1 ? "project" : "projects"} since your last visit.`
    : "You're up to date. Nothing has changed since your last visit.";

  return <main className="portal home">
    <header className="home-header">
      <div><h1>Welcome back{firstName ? `, ${firstName}` : ""}</h1><p role="status">{summary}</p></div>
      {feed.total > 0 && <MarkSeenButton />}
    </header>

    {withUpdates.length > 0 && <section className="home-section" aria-labelledby="updates-title">
      <h2 id="updates-title" className="sr-only">Updates since your last visit</h2>
      <div className="update-groups">{withUpdates.map((group) => <Card key={group.projectId} className="update-group">
        <header><ProjectAvatar name={group.name} /><Link href={`/projects/${group.slug}`}><strong>{group.name}</strong></Link>
          <span className="update-count">{group.updates.length} {group.updates.length === 1 ? "update" : "updates"}</span></header>
        <ul>{group.updates.slice(0, PER_PROJECT).map((update) => <li key={update.documentId}>
          <Link href={fixedLink(group.slug, update)}>
            <span className={`update-badge update-${update.kind}`}>{badge[update.kind]}</span>
            <span className="update-number">{update.docNumber}</span>
            <span className="update-title">{update.title}</span>
            <span className="update-detail">{update.detail}</span>
            <time dateTime={update.at}>{formatRelative(update.at)}</time>
          </Link></li>)}</ul>
        {group.updates.length > PER_PROJECT && <Link className="update-more" href={`/projects/${group.slug}?segment=all&updated=1`}>
          Show all {group.updates.length} <ArrowRight size={14} aria-hidden /></Link>}
      </Card>)}</div>
    </section>}

    {recent.length > 0 && <section className="home-section" aria-labelledby="recent-title">
      <h2 id="recent-title">Recently viewed</h2>
      <ul className="recent-list">{recent.map((doc) => <li key={doc.id}><Link href={doc.href}>
        <Clock3 size={15} aria-hidden /><span className="update-number">{doc.docNumber}</span>
        <span className="update-title">{doc.title}</span><span className="recent-project">{doc.projectName}</span>
      </Link></li>)}</ul>
    </section>}

    <section className="home-section" aria-labelledby="projects-title">
      <h2 id="projects-title">All projects</h2>
      {projects.length ? <div className="project-grid">{projects.map((project) => {
        const fresh = updatesBy.get(project.id) ?? 0;
        return <Card className="project-card" key={project.id}><Link className={`project-item${project.coverImageUrl ? " has-cover" : ""}`} href={`/projects/${project.slug}`}>
          {project.coverImageUrl && <div className="project-cover" style={{ backgroundImage: `url("${project.coverImageUrl}")` }} aria-hidden />}
          <div className="project-card-body"><h3>{project.name}</h3><p>{project.location}</p>
            <span>{project.count} documents <i>·</i> {project.segments.length} disciplines
              {fresh > 0 && <b className="project-new">{fresh} new</b>}</span></div>
        </Link></Card>;
      })}</div> : <p>No projects are available for this account.</p>}
    </section>
  </main>;
}
