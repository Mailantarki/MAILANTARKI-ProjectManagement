import Link from "next/link";
import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/principal";
import { isAdminPrincipal } from "@/lib/auth/authorize";
import { getUserClient } from "@/lib/supabase/server";

export default async function AdminPage() {
  if (!isAdminPrincipal(await getPrincipal())) redirect("/login");
  const user = await getUserClient();
  const { data: projects } = await user.from("projects").select("id,name,slug,location")
    .is("archived_at", null).order("name");
  return <main className="main portal"><h1>Administration</h1><div className="admin-quick-links">
    <Link href="/admin/organizations">Organizations</Link><Link href="/admin/projects">Projects</Link>
    <Link href="/admin/users">Users</Link><Link href="/admin/codes">Access codes</Link>
    <Link href="/admin/logs">Access logs</Link></div><h2>Projects</h2>
    <div className="table-scroll"><table className="document-table"><thead><tr><th>Project</th><th>Location</th><th>Documents</th></tr></thead>
      <tbody>{(projects ?? []).map((project) => <tr key={project.id}><td>{project.name}</td><td>{project.location}</td>
        <td><span className="table-actions"><Link href={`/admin/projects/${project.slug}/documents`}>Manage</Link>
          <Link href={`/admin/projects/${project.slug}/documents/new`}>Upload PDFs</Link></span></td></tr>)}</tbody></table></div>
  </main>;
}
