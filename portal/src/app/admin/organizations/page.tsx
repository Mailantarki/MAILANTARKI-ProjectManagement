import { getUserClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/principal";
import { authorizeSuperAdmin, isAdminPrincipal } from "@/lib/auth/authorize";
import { AdminForm } from "../admin-form";
import { saveOrganization, setOrganizationArchived } from "../manage-actions";

export default async function OrganizationsPage() {
  const principal = await getPrincipal();
  if (!isAdminPrincipal(principal)) redirect("/login");
  const user = await getUserClient();
  const { data: organizations, error } = await user.from("organizations")
    .select("id,name,logo_url,archived_at").order("name");
  if (error) throw new Error("Could not load organizations");
  return <main className="main portal"><h1>Organizations</h1>
    {authorizeSuperAdmin(principal) && <section className="admin-section"><h2>New organization</h2>
      <AdminForm action={saveOrganization} label="Create organization">
        <label className="field">Name<input name="name" required maxLength={120} /></label>
        <label className="field">Logo URL<input name="logoUrl" type="url" /></label>
      </AdminForm></section>}
    <section className="admin-section"><h2>Active</h2>
      {(organizations ?? []).filter((org) => !org.archived_at).map((org) => <div className="admin-record" key={org.id}>
        <strong>{org.name}</strong>
        <AdminForm action={saveOrganization} label="Save changes">
          <input type="hidden" name="id" value={org.id} />
          <label className="field">Name<input name="name" defaultValue={org.name} required maxLength={120} /></label>
          <label className="field">Logo URL<input name="logoUrl" type="url" defaultValue={org.logo_url ?? ""} /></label>
        </AdminForm>
        <AdminForm action={setOrganizationArchived} label="Archive" confirmMessage={`Archive ${org.name} and hide its projects?`}>
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
