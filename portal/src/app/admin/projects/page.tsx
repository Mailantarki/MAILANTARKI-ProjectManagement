import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserClient } from "@/lib/supabase/server";
import { getPrincipal } from "@/lib/auth/principal";
import { authorizeAdminOrganization, isAdminPrincipal } from "@/lib/auth/authorize";
import { AdminForm } from "../admin-form";
import { saveProject, setProjectArchived } from "../manage-actions";

export default async function AdminProjectsPage() {
  const principal = await getPrincipal();
  if (!isAdminPrincipal(principal)) redirect("/login");
  const user = await getUserClient();
  const [{ data: projects, error }, { data: organizations }] = await Promise.all([
    user.from("projects").select("id,organization_id,name,slug,location,description,cover_image_url,is_public,archived_at")
      .order("name"),
    user.from("organizations").select("id,name,archived_at").order("name"),
  ]);
  if (error) throw new Error("Could not load projects");
  const available = (organizations ?? []).filter((org) => !org.archived_at && authorizeAdminOrganization(principal, org.id));
  return <main className="main portal"><h1>Projects</h1>
    {!!available.length && <section className="admin-section"><h2>New project</h2>
      <AdminForm action={saveProject} label="Create project">
        <label className="field">Organization<select name="organizationId">{available.map((org) =>
          <option key={org.id} value={org.id}>{org.name}</option>)}</select></label>
        <label className="field">Name<input name="name" required maxLength={160} /></label>
        <label className="field">Slug<input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={100} /></label>
        <label className="field">Location<input name="location" maxLength={160} /></label>
        <label className="field">Description<textarea name="description" maxLength={2000} /></label>
        <label className="field">Cover image URL<input name="coverImageUrl" type="url" /></label>
        <label className="check-field"><input name="isPublic" type="checkbox" /> Public listing</label>
      </AdminForm></section>}
    <section className="admin-section"><h2>Active</h2>
      {(projects ?? []).filter((project) => !project.archived_at).map((project) =>
        <div className="admin-record" key={project.id}>
          <div className="admin-record-heading"><strong>{project.name}</strong>
            <Link href={`/admin/projects/${project.slug}/documents`}>Documents</Link>
            <Link href={`/admin/projects/${project.slug}/documents/new`}>Upload PDFs</Link></div>
          <AdminForm action={saveProject} label="Save changes">
            <input type="hidden" name="id" value={project.id} />
            <input type="hidden" name="organizationId" value={project.organization_id} />
            <label className="field">Name<input name="name" defaultValue={project.name} required maxLength={160} /></label>
            <label className="field">Slug<input name="slug" defaultValue={project.slug} required pattern="[a-z0-9]+(-[a-z0-9]+)*" /></label>
            <label className="field">Location<input name="location" defaultValue={project.location ?? ""} /></label>
            <label className="field">Description<textarea name="description" defaultValue={project.description ?? ""} /></label>
            <label className="field">Cover image URL<input name="coverImageUrl" type="url" defaultValue={project.cover_image_url ?? ""} /></label>
            <label className="check-field"><input name="isPublic" type="checkbox" defaultChecked={project.is_public} /> Public listing</label>
          </AdminForm>
          <AdminForm action={setProjectArchived} label="Archive" confirmMessage={`Archive ${project.name}?`}>
            <input type="hidden" name="id" value={project.id} /><input type="hidden" name="archived" value="true" />
          </AdminForm>
        </div>)}
      {!projects?.some((project) => !project.archived_at) && <p className="empty-results">No active projects.</p>}
    </section>
    <section className="admin-section"><h2>Archived</h2>
      {(projects ?? []).filter((project) => project.archived_at).map((project) =>
        <div className="admin-record" key={project.id}><strong>{project.name}</strong>
          <Link href={`/admin/projects/${project.slug}/documents`}>Documents</Link>
          <AdminForm action={setProjectArchived} label="Restore">
            <input type="hidden" name="id" value={project.id} /><input type="hidden" name="archived" value="false" />
          </AdminForm></div>)}
      {!projects?.some((project) => project.archived_at) && <p className="empty-results">No archived projects.</p>}
    </section>
  </main>;
}
