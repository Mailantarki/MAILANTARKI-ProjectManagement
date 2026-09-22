import Link from "next/link";
import { redirect } from "next/navigation";
import { getPrincipal } from "../../lib/auth/principal";
import { copy } from "../../lib/copy";
import { visibleProjects } from "../../lib/documents/list";
import { signOut } from "./sign-out";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const principal = await getPrincipal();
  if (!principal) redirect("/");
  const projects = await visibleProjects(principal);
  return <div className="shell"><header className="topbar"><Link className="brand" href="/">{copy.brand}</Link><form action={signOut}><button type="submit">{copy.signOut}</button></form></header>
    <main className="main portal"><div className="eyebrow">DOCUMENT LIBRARY</div><h1>Projects</h1>
      {projects.length ? <div className="project-grid">{projects.map((project) => <Link className="project-item" href={`/projects/${project.slug}`} key={project.id}>
        <h2>{project.name}</h2><p>{project.location}</p><span>{project.count} documents · {project.segments.length} disciplines</span>
      </Link>)}</div> : <p>No projects are available for this account.</p>}
    </main></div>;
}
