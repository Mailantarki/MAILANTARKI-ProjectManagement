import { getPrincipal } from "@/lib/auth/principal";
import { redirect } from "next/navigation";
import { authorizeSuperAdmin, isAdminPrincipal } from "@/lib/auth/authorize";
import { getUserClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { AdminForm } from "../admin-form";
import { CreateUserForm } from "./create-user-form";
import { grantUserAccess, removeUserAccess } from "./actions";

export default async function AdminUsersPage() {
  const principal = await getPrincipal();
  if (!isAdminPrincipal(principal)) redirect("/login");
  const user = await getUserClient();
  const [{ data: profiles, error }, { data: organizations }, { data: projects }, { data: segments },
    { data: assignments }] = await Promise.all([
    user.from("profiles").select("id,organization_id,role,full_name").order("full_name"),
    user.from("organizations").select("id,name,archived_at").order("name"),
    user.from("projects").select("id,name,organization_id,archived_at").order("name"),
    user.from("segments").select("id,name").order("sort_order"),
    user.from("user_project_access").select("id,user_id,project_id,segment_id,can_download"),
  ]);
  if (error) throw new Error("Could not load users");
  const emails = new Map<string, string>();
  const admin = getAdminClient();
  let page = 1;
  while (true) {
    const { data, error: authError } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (authError) throw new Error("Could not load user emails");
    for (const authUser of data.users) if (authUser.email) emails.set(authUser.id, authUser.email);
    if (!data.nextPage) break;
    page = data.nextPage;
  }
  const activeOrganizations = (organizations ?? []).filter((org) => !org.archived_at);
  const activeProjects = (projects ?? []).filter((project) => !project.archived_at);
  return <main className="main portal"><h1>Users</h1>
    <section className="admin-section"><h2>Create user</h2>
      <CreateUserForm organizations={activeOrganizations} canCreateSuper={authorizeSuperAdmin(principal)} />
    </section>
    <section className="admin-section"><h2>People</h2>
      {(profiles ?? []).map((profile) => {
        const ownedProjects = activeProjects.filter((project) => project.organization_id === profile.organization_id);
        const grants = (assignments ?? []).filter((grant) => grant.user_id === profile.id);
        return <div className="admin-record" key={profile.id}>
          <div className="admin-record-heading"><strong>{profile.full_name}</strong><span>{profile.role.replaceAll("_", " ")}</span></div>
          <div className="muted">{emails.get(profile.id) ?? "Auth user removed"} · {organizations?.find((org) => org.id === profile.organization_id)?.name ?? "All organizations"}</div>
          {grants.length > 0 && <ul className="assignment-list">{grants.map((grant) => <li key={grant.id}>
            <span>{projects?.find((project) => project.id === grant.project_id)?.name ?? "Project"} / {segments?.find((segment) => segment.id === grant.segment_id)?.name ?? "All disciplines"}{grant.can_download ? " · Download" : ""}</span>
            <AdminForm action={removeUserAccess} label="Remove" confirmMessage="Remove this assignment?">
              <input type="hidden" name="assignmentId" value={grant.id} />
            </AdminForm>
          </li>)}</ul>}
          {profile.role !== "super_admin" && profile.id !== (principal?.kind === "user" ? principal.userId : "") && !!ownedProjects.length &&
            <AdminForm action={grantUserAccess} label="Assign access">
              <input type="hidden" name="userId" value={profile.id} />
              <label className="field">Project<select name="projectId">{ownedProjects.map((project) =>
                <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
              <label className="field">Discipline<select name="segmentId"><option value="">All disciplines</option>
                {(segments ?? []).map((segment) => <option key={segment.id} value={segment.id}>{segment.name}</option>)}</select></label>
              <label className="check-field"><input name="canDownload" type="checkbox" /> Allow download</label>
            </AdminForm>}
        </div>;
      })}
      {!profiles?.length && <p className="empty-results">No users in this organization.</p>}
    </section>
  </main>;
}
