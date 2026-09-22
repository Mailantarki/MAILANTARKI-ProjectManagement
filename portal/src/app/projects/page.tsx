import Link from "next/link";
import { redirect } from "next/navigation";
import { getPrincipal } from "../../lib/auth/principal";
import { copy } from "../../lib/copy";
import { visibleProjects } from "../../lib/documents/list";
import { signOut } from "./sign-out";
import { isAdminPrincipal } from "../../lib/auth/authorize";
import { LogOut, Settings } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const principal = await getPrincipal();
  if (!principal) redirect("/");
  const projects = await visibleProjects(principal);
  return <div className="shell project-shell"><header className="topbar"><Link className="brand" href="/projects">{copy.brand}</Link><div className="topbar-links">
    {isAdminPrincipal(principal) && <Link className="topbar-action" href="/admin"><Settings size={15} aria-hidden />Admin</Link>}
    <form action={signOut}><button className="topbar-action" type="submit"><LogOut size={15} aria-hidden />{copy.signOut}</button></form>
  </div></header>
    <main className="portal projects-index"><div className="page-label">Projects</div><h1>Project library</h1>
      {projects.length ? <div className="project-grid">{projects.map((project) => <Link className={`project-item${project.coverImageUrl ? " has-cover" : ""}`} href={`/projects/${project.slug}`} key={project.id}>
        {project.coverImageUrl && <div className="project-cover" style={{ backgroundImage: `url("${project.coverImageUrl}")` }} aria-hidden />}
        <div className="project-card-body"><h2>{project.name}</h2><p>{project.location}</p><span>{project.count} documents <i>·</i> {project.segments.length} disciplines</span></div>
      </Link>)}</div> : <p>No projects are available for this account.</p>}
    </main></div>;
}
