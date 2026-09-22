import { getPrincipal } from "@/lib/auth/principal";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authorizeAdminOrganization, isAdminPrincipal } from "@/lib/auth/authorize";
import { getUserClient } from "@/lib/supabase/server";
import { AdminForm } from "../admin-form";
import { CreateCodeForm } from "./create-code-form";
import { setCodeActive } from "./actions";
import { CodeStatus } from "./code-status";

export default async function AdminCodesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const principal = await getPrincipal();
  if (!isAdminPrincipal(principal)) redirect("/login");
  const page = z.coerce.number().int().min(1).max(100000).catch(1).parse((await searchParams).page);
  const user = await getUserClient();
  const [{ data: codes, error, count }, { data: organizations }, { data: projects },
    { data: segments }, { data: grants }] = await Promise.all([
    user.from("access_codes").select("id,organization_id,label,uses_count,max_uses,expires_at,is_active,allow_download,created_at", { count: "exact" })
      .order("created_at", { ascending: false }).range((page - 1) * 25, page * 25 - 1),
    user.from("organizations").select("id,name,archived_at"),
    user.from("projects").select("id,organization_id,name,archived_at"),
    user.from("segments").select("id,name"),
    user.from("access_code_grants").select("access_code_id,project_id,segment_id"),
  ]);
  if (error) throw new Error("Could not load access codes");
  const availableOrganizations = (organizations ?? []).filter((org) => !org.archived_at && authorizeAdminOrganization(principal, org.id));
  const availableProjects = (projects ?? []).filter((project) => !project.archived_at);
  return <main className="main portal"><h1>Access codes</h1>
    <section className="admin-section"><h2>Create code</h2>
      <CreateCodeForm organizations={availableOrganizations} projects={availableProjects} segments={segments ?? []} />
    </section>
    <section className="admin-section"><h2>Issued codes</h2>
      <div className="table-scroll"><table className="document-table"><thead><tr>
        <th>Label</th><th>Organization</th><th>Grants</th><th>Uses</th><th>Expires</th><th>Status</th><th>Action</th>
      </tr></thead><tbody>{(codes ?? []).map((code) => <tr key={code.id}>
        <td>{code.label}</td><td>{organizations?.find((org) => org.id === code.organization_id)?.name}</td>
        <td>{(grants ?? []).filter((grant) => grant.access_code_id === code.id).map((grant) =>
          `${projects?.find((project) => project.id === grant.project_id)?.name ?? "Project"} / ${segments?.find((segment) => segment.id === grant.segment_id)?.name ?? "All disciplines"}`).join(", ")}</td>
        <td>{code.uses_count}{code.max_uses == null ? "" : ` / ${code.max_uses}`}</td>
        <td>{code.expires_at ? new Date(code.expires_at).toLocaleString("en-GB") : "Never"}</td>
        <td><CodeStatus active={code.is_active} expiresAt={code.expires_at} /></td>
        <td><AdminForm action={setCodeActive} label={code.is_active ? "Revoke" : "Reactivate"}
          confirmMessage={code.is_active ? "Revoke this code immediately?" : undefined}>
          <input type="hidden" name="id" value={code.id} />
          <input type="hidden" name="active" value={code.is_active ? "false" : "true"} />
        </AdminForm></td>
      </tr>)}</tbody></table></div>
      {!codes?.length && <p className="empty-results">No access codes yet.</p>}
      <div className="pagination">{page > 1 && <Link href={`/admin/codes?page=${page - 1}`}>Previous</Link>}
        <span>{page} / {Math.max(1, Math.ceil((count ?? 0) / 25))}</span>
        {page * 25 < (count ?? 0) && <Link href={`/admin/codes?page=${page + 1}`}>Next</Link>}
      </div>
    </section>
  </main>;
}
