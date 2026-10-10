import Link from "next/link";
import { redirect } from "next/navigation";
import { getIdentity, getPrincipal } from "../../lib/auth/principal";
import { Navigation } from "@/components/ui/navigation";
import { Card } from "@/components/ui/card";
import { preload, visibleProjects } from "../../lib/documents/list";
import { isAdminPrincipal } from "../../lib/auth/authorize";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  // Start loading with the cookie identity while the session is verified (one round-trip saved).
  const preloaded = preload(await getIdentity());
  const principal = await getPrincipal();
  if (!principal) redirect("/");
  const projects = await visibleProjects(principal, preloaded);
  return <div className="shell project-shell"><Navigation admin={isAdminPrincipal(principal)} />
    <main className="portal projects-index"><div className="page-label">Projects</div><h1>Project library</h1>
      {projects.length ? <div className="project-grid">{projects.map((project) => <Card className="project-card" key={project.id}><Link className={`project-item${project.coverImageUrl ? " has-cover" : ""}`} href={`/projects/${project.slug}`}>
        {project.coverImageUrl && <div className="project-cover" style={{ backgroundImage: `url("${project.coverImageUrl}")` }} aria-hidden />}
        <div className="project-card-body"><h2>{project.name}</h2><p>{project.location}</p><span>{project.count} documents <i>·</i> {project.segments.length} disciplines</span></div>
      </Link></Card>)}</div> : <p>No projects are available for this account.</p>}
    </main></div>;
}
