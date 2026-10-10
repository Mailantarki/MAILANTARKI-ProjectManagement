import { getPrincipal } from "@/lib/auth/principal";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authorizeAdminOrganization, isAdminPrincipal } from "@/lib/auth/authorize";
import { getUserClient } from "@/lib/supabase/server";
import { AdminForm } from "../admin-form";
import { CreateCodeForm } from "./create-code-form";
import { setCodeActive, deleteAccessCode } from "./actions";
import { CodeStatus } from "./code-status";
import { formatDateTime } from "@/lib/format";
import { ExtendCodeButton } from "./extend-code";
import { UserDialog } from "../users/dialog";
import { PeopleTabs } from "../people-tabs";

// Request time for the expiry check (kept outside the component render).
const requestTime = () => Date.now();

export default async function AdminCodesPage({ searchParams }: { searchParams: Promise<{ page?: string; new?: string }> }) {
  const search = await searchParams;
  const page = z.coerce.number().int().min(1).max(100000).catch(1).parse(search.page);
  const user = await getUserClient();
  // Queries run under RLS, so they start while the session is verified; nothing renders unless the viewer is an admin.
  const [principal, { data: codes, error, count }, { data: organizations }, { data: projects },
    { data: segments }, { data: grants }] = await Promise.all([
    getPrincipal(),
    user.from("access_codes").select("id,organization_id,label,uses_count,max_uses,expires_at,is_active,allow_download,created_at", { count: "exact" })
      .is("deleted_at", null).order("created_at", { ascending: false }).range((page - 1) * 25, page * 25 - 1),
    user.from("organizations").select("id,name,archived_at"),
    user.from("projects").select("id,organization_id,name,archived_at"),
    user.from("segments").select("id,name").order("sort_order"),
    user.from("access_code_grants").select("access_code_id,project_id,segment_id"),
  ]);
  if (!isAdminPrincipal(principal)) redirect("/login");
  if (error) throw new Error("Could not load access codes");
  const availableOrganizations = (organizations ?? []).filter((org) => !org.archived_at && authorizeAdminOrganization(principal, org.id));
  const availableProjects = (projects ?? []).filter((project) => !project.archived_at);
  const now = requestTime();
  return <main className="main portal">
    <div className="admin-page-title"><h1>People &amp; access</h1>
      {!!availableOrganizations.length && <UserDialog title="New access code" label="New code" drawer primary defaultOpen={search.new === "1"}>
        <CreateCodeForm organizations={availableOrganizations} projects={availableProjects} segments={segments ?? []} />
      </UserDialog>}</div>
    <PeopleTabs active="guests" />
    <section className="admin-section"><h2 className="sr-only">Access codes</h2>
      <div className="table-scroll"><table className="document-table responsive-table codes-table"><thead><tr>
        <th>Label</th><th>Organization</th><th>Access</th><th>Uses</th><th>Expires</th><th>Status</th><th><span className="sr-only">Actions</span></th>
      </tr></thead><tbody>{(codes ?? []).map((code) => {
        const expired = !!code.expires_at && Date.parse(code.expires_at) <= now;
        return <tr key={code.id}>
        <td className="document-title">{code.label}</td><td data-label="Organization">{organizations?.find((org) => org.id === code.organization_id)?.name}</td>
        <td className="wide-cell" data-label="Access"><span className="grant-chips">{(grants ?? []).filter((grant) => grant.access_code_id === code.id).map((grant) =>
          <span className="grant-chip" key={`${grant.project_id}-${grant.segment_id}`}>{projects?.find((project) => project.id === grant.project_id)?.name ?? "Project"} · {segments?.find((segment) => segment.id === grant.segment_id)?.name ?? "All disciplines"}</span>)}</span></td>
        <td className="nowrap" data-label="Uses">{code.uses_count}{code.max_uses == null ? "" : ` / ${code.max_uses}`}</td>
        <td data-label="Expires">{code.expires_at ? formatDateTime(code.expires_at) : "Never"}</td>
        <td data-label="Status"><CodeStatus active={code.is_active} expiresAt={code.expires_at} /></td>
        <td className="document-actions"><div className="document-admin-actions">
          {/* Active → Revoke. Expired → Extend (revoking is pointless). Revoked → Reactivate (+ Extend if also expired). */}
          {(!code.is_active || !expired) && <AdminForm action={setCodeActive} label={code.is_active ? "Revoke" : "Reactivate"} danger={code.is_active}
            confirmMessage={code.is_active ? "Revoke this code immediately?" : undefined}
            successMessage={code.is_active ? "Code revoked" : "Code reactivated"}>
            <input type="hidden" name="id" value={code.id} />
            <input type="hidden" name="active" value={code.is_active ? "false" : "true"} />
          </AdminForm>}
          {expired && <ExtendCodeButton id={code.id} label={code.label} />}
          <AdminForm action={deleteAccessCode} label="Delete code" deleteIcon danger
          confirmMessage="Delete this access code permanently? Visitors will lose access. Access history will be preserved.">
          <input type="hidden" name="id" value={code.id} />
        </AdminForm></div></td>
      </tr>;
      })}</tbody></table></div>
      {!codes?.length && <p className="empty-results">No access codes yet.</p>}
      <div className="pagination">{page > 1 && <Link href={`/admin/codes?page=${page - 1}`}>Previous</Link>}
        <span>{page} / {Math.max(1, Math.ceil((count ?? 0) / 25))}</span>
        {page * 25 < (count ?? 0) && <Link href={`/admin/codes?page=${page + 1}`}>Next</Link>}
      </div>
    </section>
  </main>;
}
