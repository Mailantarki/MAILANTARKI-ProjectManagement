import { getUserClient } from "@/lib/supabase/server";
import { isStoragePath, signStorageUrls } from "@/lib/storage/signed-urls";
import { LogoField } from "./logo-field";
import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/principal";
import { authorizeSuperAdmin, isAdminPrincipal } from "@/lib/auth/authorize";
import { AdminForm } from "../admin-form";
import { saveOrganization, setOrganizationArchived } from "../manage-actions";

export default async function OrganizationsPage() {
  const user = await getUserClient();
  // Queries run under RLS, so they start while the session is verified; nothing renders unless the viewer is an admin.
  const [principal, { data: organizations, error }] = await Promise.all([
    getPrincipal(),
    user.from("organizations").select("id,name,logo_url,archived_at").order("name"),
  ]);
  if (!isAdminPrincipal(principal)) redirect("/login");
  if (error) throw new Error("Could not load organizations");
  const signed = await signStorageUrls("project-covers",
    (organizations ?? []).map((org) => org.logo_url).filter(isStoragePath));
  const previews = new Map((organizations ?? []).map((org) => [org.id,
    isStoragePath(org.logo_url) ? signed.get(org.logo_url) ?? null : org.logo_url] as const));
  return <main className="main portal"><h1>Organizations</h1>
    {authorizeSuperAdmin(principal) && <section className="admin-section"><h2>New organization</h2>
      <AdminForm action={saveOrganization} label="Create organization">
        <label className="field">Name<input name="name" required maxLength={120} /></label>
        <LogoField />
      </AdminForm></section>}
    <section className="admin-section"><h2>Active</h2>
      {(organizations ?? []).filter((org) => !org.archived_at).map((org) => <div className="admin-record" key={org.id}>
        <strong>{org.name}</strong>
        <AdminForm action={saveOrganization} label="Save changes">
          <input type="hidden" name="id" value={org.id} />
          <label className="field">Name<input name="name" defaultValue={org.name} required maxLength={120} /></label>
          <LogoField key={org.logo_url ?? "empty"} previewUrl={previews.get(org.id)} />
        </AdminForm>
        <AdminForm action={setOrganizationArchived} label="Archive" danger confirmMessage={`Archive ${org.name} and hide its projects?`}>
          <input type="hidden" name="id" value={org.id} /><input type="hidden" name="archived" value="true" />
        </AdminForm>
      </div>)}
      {!organizations?.some((org) => !org.archived_at) && <p className="empty-results">No active organizations.</p>}
    </section>
    <section className="admin-section"><h2>Archived</h2>
      {(organizations ?? []).filter((org) => org.archived_at).map((org) => <div className="admin-record" key={org.id}>
        <strong>{org.name}</strong><AdminForm action={setOrganizationArchived} label="Restore">
          <input type="hidden" name="id" value={org.id} /><input type="hidden" name="archived" value="false" />
        </AdminForm>
      </div>)}
      {!organizations?.some((org) => org.archived_at) && <p className="empty-results">No archived organizations.</p>}
    </section>
  </main>;
}
