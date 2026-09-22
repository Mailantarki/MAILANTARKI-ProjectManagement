import Link from "next/link";
import { getUserClient } from "@/lib/supabase/server";

export default async function AdminPage() {
  const user = await getUserClient();
  const { data: projects } = await user.from("projects").select("id,name,slug,location")
    .is("archived_at", null).order("name");
  return <main className="main portal"><h1>Administration</h1><h2>Projects</h2>
    <div className="table-scroll"><table className="document-table"><thead><tr><th>Project</th><th>Location</th><th>Documents</th></tr></thead>
      <tbody>{(projects ?? []).map((project) => <tr key={project.id}><td>{project.name}</td><td>{project.location}</td>
        <td><Link href={`/admin/projects/${project.slug}/documents/new`}>Upload PDFs</Link></td></tr>)}</tbody></table></div>
  </main>;
}
