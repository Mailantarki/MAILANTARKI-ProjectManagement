import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserClient } from "@/lib/supabase/server";
import { getPrincipal } from "@/lib/auth/principal";
import { authorizeAdminOrganization, isAdminPrincipal } from "@/lib/auth/authorize";
import { isStoragePath, signStorageUrls } from "@/lib/storage/signed-urls";
import { AdminForm } from "../admin-form";
import { saveProject, setProjectArchived } from "../manage-actions";
import { CoverImageField } from "./cover-image-field";
import { NameSlugFields } from "./name-slug-fields";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";

export default async function AdminProjectsPage() {
  const user = await getUserClient();
  // Queries run under RLS, so they start while the session is verified; nothing renders unless the viewer is an admin.
  const [principal, { data: projects, error }, { data: organizations }] = await Promise.all([
    getPrincipal(),
    user.from("projects").select("id,organization_id,name,slug,location,description,cover_image_url,is_public,archived_at")
      .order("name"),
    user.from("organizations").select("id,name,archived_at").order("name"),
  ]);
  if (!isAdminPrincipal(principal)) redirect("/login");
  if (error) throw new Error("Could not load projects");
  const available = (organizations ?? []).filter((org) => !org.archived_at && authorizeAdminOrganization(principal, org.id));
  const signed = await signStorageUrls("project-covers",
    (projects ?? []).map((project) => project.cover_image_url).filter(isStoragePath));
  const previews = new Map((projects ?? []).map((project) => [project.id,
    isStoragePath(project.cover_image_url) ? signed.get(project.cover_image_url) ?? null : project.cover_image_url] as const));
  return <main className="main portal"><Link className="back-link" href="/admin"><ArrowLeft size={15} aria-hidden />Administration</Link><p className="eyebrow">Administration</p><h1>Projects</h1>
    {!!available.length && <Card className="new-project"><h2>New project</h2>
      <AdminForm action={saveProject} label="Create project">
        <label className="field">Organization<select name="organizationId">{available.map((org) =>
          <option key={org.id} value={org.id}>{org.name}</option>)}</select></label>
        <NameSlugFields />
        <label className="field">Location<input name="location" maxLength={160} /></label>
        <details className="new-project-options"><summary>Additional details</summary>
        <label className="field">Description<textarea name="description" maxLength={2000} /></label>
        <CoverImageField />
        <label className="check-field"><input name="isPublic" type="checkbox" /> Public listing</label>
        </details>
      </AdminForm></Card>}
    <section className="admin-section"><h2>Active</h2>
      <div className="admin-project-grid">
      {(projects ?? []).filter((project) => !project.archived_at).map((project) =>
        <Card className="admin-record project-admin-card" key={project.id}>
          <div><h3 className="card-title">{project.name}</h3><p className="card-meta">{project.location}</p></div>
          <div className="card-actions">
            <Link href={`/admin/projects/${project.slug}/documents`}>Manage documents</Link>
            <Link href={`/admin/projects/${project.slug}/documents/new`}>Upload PDFs</Link>
            <AdminForm action={setProjectArchived} label="Archive" danger confirmMessage={`Archive ${project.name}?`}>
              <input type="hidden" name="id" value={project.id} /><input type="hidden" name="archived" value="true" />
            </AdminForm>
          </div>
          <details className="project-editor"><summary>Edit project</summary>
          <AdminForm action={saveProject} label="Save changes">
            <input type="hidden" name="id" value={project.id} />
            <input type="hidden" name="organizationId" value={project.organization_id} />
            <NameSlugFields defaultName={project.name} defaultSlug={project.slug} />
            <label className="field">Location<input name="location" defaultValue={project.location ?? ""} /></label>
            <label className="field">Description<textarea name="description" defaultValue={project.description ?? ""} /></label>
            <CoverImageField currentPreviewUrl={previews.get(project.id)} projectId={project.id} />
            <label className="check-field"><input name="isPublic" type="checkbox" defaultChecked={project.is_public} /> Public listing</label>
          </AdminForm>
          </details>
        </Card>)}
      </div>
      {!projects?.some((project) => !project.archived_at) && <p className="empty-results">No active projects.</p>}
    </section>
    <section className="admin-section"><h2>Archived</h2>
      {(projects ?? []).filter((project) => project.archived_at).map((project) =>
        <Card className="admin-record project-admin-card" key={project.id}><strong>{project.name}</strong>
          <Link href={`/admin/projects/${project.slug}/documents`}>Documents</Link>
          <AdminForm action={setProjectArchived} label="Restore">
            <input type="hidden" name="id" value={project.id} /><input type="hidden" name="archived" value="false" />
          </AdminForm></Card>)}
      {!projects?.some((project) => project.archived_at) && <p className="empty-results">No archived projects.</p>}
    </section>
  </main>;
}
