import { getPrincipal } from "@/lib/auth/principal";
import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";
import { redirect } from "next/navigation";
import { authorizeSuperAdmin, authorizeAdminOrganization, authorizeUserSuspension, authorizeUserAssignment, isAdminPrincipal } from "@/lib/auth/authorize";
import { getUserClient } from "@/lib/supabase/server";
import { directorySchema, parseUserFilters } from "@/lib/admin/user-directory";
import { AdminForm } from "../admin-form";
import { CreateUserForm } from "./create-user-form";
import { grantUserAccess, removeUserAccess, setUserSuspended } from "./actions";
import { UserDialog } from "./dialog";
import { FilterForm } from "@/components/documents/filter-form";

const roles = { super_admin: "Super admin", org_admin: "Organization admin", member: "Member" };
export default async function AdminUsersPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseUserFilters(await searchParams);
  const user = await getUserClient();
  // The directory and the lookup lists are independent: fetch them in one parallel round.
  // Queries run under RLS, so they start while the session is verified; nothing renders unless the viewer is an admin.
  const [principal, { data, error }, { data: organizations }, { data: projects }, { data: segments }] = await Promise.all([
    getPrincipal(),
    user.rpc("admin_user_directory", {
      p_query: filters.q ?? "", p_role: filters.role ?? "", p_status: filters.status ?? "",
      p_project: filters.projectId ?? null, p_organization: filters.organizationId ?? null, p_page: filters.page ?? 1,
    }),
    user.from("organizations").select("id,name").is("archived_at", null).order("name"),
    user.from("projects").select("id,name,organization_id").is("archived_at", null).order("name"),
    user.from("segments").select("id,name").order("sort_order"),
  ]);
  if (!isAdminPrincipal(principal)) redirect("/login");
  if (error) throw new Error("Could not load users");
  const directory = directorySchema.parse(data);
  const { data: assignments } = directory.users.length
    ? await user.from("user_project_access").select("id,user_id,project_id,segment_id,can_download")
      .in("user_id", directory.users.map((profile) => profile.id))
    : { data: [] };
  const availableOrganizations = (organizations ?? []).filter((org) => authorizeAdminOrganization(principal, org.id));
  const isSuper = authorizeSuperAdmin(principal);
  const pages = Math.max(1, Math.ceil(directory.total / 25));
  const pageUrl = (page: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...filters, page })) if (value) params.set(key, String(value));
    return `/admin/users?${params}`;
  };
  return <main className="main portal users-page">
    <Link className="back-link" href="/admin"><ArrowLeft size={15} aria-hidden />Administration</Link>
    <div className="admin-page-title"><h1>Users</h1><UserDialog title="Create user" label="New user">
      <CreateUserForm organizations={availableOrganizations} canCreateSuper={isSuper} />
    </UserDialog></div>
    <FilterForm className="user-filters" activeCount={[filters.projectId, filters.role, filters.status, filters.organizationId].filter(Boolean).length}
      search={<label>Search<input name="q" type="search" placeholder="Name or email" defaultValue={filters.q ?? ""} maxLength={120} autoComplete="off" /></label>}>
      <label>Project<select name="projectId" defaultValue={filters.projectId ?? ""}><option value="">All projects</option>
        {(projects ?? []).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      <label>Role<select name="role" defaultValue={filters.role ?? ""}><option value="">All roles</option>
        {Object.entries(roles).filter(([role]) => isSuper || role !== "super_admin").map(([role, name]) => <option key={role} value={role}>{name}</option>)}</select></label>
      <label>Status<select name="status" defaultValue={filters.status ?? ""}><option value="">All statuses</option>
        <option value="active">Active</option><option value="suspended">Suspended</option><option value="pending">Password change required</option></select></label>
      {isSuper && <label>Organization<select name="organizationId" defaultValue={filters.organizationId ?? ""}><option value="">All organizations</option>
        {availableOrganizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label>}
      <Link className="clear-filters" href="/admin/users">Clear</Link>
    </FilterForm>
    <p className="results-count">{directory.total} users</p>
    <div className="table-scroll"><table className="document-table users-table"><thead><tr>
      <th>User</th><th>Role</th><th>Access</th><th>Status</th><th>Last sign-in</th><th>Actions</th>
    </tr></thead><tbody>{directory.users.map((profile) => {
      const grants = (assignments ?? []).filter((grant) => grant.user_id === profile.id);
      const ownedProjects = (projects ?? []).filter((project) => authorizeUserAssignment(principal, profile.id,
        profile.organization_id, profile.role, project.organization_id));
      const suspended = !!profile.suspended_at;
      const status = suspended ? "Suspended" : profile.must_change_password ? "Password change required" : "Active";
      return <tr key={profile.id}>
        <td data-label="User"><strong>{profile.full_name}</strong><span className="user-meta">{profile.email}</span>
          {isSuper && <span className="user-meta">{profile.organization_name ?? "All organizations"}</span>}</td>
        <td data-label="Role">{roles[profile.role]}</td><td data-label="Access">{profile.role === "member" ? `${profile.project_count} ${profile.project_count === 1 ? "project" : "projects"}` : "Role-based access"}</td>
        <td data-label="Status"><span className={`status-badge ${suspended ? "status-revoked" : profile.must_change_password ? "status-draft" : "status-active"}`}>{status}</span></td>
        <td data-label="Last sign-in">{profile.last_sign_in_at ? <time dateTime={profile.last_sign_in_at} title={profile.last_sign_in_at}>
          {new Date(profile.last_sign_in_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC</time> : "No sign-in recorded"}</td>
        <td data-label="Actions"><div className="user-actions"><UserDialog title={profile.full_name} label="Manage" drawer>
          <p className="user-meta">{profile.email}</p><p>{roles[profile.role]} · {status}</p>
          <h3>Project access</h3>
          {profile.role !== "member" && <p>Access is inherited from the administrator role.</p>}
          {grants.map((grant) => <div className="user-grant" key={grant.id}>
            <strong>{projects?.find((p) => p.id === grant.project_id)?.name ?? "Archived project"}</strong>
            <span>{segments?.find((s) => s.id === grant.segment_id)?.name ?? "All disciplines"}{grant.can_download ? " · Download allowed" : ""}</span>
            {ownedProjects.some((p) => p.id === grant.project_id) && <AdminForm action={removeUserAccess} label="Remove access" danger
              confirmMessage={`Remove this project/discipline assignment from ${profile.full_name}?`}>
              <input type="hidden" name="assignmentId" value={grant.id} /></AdminForm>}
          </div>)}
          {!grants.length && profile.role === "member" && <p>No project assignments.</p>}
          {!!ownedProjects.length && <section className="user-panel-section"><h3>Assign access</h3><AdminForm action={grantUserAccess} label="Assign access">
            <input type="hidden" name="userId" value={profile.id} />
            <label className="field">Project<select name="projectId">{ownedProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label className="field">Discipline<select name="segmentId"><option value="">All disciplines</option>{(segments ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <label className="check-field"><input type="checkbox" name="canDownload" />Allow download</label>
          </AdminForm></section>}
          {authorizeUserSuspension(principal, profile) && <section className="user-panel-section"><h3>Account status</h3>
            <AdminForm action={setUserSuspended} label={suspended ? "Reactivate user" : "Suspend user"} danger={!suspended}
              confirmMessage={suspended ? `Restore portal access for ${profile.full_name}? Existing assignments will be retained.` : `Suspend ${profile.full_name}? Portal access will be blocked, including existing sessions. Assignments and history will be retained.`}>
              <input type="hidden" name="userId" value={profile.id} /><input type="hidden" name="suspended" value={String(!suspended)} />
            </AdminForm></section>}
        </UserDialog><Link className="user-icon" href={`/admin/logs?userId=${profile.id}`} title="View user logs" aria-label="View user logs"><History size={18} aria-hidden /></Link></div></td>
      </tr>;
    })}</tbody></table></div>
    {!directory.users.length && <div className="empty-results">No matching users. <Link href="/admin/users">Clear filters</Link></div>}
    <nav className="pagination" aria-label="User pages">{directory.page > 1 && <Link href={pageUrl(directory.page - 1)}>Previous</Link>}
      <span>Page {directory.page} of {pages}</span>{directory.page < pages && <Link href={pageUrl(directory.page + 1)}>Next</Link>}</nav>
  </main>;
}
